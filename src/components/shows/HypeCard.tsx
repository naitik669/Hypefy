"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { CardPlate, Well } from "@/components/profile/CardPlate";
import { cardUrl, memberNumber, memberSince } from "@/lib/profile-card";
import type { EmbedState } from "@/components/shows/ShowWidgetPickers";
import type { HypeCardPayload, ShowLayer } from "@/lib/show-layers";

/**
 * Somebody's Hypefy ID, on a Show.
 *
 * The same object as the card on their profile and deliberately a small one:
 * the plate, the hairlines, the well and the painted edge all come from
 * CardPlate, so restyling the card reaches this too rather than leaving a
 * second card on the Shows to drift.
 *
 * What it is *not* is HypefyIdFace shrunk. That face draws a QR code onto a
 * canvas at up to 380px times the device ratio, five rows of remarks, a save
 * button and a flip button. One of those on a frame that already runs a story
 * clock, a video and a song would be the exact thing the performance audit was
 * about — and at a quarter scale none of it can be read anyway. So this keeps
 * the four things that survive being small and stay true for ever: the face,
 * the name, the handle, and the number and month the account started.
 *
 * Everything drawn comes from the lookup, never from the layer. See
 * HypeCardPayload: a card that carried its own handle would be a credential
 * anybody could write.
 */

/** The owner's accent, from their avatar hue, in Avatar's own formula. */
export function cardEdge(hue: number | null | undefined): string {
  const h = typeof hue === "number" && Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 200;
  return `linear-gradient(90deg, hsl(${h} 75% 52%), hsl(${(h + 50) % 360} 70% 38%))`;
}

export function HypeCardSticker({
  layer,
  card,
  editing,
}: {
  layer: ShowLayer;
  card: EmbedState | undefined;
  editing: boolean;
}) {
  const { ownerId } = layer.payload as HypeCardPayload;
  const handle = card?.author ?? null;
  const name = card?.caption?.trim() || handle || "Hypefy ID";
  const no = memberNumber(card?.memberNo ?? null);
  const since = memberSince(card?.since ?? null);

  const body = (
    <span
      style={{
        display: "block",
        width: 176,
        // The plate is a flex column with `h-full`, so the height has to come
        // from here: a sticker has no parent to fill.
        height: 212,
      }}
    >
      <CardPlate edge={cardEdge(card?.hue)}>
        <span style={{ display: "flex", flexDirection: "column", gap: 9, padding: "11px 11px 13px" }}>
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.85)",
              textAlign: "right",
            }}
          >
            Hypefy ID
          </span>

          <Well className="self-center">
            <Avatar name={name} hue={card?.hue ?? 200} size={92} src={card?.thumb ?? undefined} />
          </Well>

          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.15,
                color: "#ffffff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
            {handle && (
              <span
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.58)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                @{handle}
              </span>
            )}
          </span>

          {(no || since) && (
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 8.5,
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              <span>{no ?? ""}</span>
              <span>{since ?? ""}</span>
            </span>
          )}
        </span>
      </CardPlate>
    </span>
  );

  // No handle means the lookup has not landed, or the account is gone. Either
  // way there is nothing to open, and a door onto a 404 is worse than a card
  // that simply does not take the tap.
  if (editing || !handle) return body;
  return (
    <Link href={cardUrl(handle)} aria-label={`Hypefy ID of @${handle}`} data-owner={ownerId}>
      {body}
    </Link>
  );
}
