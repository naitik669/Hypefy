"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Phone, Mic, MicOff, Video, VideoOff, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { startRing, stopRing } from "@/lib/ringtone";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Group calls — a mesh of peer connections (one per other participant), capped
 * small since there's no SFU. Completely separate from the 1:1 CallProvider so
 * DM calling is untouched. Signalling: a per-call broadcast channel with
 * to/from-addressed offer/answer/ice; a deterministic rule (greater userId
 * initiates each pair) avoids offer glare. Ringing rides a per-user channel.
 */

type CallType = "audio" | "video";
type Member = {
  id: string;
  name: string;
  hue: number;
  avatarUrl?: string | null;
};

type StartArgs = {
  conversationId: string;
  title: string;
  type: CallType;
  members: Member[]; // everyone in the group EXCEPT me
};

type ActiveGroupCall = {
  id: string;
  conversationId: string;
  title: string;
  type: CallType;
  members: Member[];
};

type Incoming = {
  callId: string;
  conversationId: string;
  title: string;
  type: CallType;
  starterName: string;
};

const RTC_CONFIG: RTCConfiguration = (() => {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turn = process.env.NEXT_PUBLIC_TURN_URLS;
  if (turn) {
    iceServers.push({
      urls: turn
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return { iceServers };
})();

type Ctx = { startGroupCall: (a: StartArgs) => void; inGroupCall: boolean };
const GroupCallCtx = createContext<Ctx>({
  startGroupCall: () => {},
  inGroupCall: false,
});
export const useGroupCall = () => useContext(GroupCallCtx);

export function GroupCallProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const toast = useToast();

  const [call, setCall] = useState<ActiveGroupCall | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});

  const chanRef = useRef<RealtimeChannel | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Record<string, unknown>[]>([]);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const callRef = useRef<ActiveGroupCall | null>(null);
  callRef.current = call;

  const cleanup = useCallback(() => {
    peersRef.current.forEach((pc) => {
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
    });
    peersRef.current.clear();
    pendingIce.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (chanRef.current) {
      supabase.removeChannel(chanRef.current);
      chanRef.current = null;
    }
    readyRef.current = false;
    queueRef.current = [];
    setLocalStream(null);
    setRemotes({});
  }, [supabase]);

  // Broadcast (or address) a signal; queued until the channel is SUBSCRIBED.
  const send = useCallback(
    (payload: Record<string, unknown>) => {
      const msg = {
        type: "broadcast" as const,
        event: "gsignal",
        payload: { ...payload, from: userId },
      };
      if (readyRef.current && chanRef.current) chanRef.current.send(msg);
      else queueRef.current.push(msg as unknown as Record<string, unknown>);
    },
    [userId]
  );

  const setRemote = (peerId: string, stream: MediaStream) =>
    setRemotes((r) => ({ ...r, [peerId]: stream }));
  const dropRemote = (peerId: string) =>
    setRemotes((r) => {
      const n = { ...r };
      delete n[peerId];
      return n;
    });

  // Create (or fetch) the peer connection to `peerId`. When `initiator`, kicks
  // off the offer; the greater userId of each pair is the initiator.
  const ensurePeer = useCallback(
    (peerId: string, initiator: boolean) => {
      let pc = peersRef.current.get(peerId);
      if (pc) return pc;
      pc = new RTCPeerConnection(RTC_CONFIG);
      localRef.current
        ?.getTracks()
        .forEach((t) => pc!.addTrack(t, localRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate)
          send({ kind: "ice", to: peerId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => setRemote(peerId, e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (
          ["failed", "closed", "disconnected"].includes(pc!.connectionState)
        ) {
          pc!.close();
          peersRef.current.delete(peerId);
          dropRemote(peerId);
        }
      };
      peersRef.current.set(peerId, pc);
      if (initiator) {
        pc.createOffer()
          .then((o) =>
            pc!
              .setLocalDescription(o)
              .then(() => send({ kind: "offer", to: peerId, sdp: o }))
          )
          .catch(() => {});
      }
      return pc;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [send]
  );

  const onSignal = useCallback(
    async (s: any) => {
      if (!s || s.from === userId) return;
      if (s.to && s.to !== userId) return; // addressed to someone else
      const peerId: string = s.from;

      if (s.kind === "hello") {
        // Learn of a peer. If their hello was a broadcast (no `to`), ack directly
        // so they learn of us too. Greater id initiates the offer for the pair.
        const initiator = userId > peerId;
        ensurePeer(peerId, initiator);
        if (!s.to) send({ kind: "hello", to: peerId });
      } else if (s.kind === "offer") {
        const pc = ensurePeer(peerId, false);
        await pc.setRemoteDescription(s.sdp).catch(() => {});
        for (const c of pendingIce.current.get(peerId) ?? [])
          await pc.addIceCandidate(c).catch(() => {});
        pendingIce.current.delete(peerId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ kind: "answer", to: peerId, sdp: answer });
      } else if (s.kind === "answer") {
        const pc = peersRef.current.get(peerId);
        if (pc && !pc.currentRemoteDescription)
          await pc.setRemoteDescription(s.sdp).catch(() => {});
      } else if (s.kind === "ice") {
        const pc = peersRef.current.get(peerId);
        if (pc?.remoteDescription)
          await pc.addIceCandidate(s.candidate).catch(() => {});
        else
          pendingIce.current.set(peerId, [
            ...(pendingIce.current.get(peerId) ?? []),
            s.candidate,
          ]);
      } else if (s.kind === "bye") {
        const pc = peersRef.current.get(peerId);
        if (pc) {
          pc.close();
          peersRef.current.delete(peerId);
        }
        dropRemote(peerId);
      }
    },
    [userId, ensurePeer, send]
  );

  const getMedia = useCallback(async (type: CallType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video",
    });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const openChannel = useCallback(
    (callId: string) => {
      readyRef.current = false;
      const ch = supabase.channel(`group-call:${callId}`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "gsignal" }, ({ payload }) =>
        onSignal(payload)
      );
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          readyRef.current = true;
          const q = queueRef.current;
          queueRef.current = [];
          for (const m of q) ch.send(m as any);
          // Announce ourselves so existing participants set up peers.
          send({ kind: "hello" });
        }
      });
      chanRef.current = ch;
    },
    [supabase, onSignal, send]
  );

  // ── start (or join an active) group call ──────────────────────────────
  const enter = useCallback(
    async (callId: string, meta: ActiveGroupCall, type: CallType) => {
      try {
        await getMedia(type);
        setCall(meta);
        openChannel(callId);
      } catch {
        cleanup();
        setCall(null);
      }
    },
    [getMedia, openChannel, cleanup]
  );

  const startGroupCall = useCallback(
    async (a: StartArgs) => {
      if (callRef.current) return;
      const { data: callId, error } = await supabase.rpc("start_group_call", {
        p_conversation_id: a.conversationId,
      });
      if (error || !callId) return;
      // Ring every other member.
      a.members.forEach((m) => {
        const ring = supabase.channel(`group-ring:${m.id}`);
        ring.subscribe((st) => {
          if (st !== "SUBSCRIBED") return;
          ring.send({
            type: "broadcast",
            event: "group-incoming",
            payload: {
              callId,
              conversationId: a.conversationId,
              title: a.title,
              type: a.type,
              starterName: "Someone",
            },
          });
          setTimeout(() => supabase.removeChannel(ring), 1500);
        });
      });
      await enter(
        callId as string,
        {
          id: callId as string,
          conversationId: a.conversationId,
          title: a.title,
          type: a.type,
          members: a.members,
        },
        a.type
      );
    },
    [supabase, enter]
  );

  const acceptIncoming = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    setIncoming(null);
    const { error } = await supabase.rpc("join_group_call", {
      p_call_id: inc.callId,
    });
    if (error) {
      // The banner was already cleared, so returning here made an accepted
      // call disappear with no join, no message and nothing to tap again.
      // Put it back and say what happened.
      setIncoming(inc);
      toast("Couldn't join that call", "error");
      return;
    }
    await enter(
      inc.callId,
      {
        id: inc.callId,
        conversationId: inc.conversationId,
        title: inc.title,
        type: inc.type,
        members: [],
      },
      inc.type
    );
  }, [incoming, supabase, enter]);

  const leave = useCallback(() => {
    const c = callRef.current;
    if (c) supabase.rpc("leave_group_call", { p_call_id: c.id }).then(() => {});
    send({ kind: "bye" });
    cleanup();
    setCall(null);
  }, [supabase, send, cleanup]);

  // ── incoming group-call listener (own ring channel) ───────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`group-ring:${userId}`)
      .on("broadcast", { event: "group-incoming" }, ({ payload }) => {
        const i = payload as any;
        if (callRef.current) return; // already in a call
        setIncoming({
          callId: i.callId,
          conversationId: i.conversationId,
          title: i.title,
          type: i.type,
          starterName: i.starterName,
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Ringtone while an incoming prompt is up.
  useEffect(() => {
    if (incoming) startRing("incoming");
    else stopRing();
    return () => stopRing();
  }, [incoming]);

  useEffect(() => cleanup, [cleanup]);

  return (
    <GroupCallCtx.Provider value={{ startGroupCall, inGroupCall: !!call }}>
      {children}
      {incoming && !call && (
        <IncomingGroup
          incoming={incoming}
          onAccept={acceptIncoming}
          onDecline={() => setIncoming(null)}
        />
      )}
      {call && (
        <GroupCallUI
          call={call}
          localStream={localStream}
          remotes={remotes}
          onLeave={leave}
        />
      )}
    </GroupCallCtx.Provider>
  );
}

/* ── Incoming group-call prompt ── */
function IncomingGroup({
  incoming,
  onAccept,
  onDecline,
}: {
  incoming: Incoming;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="animate-page-enter fixed inset-0 z-[230] mx-auto flex max-w-[480px] flex-col items-center justify-between bg-black px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-white">
          <Users size={44} />
        </span>
        <div>
          <p className="text-xl font-bold text-white">{incoming.title}</p>
          <p className="mt-1 text-sm text-white/60">
            Incoming group {incoming.type} call
          </p>
        </div>
      </div>
      <div className="flex items-end justify-center gap-10">
        <button
          type="button"
          onClick={onDecline}
          className="flex flex-col items-center gap-1.5 text-white/80"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white active:scale-95">
            <Phone size={26} className="rotate-[135deg]" />
          </span>
          <span className="text-xs">Decline</span>
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="flex flex-col items-center gap-1.5 text-white/80"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white active:scale-95">
            <Phone size={26} />
          </span>
          <span className="text-xs">Join</span>
        </button>
      </div>
    </div>
  );
}

/* ── In-call tile grid ── */
function GroupCallUI({
  call,
  localStream,
  remotes,
  onLeave,
}: {
  call: ActiveGroupCall;
  localStream: MediaStream | null;
  remotes: Record<string, MediaStream>;
  onLeave: () => void;
}) {
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const remoteIds = Object.keys(remotes);
  const tiles = 1 + remoteIds.length;
  const cols = tiles <= 1 ? 1 : 2;

  function toggleMute() {
    const n = !muted;
    setMuted(n);
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !n));
  }
  function toggleCam() {
    const n = !camOff;
    setCamOff(n);
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !n));
  }

  const nameById = new Map(call.members.map((m) => [m.id, m]));

  return (
    <div className="animate-page-enter fixed inset-0 z-[230] mx-auto flex max-w-[480px] flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-12 pb-2">
        <p className="text-sm font-bold text-white">{call.title}</p>
        <span className="flex items-center gap-1 rounded-pill bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">
          <Users size={12} /> {tiles}
        </span>
      </div>

      <div
        className={`grid flex-1 gap-1.5 overflow-hidden p-1.5`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        <Tile
          stream={localStream}
          label="You"
          muted
          camOff={camOff}
          type={call.type}
          isSelf
        />
        {remoteIds.map((id) => (
          <Tile
            key={id}
            stream={remotes[id]}
            label={nameById.get(id)?.name ?? "Guest"}
            hue={nameById.get(id)?.hue}
            type={call.type}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-5 px-6 pb-10 pt-4">
        <button
          type="button"
          onClick={toggleMute}
          aria-label="Mute"
          className={`flex h-14 w-14 items-center justify-center rounded-full ${
            muted ? "bg-white text-black" : "bg-white/10 text-white"
          }`}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white active:scale-95"
        >
          <Phone size={26} className="rotate-[135deg]" />
        </button>
        {call.type === "video" && (
          <button
            type="button"
            onClick={toggleCam}
            aria-label="Camera"
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              camOff ? "bg-white text-black" : "bg-white/10 text-white"
            }`}
          >
            {camOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Tile({
  stream,
  label,
  hue = 280,
  muted,
  camOff,
  type,
  isSelf,
}: {
  stream: MediaStream | null;
  label: string;
  hue?: number;
  muted?: boolean;
  camOff?: boolean;
  type: CallType;
  isSelf?: boolean;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (vid.current && stream) vid.current.srcObject = stream;
  }, [stream]);
  const showVideo = type === "video" && !camOff;
  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-white/5">
      {showVideo ? (
        <video
          ref={vid}
          autoPlay
          playsInline
          muted={isSelf}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          {/* audio still needs the element attached to play remote sound */}
          <video
            ref={vid}
            autoPlay
            playsInline
            muted={isSelf}
            className="hidden"
          />
          <Avatar name={label} hue={hue} size={64} />
        </>
      )}
      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-pill bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
        {muted && <MicOff size={10} />}
        {label}
      </span>
    </div>
  );
}
