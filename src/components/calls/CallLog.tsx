"use client";

import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { WalkieArt } from "@/components/empty/scenes";
import { useCallControls } from "@/components/calls/CallProvider";

export type CallEntry = {
  id: string;
  conversationId: string | null;
  peerId: string | null;
  peerName: string;
  peerUsername: string | null;
  peerHue: number;
  peerAvatarUrl: string | null;
  type: "audio" | "video";
  outgoing: boolean;
  missed: boolean;
  durationSec: number | null;
  at: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Call history — one row per call_session the viewer took part in. Direction
 * + missed state read at a glance; tap to call the person back with the same
 * medium (audio/video).
 */
export function CallLog({ entries }: { entries: CallEntry[] }) {
  const { startCall } = useCallControls();

  if (entries.length === 0) {
    return (
      <EmptyScene
        art={<WalkieArt />}
        title="Anyone out there"
        mark="?"
        text="Start a call. Over."
        // The words wait for the red light.
        timing={{ head: 1.2, sub: 1.55, cta: 1.9 }}
        cta={
          <Link href="/messages/new" className={ctaClass}>
            Start a call
          </Link>
        }
      />
    );
  }

  function callBack(e: CallEntry) {
    if (!e.conversationId || !e.peerId) return;
    startCall({
      conversationId: e.conversationId,
      peerId: e.peerId,
      peerName: e.peerName,
      peerHue: e.peerHue,
      type: e.type,
    });
  }

  return (
    <div className="flex flex-col pb-6">
      {entries.map((e) => {
        const DirIcon = e.missed ? PhoneMissed : e.outgoing ? PhoneOutgoing : PhoneIncoming;
        const detail = e.missed
          ? "Missed"
          : e.durationSec != null
            ? fmtDuration(e.durationSec)
            : e.outgoing
              ? "Outgoing"
              : "Incoming";
        return (
          <div
            key={e.id}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
          >
            <Avatar name={e.peerName} hue={e.peerHue} size={48} src={e.peerAvatarUrl ?? undefined} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${e.missed ? "text-danger" : "text-foreground"}`}>
                {e.peerName}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                <DirIcon size={13} className={e.missed ? "text-danger" : ""} />
                {detail}
                <span className="text-faint">· {timeAgo(e.at)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => callBack(e)}
              disabled={!e.conversationId || !e.peerId}
              aria-label={`Call ${e.peerName} back`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent transition-colors hover:bg-elevated disabled:opacity-40"
            >
              {e.type === "video" ? <Video size={18} /> : <Phone size={18} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
