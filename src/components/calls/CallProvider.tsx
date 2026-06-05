"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Phone, Video, Mic, MicOff, VideoOff, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startRing, stopRing } from "@/lib/ringtone";
import { Avatar } from "@/components/ui/Avatar";

type CallType = "audio" | "video";
type Role = "caller" | "callee";
type Status = "outgoing" | "incoming" | "connected";

type ActiveCall = {
  id: string;            // call_sessions id
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHue: number;
  type: CallType;
  role: Role;
  status: Status;
};

type StartArgs = {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHue: number;
  type: CallType;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

const RING_TIMEOUT = 30_000;

export const QUICK_REPLIES = [
  "I'm busy",
  "Call you later",
  "Text me",
  "Give me 5 minutes",
  "Can't talk right now",
];

type Ctx = { startCall: (a: StartArgs) => void; inCall: boolean };
const CallCtx = createContext<Ctx>({ startCall: () => {}, inCall: false });
export const useCallControls = () => useContext(CallCtx);

export function CallProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();

  const [call, setCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chanRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const offerRef = useRef<RTCSessionDescriptionInit | null>(null);   // callee: stored remote offer
  const callRef = useRef<ActiveCall | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  callRef.current = call;

  // ── teardown ────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pendingIce.current = [];
    offerRef.current = null;
    if (chanRef.current) { supabase.removeChannel(chanRef.current); chanRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
  }, [supabase]);

  const send = useCallback((payload: Record<string, unknown>) => {
    chanRef.current?.send({ type: "broadcast", event: "signal", payload: { ...payload, from: userId } });
  }, [userId]);

  const getMedia = useCallback(async (type: CallType) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const makePeer = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => { if (e.candidate) send({ kind: "ice", candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
        setCall((c) => (c ? { ...c, status: "connected" } : c));
      } else if (["failed", "closed"].includes(pc.connectionState)) {
        hangUp();
      }
    };
    pcRef.current = pc;
    return pc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  function openChannel(conversationId: string, onSignal: (s: any) => void) {
    const ch = supabase.channel(`call:${conversationId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload));
    ch.subscribe();
    chanRef.current = ch;
    return ch;
  }

  // ── outgoing call ───────────────────────────────────────────
  const startCall = useCallback(async (a: StartArgs) => {
    if (callRef.current) return;
    setError(null);
    let createdId: string | null = null;
    try {
      const { data: callId, error: rpcErr } = await supabase.rpc("start_call", {
        p_conversation_id: a.conversationId,
        p_receiver_id: a.peerId,
        p_type: a.type,
      });
      if (rpcErr || !callId) { setError("Couldn't start the call."); return; }
      createdId = callId as string;

      // Ring the receiver directly over broadcast (reliable, RLS-independent).
      const ring = supabase.channel(`user-calls:${a.peerId}`);
      ring.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        ring.send({
          type: "broadcast",
          event: "incoming",
          payload: {
            id: createdId, conversationId: a.conversationId, callerId: userId, type: a.type,
          },
        });
        setTimeout(() => supabase.removeChannel(ring), 1500);
      });

      const stream = await getMedia(a.type);
      const pc = makePeer(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const active: ActiveCall = {
        id: callId as string, conversationId: a.conversationId, peerId: a.peerId,
        peerName: a.peerName, peerHue: a.peerHue, type: a.type, role: "caller", status: "outgoing",
      };
      setCall(active);

      openChannel(a.conversationId, async (s: any) => {
        if (s.from === userId) return;
        if (s.kind === "ready") {
          send({ kind: "offer", sdp: offer, callType: a.type });
        } else if (s.kind === "answer") {
          await pc.setRemoteDescription(s.sdp).catch(() => {});
          for (const c of pendingIce.current) await pc.addIceCandidate(c).catch(() => {});
          pendingIce.current = [];
        } else if (s.kind === "ice") {
          if (pc.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {});
          else pendingIce.current.push(s.candidate);
        } else if (s.kind === "end" || s.kind === "decline") {
          cleanup(); setCall(null);
        }
      });
      // Nudge: also send the offer immediately in case callee already subscribed
      send({ kind: "offer", sdp: offer, callType: a.type });

      ringTimer.current = setTimeout(async () => {
        await supabase.rpc("mark_call_missed", { p_call_id: callId });
        send({ kind: "end" });
        cleanup(); setCall(null);
      }, RING_TIMEOUT);
    } catch {
      if (createdId) await supabase.rpc("end_call", { p_call_id: createdId });
      cleanup(); setCall(null);
      setError("Camera/microphone permission is required to call.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, getMedia, makePeer, send, cleanup]);

  // ── incoming: subscribe to channel & wait for offer ─────────
  const beginIncoming = useCallback((c: ActiveCall) => {
    setCall(c);
    openChannel(c.conversationId, async (s: any) => {
      if (s.from === userId) return;
      const pc = pcRef.current;
      if (s.kind === "offer") {
        offerRef.current = s.sdp;
      } else if (s.kind === "ice") {
        if (pc?.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {});
        else pendingIce.current.push(s.candidate);
      } else if (s.kind === "end") {
        cleanup(); setCall(null);
      }
    });
    // tell caller we're here so it (re)sends the offer
    setTimeout(() => send({ kind: "ready" }), 250);
  }, [userId, send, cleanup]);

  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    try {
      // ensure we have the offer (caller resends on 'ready')
      let tries = 0;
      while (!offerRef.current && tries < 20) { send({ kind: "ready" }); await wait(150); tries++; }
      if (!offerRef.current) throw new Error("no offer");

      const stream = await getMedia(c.type);
      const pc = makePeer(stream);
      await pc.setRemoteDescription(offerRef.current);
      for (const cand of pendingIce.current) await pc.addIceCandidate(cand).catch(() => {});
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ kind: "answer", sdp: answer });
      await supabase.rpc("accept_call", { p_call_id: c.id });
      setCall({ ...c, status: "connected" });
    } catch {
      await supabase.rpc("decline_call", { p_call_id: c.id });
      send({ kind: "end" });
      cleanup(); setCall(null);
      setError("Couldn't connect the call.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getMedia, makePeer, send, supabase, cleanup]);

  const declineCall = useCallback(async () => {
    const c = callRef.current;
    if (c) await supabase.rpc("decline_call", { p_call_id: c.id });
    send({ kind: "decline" });
    cleanup(); setCall(null);
  }, [supabase, send, cleanup]);

  const quickReply = useCallback(async (text: string) => {
    const c = callRef.current;
    if (c) await supabase.rpc("quick_reply_call", { p_call_id: c.id, p_reply: text });
    send({ kind: "decline" });
    cleanup(); setCall(null);
  }, [supabase, send, cleanup]);

  function hangUp() {
    const c = callRef.current;
    if (c) void supabase.rpc("end_call", { p_call_id: c.id });
    send({ kind: "end" });
    cleanup(); setCall(null);
  }

  // ── app-wide incoming-call listener ─────────────────────────
  const ringIncoming = useCallback(async (info: { id: string; conversationId: string; callerId: string; type: CallType }) => {
    if (callRef.current) return; // busy — ignore for MVP
    const { data: p } = await supabase
      .from("profiles").select("display_name, username, avatar_hue").eq("id", info.callerId).maybeSingle();
    beginIncoming({
      id: info.id, conversationId: info.conversationId, peerId: info.callerId,
      peerName: p?.display_name ?? p?.username ?? "Someone", peerHue: p?.avatar_hue ?? 280,
      type: info.type, role: "callee", status: "incoming",
    });
  }, [supabase, beginIncoming]);

  useEffect(() => {
    // Primary: broadcast ping straight from the caller (reliable).
    const bc = supabase
      .channel(`user-calls:${userId}`)
      .on("broadcast", { event: "incoming" }, ({ payload }) => {
        const i = payload as any;
        ringIncoming({ id: i.id, conversationId: i.conversationId, callerId: i.callerId, type: i.type });
      })
      .subscribe();

    // Backup: postgres_changes on call_sessions (covers any missed broadcast).
    const pg = supabase
      .channel(`incoming-calls:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "call_sessions", filter: `receiver_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.status !== "ringing") return;
          ringIncoming({ id: row.id, conversationId: row.conversation_id, callerId: row.caller_id, type: row.type });
        })
      .subscribe();

    return () => { supabase.removeChannel(bc); supabase.removeChannel(pg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ringIncoming]);

  // Ringtone — rings on both outgoing (ringback) and incoming, stops on connect/end.
  useEffect(() => {
    if (call && (call.status === "outgoing" || call.status === "incoming")) {
      startRing(call.status === "incoming" ? "incoming" : "outgoing");
    } else {
      stopRing();
    }
    return () => stopRing();
  }, [call]);

  // clean up on unmount
  useEffect(() => cleanup, [cleanup]);

  return (
    <CallCtx.Provider value={{ startCall, inCall: !!call }}>
      {children}
      {error && (
        <div className="fixed bottom-24 left-1/2 z-[240] -translate-x-1/2 rounded-pill bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
          onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {call && (
        <CallUI
          call={call}
          localStream={localStream}
          remoteStream={remoteStream}
          onAccept={acceptCall}
          onDecline={declineCall}
          onQuickReply={quickReply}
          onEnd={hangUp}
          onOpenChat={() => router.push(`/messages/${call.conversationId}`)}
        />
      )}
    </CallCtx.Provider>
  );
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/* ─── Call UI: incoming / outgoing / connected ─────────────── */
function CallUI({
  call, localStream, remoteStream, onAccept, onDecline, onQuickReply, onEnd, onOpenChat,
}: {
  call: ActiveCall;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onDecline: () => void;
  onQuickReply: (t: string) => void;
  onEnd: () => void;
  onOpenChat: () => void;
}) {
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const localVid = useRef<HTMLVideoElement>(null);
  const remoteVid = useRef<HTMLVideoElement>(null);

  useEffect(() => { if (localVid.current && localStream) localVid.current.srcObject = localStream; }, [localStream]);
  useEffect(() => { if (remoteVid.current && remoteStream) remoteVid.current.srcObject = remoteStream; }, [remoteStream]);
  useEffect(() => {
    if (call.status !== "connected") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [call.status]);

  function toggleMute() { const n = !muted; setMuted(n); localStream?.getAudioTracks().forEach((t) => (t.enabled = !n)); }
  function toggleCam() { const n = !camOff; setCamOff(n); localStream?.getVideoTracks().forEach((t) => (t.enabled = !n)); }

  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const statusText =
    call.status === "incoming" ? `Incoming ${call.type} call`
    : call.status === "outgoing" ? "Ringing…"
    : clock;
  const showRemoteVideo = call.type === "video" && call.status === "connected" && !!remoteStream;

  return (
    <div className="fixed inset-0 z-[230] mx-auto flex max-w-[480px] flex-col items-center justify-between overflow-hidden bg-black px-6 py-14">
      {showRemoteVideo && <video ref={remoteVid} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />}
      {call.type === "audio" && <video ref={remoteVid} autoPlay playsInline className="hidden" />}
      {call.type === "video" && call.status === "connected" && (
        <video ref={localVid} autoPlay playsInline muted
          className={`absolute right-4 top-14 z-10 h-40 w-28 rounded-2xl border border-white/15 object-cover shadow-xl ${camOff ? "hidden" : ""}`} />
      )}

      <div className="z-10 flex flex-1 flex-col items-center justify-center gap-5">
        {!showRemoteVideo && (
          <>
            <Avatar name={call.peerName} hue={call.peerHue} size={120} />
            <div className="text-center">
              <p className="text-xl font-bold text-white">{call.peerName}</p>
              <p className="mt-1 text-sm text-white/60">{statusText}</p>
            </div>
          </>
        )}
        {showRemoteVideo && (
          <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-pill bg-black/40 px-3 py-1 backdrop-blur-sm">
            <span className="text-sm font-semibold text-white">{call.peerName} · {clock}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="z-10 w-full">
        {showReplies ? (
          <div className="mx-auto flex max-w-sm flex-col gap-2">
            {QUICK_REPLIES.map((r) => (
              <button key={r} type="button" onClick={() => onQuickReply(r)}
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white backdrop-blur-sm active:scale-[0.99]">
                {r}
              </button>
            ))}
            <button type="button" onClick={() => setShowReplies(false)} className="py-2 text-sm text-white/60">Back</button>
          </div>
        ) : call.status === "incoming" ? (
          <div className="flex items-end justify-center gap-8">
            <ControlButton color="red" label="Decline" onClick={onDecline}>
              <Phone size={26} className="rotate-[135deg]" />
            </ControlButton>
            <button type="button" onClick={() => setShowReplies(true)}
              className="flex flex-col items-center gap-1.5 text-white/80">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <MessageCircle size={20} />
              </span>
              <span className="text-xs">Message</span>
            </button>
            <ControlButton color="green" label="Accept" onClick={onAccept}>
              <Phone size={26} />
            </ControlButton>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5">
            <button type="button" onClick={toggleMute} aria-label="Mute"
              className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? "bg-white text-black" : "bg-white/10 text-white"}`}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button type="button" onClick={onEnd} aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white active:scale-95">
              <Phone size={26} className="rotate-[135deg]" />
            </button>
            {call.type === "video" ? (
              <button type="button" onClick={toggleCam} aria-label="Camera"
                className={`flex h-14 w-14 items-center justify-center rounded-full ${camOff ? "bg-white text-black" : "bg-white/10 text-white"}`}>
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            ) : (
              <button type="button" onClick={onOpenChat} aria-label="Open chat"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                <MessageCircle size={22} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ControlButton({ color, label, onClick, children }: {
  color: "red" | "green"; label: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 text-white/80">
      <span className={`flex h-16 w-16 items-center justify-center rounded-full text-white active:scale-95 ${color === "red" ? "bg-red-500" : "bg-green-500"}`}>
        {children}
      </span>
      <span className="text-xs">{label}</span>
    </button>
  );
}
