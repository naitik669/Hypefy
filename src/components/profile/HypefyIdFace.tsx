"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { HypefyWordmark } from "@/components/ui/HypefyMark";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { CardPlate, PlateFoot, Well } from "@/components/profile/CardPlate";
import { hypefyQrDataUrl } from "@/lib/hypefy-qr";
import { pronounLabel } from "@/lib/profile";
import { anthemLine, memberNumber, memberSince, prettyUrl } from "@/lib/profile-card";
import { remarkRows } from "@/lib/card-remarks";
import type { ProfileCardData } from "@/components/profile/ProfileCard";

/**
 * The widest the code is ever drawn, in CSS pixels.
 *
 * The card is capped at the app's own column and the code sits in a square
 * tile inside that padding, so it does not pass about this. Multiplied by
 * the screen's pixel ratio, it is what the canvas has to supply for the
 * code to land one painted pixel on one real one.
 */
const QR_MAX_CSS = 380;
/** Past this the canvas costs more than the sharpness is worth. */
const QR_MAX_DPR = 4;

/**
 * The back of the card: the Hypefy ID.
 *
 * Read as a credential rather than a second profile. The front answers who
 * someone is and is mostly a photograph; this answers what their account is
 * — the code that opens it, the number that names it, the date it started —
 * and is mostly type, set in rows with their labels. That difference is the
 * reason to turn the card over.
 *
 * The code sits in the same well the photograph does on the front, so both
 * sides are plainly the same object. It is drawn light on near-black: a
 * white tile on a matte black plate looks like a sticker left on it.
 *
 * Nothing here stops meaning something once it leaves the app. No Follow,
 * no links, and no follower count — a card saved in March claiming twelve
 * followers reads badly by June. The number, the month and the song all
 * stay true.
 */
export function HypefyIdFace({
  data,
  url,
  onSave,
  saving,
  onFlip,
}: {
  data: ProfileCardData;
  url: string;
  onSave: () => void;
  saving: "idle" | "working" | "done" | "failed";
  onFlip: () => void;
}) {
  const qr = useHypefyQr(url);
  const no = memberNumber(data.memberNo);
  const since = memberSince(data.joinedAt);
  const anthem = anthemLine(data.anthem);
  const pronouns = pronounLabel(data.pronouns);
  const remark = remarkRows({
    userId: data.userId,
    tags: data.tags,
    interests: data.interests ?? [],
    hasAnthem: !!anthem,
    memberNo: data.memberNo ?? null,
    joinedAt: data.joinedAt ?? null,
    posts: data.stats.posts,
    hypers: data.stats.followers,
    lastSeenAt: data.lastSeenAt ?? null,
    showActivity: data.showActivity,
    frame: data.avatarDecoration ?? null,
    isPremium: data.cosmetics?.is_premium ?? false,
    verified: data.verified,
  });

  return (
    <CardPlate>
      <div className="relative flex min-h-0 flex-1 flex-col px-4 pt-4">
{/* Just the words, at the top right. The mark used to sit on the left of
    this row and now lives in the middle of the code, which is the one
    place on the back it has a job to do. */}
        <header className="flex items-center">
          <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">
            Hypefy ID
          </span>
        </header>

        <div className="mt-3.5 flex flex-1 justify-center [min-height:88px]">
          <Well className="aspect-square h-full max-w-full">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-[6%]">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt={`QR code opening ${prettyUrl(url)}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full" aria-hidden />
              )}
            </div>
          </Well>
        </div>
        <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.24em] text-white/35">
          Scan to open
        </p>

        <div className="mt-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="min-w-0 truncate text-[18px] font-extrabold leading-tight tracking-tight">{data.name}</h3>
            {data.verified && <VerifiedStar className="h-4 w-4 shrink-0" />}
          </div>
          {/* Pronouns are a row below, not here. The front sets them beside
              the handle because it is a profile; the back is a document, and
              saying the same thing twice on one small face is sloppy. */}
          {data.username && <p className="font-mono text-[11.5px] text-white/45">@{data.username}</p>}
        </div>

        <dl className="mt-3 border-t border-white/10">
          {no && <Row label="Member" value={no.split("").join(" ")} strong />}
          {since && <Row label="Since" value={since} />}
          {pronouns && <Row label="Pronouns" value={pronouns} />}
          {data.tags.length > 0 && <Row label="Roles" value={data.tags.join(" · ").toUpperCase()} />}
          {/* Dimmer than the facts around it, but not lowercased: these
              are sentences now, and forcing the case ate the capital.
              One row, or a declared/observed pair when there is a gap
              worth reporting — see card-remarks. */}
          {remark.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} lower />
          ))}
          {anthem && <Row label="Anthem" value={anthem} />}
        </dl>

        {/* No address here: it is a line of small type under a code that
            does the same job better, and the room is worth more to the
            code. The saved image keeps it — a picture that has left the
            app has no camera to hand. */}
        <div className="flex flex-col items-center gap-2.5 pb-2.5 pt-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving === "working"}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold text-white/85 transition active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.06)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.6)",
            }}
          >
            <Download size={15} strokeWidth={2.6} />
            {SAVE_LABEL[saving]}
          </button>
          <HypefyWordmark className="text-[15px] font-extrabold tracking-tight text-white/85" />
        </div>
      </div>

      <PlateFoot side="back" onFlip={onFlip} />
    </CardPlate>
  );
}

const SAVE_LABEL: Record<"idle" | "working" | "done" | "failed", string> = {
  idle: "Save ID",
  working: "Drawing…",
  done: "Saved",
  failed: "Could not save",
};

function Row({
  label,
  value,
  strong = false,
  lower = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  lower?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-white/10 py-[5px]">
      <dt className="w-[66px] shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</dt>
      <dd
        className={`min-w-0 flex-1 truncate font-mono tabular-nums ${
          strong ? "text-[13px] font-bold tracking-[0.06em] text-white" : "text-[11.5px] font-semibold text-white/85"
        } ${lower ? "text-white/70" : ""}`}
      >
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
    // Painted for this screen, not at one fixed size. At 640 the code was
    // a bitmap being stretched: the tile is about 290 CSS pixels on a
    // phone, which is 870 real ones at a 3x pixel ratio, so every module
    // edge was resampled — the one kind of softness a scanner cares about.
    const dpr = Math.min(QR_MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const data = hypefyQrDataUrl(url, Math.ceil(QR_MAX_CSS * dpr));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- it is painted on a canvas, which only exists after mount
    if (data) setQr({ url, data });
  }, [url]);
  return qr?.url === url ? qr.data : null;
}
