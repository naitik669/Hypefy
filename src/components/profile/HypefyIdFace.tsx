"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { FlipStrip } from "@/components/profile/CardFlip";
import { HypefyMark } from "@/components/ui/HypefyMark";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { hypefyQrDataUrl } from "@/lib/hypefy-qr";
import { hypefyId, memberSince, prettyUrl } from "@/lib/profile-card";
import type { ProfileCardData } from "@/components/profile/ProfileCard";

/**
 * The back of the card: the Hypefy ID.
 *
 * Read as a credential rather than a second profile. The front answers who
 * someone is and is mostly a photograph; this answers what their account is
 * — the code that opens it, the number that names it, the date it started —
 * and is mostly type. That difference is the reason to turn the card over,
 * and it is why the type here is monospaced and set in rows: a document,
 * not a page.
 *
 * It is also the face that gets saved to someone's photos, so everything on
 * it has to survive leaving the app. No live Follow button, no links that
 * stop working, nothing that only means something while you are signed in.
 */
export function HypefyIdFace({
  data,
  url,
  background,
  onSave,
  saving,
  onFlip,
}: {
  data: ProfileCardData;
  url: string;
  background: string;
  onSave: () => void;
  saving: "idle" | "working" | "done" | "failed";
  onFlip: () => void;
}) {
  const qr = useHypefyQr(url);
  const since = memberSince(data.joinedAt);

  return (
    <div
      className="overflow-hidden rounded-[28px] border border-white/10 p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
      style={{ background }}
    >
      <div className="flex flex-col gap-3.5 rounded-[20px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(0,0,0,0.42),rgba(0,0,0,0.12))] p-4">
        <header className="flex items-center gap-2">
          <HypefyMark size={19} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
            Hypefy ID
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {data.verified ? "Verified" : "Member"}
          </span>
        </header>

        {/* The code, on white with its quiet zone, inside a lime hairline —
            the bright lime of the brand lives in the frame and the badge,
            never in the modules. See hypefy-qr.ts for why. */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="rounded-[22px] bg-[linear-gradient(140deg,rgba(190,242,100,0.9),rgba(101,163,13,0.35))] p-[1.5px]">
            <div className="rounded-[21px] bg-white p-2.5">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR code opening ${prettyUrl(url)}`} className="h-[186px] w-[186px]" />
              ) : (
                <div className="h-[186px] w-[186px]" aria-hidden />
              )}
            </div>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Scan to open</p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="min-w-0 truncate text-xl font-extrabold leading-tight tracking-tight">
              {data.name}
            </h3>
            {data.verified && <VerifiedStar className="h-[17px] w-[17px] shrink-0" />}
          </div>
          {data.username && <p className="font-mono text-[12px] text-white/50">@{data.username}</p>}
        </div>

        <dl className="flex flex-col gap-0 border-y border-white/10 py-1">
          <Row label="ID" value={hypefyId(data.userId)} />
          {since && <Row label="Since" value={since} />}
          <Row
            label="Standing"
            value={`${data.stats.followers.toLocaleString()} followers · ${data.stats.posts.toLocaleString()} posts`}
          />
        </dl>

        <button
          type="button"
          onClick={onSave}
          disabled={saving === "working"}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-extrabold text-accent-ink transition active:scale-[0.98] disabled:opacity-60"
        >
          <Download size={16} strokeWidth={2.6} />
          {SAVE_LABEL[saving]}
        </button>

        <p className="truncate text-center font-mono text-[10px] text-white/30">{prettyUrl(url)}</p>
      </div>
      <div className="px-2">
        <FlipStrip side="back" onFlip={onFlip} />
      </div>
    </div>
  );
}

const SAVE_LABEL: Record<"idle" | "working" | "done" | "failed", string> = {
  idle: "Save ID",
  working: "Drawing…",
  done: "Saved",
  failed: "Could not save",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="w-[74px] shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold tabular-nums text-white/85">
        {value}
      </dd>
    </div>
  );
}

/**
 * The code, drawn after mount.
 *
 * It needs a canvas, so there is nothing to render on the server, and it is
 * derived entirely from the address — no round trip would tell us anything
 * the username has not already.
 */
function useHypefyQr(url: string): string | null {
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    const data = hypefyQrDataUrl(url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- it is painted on a canvas, which only exists after mount
    if (data) setQr({ url, data });
  }, [url]);
  return qr?.url === url ? qr.data : null;
}
