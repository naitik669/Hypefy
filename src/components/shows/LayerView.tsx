"use client";

import Link from "next/link";
import { lookFor } from "@/lib/show-looks";
import { ShowPoll, ShowQuestion, type PollState } from "@/components/shows/ShowPoll";
import type { EmbedState } from "@/components/shows/ShowWidgetPickers";
import {
  DESIGN_WIDTH,
  layerBox,
  type LinkPayload,
  type MentionPayload,
  type MusicPayload,
  type PollPayload,
  type PostPayload,
  type QuestionPayload,
  type ShotPayload,
  type ShowLayer,
  type StickerPayload,
  type TextPayload,
  type LocationPayload,
  type HashtagPayload,
  type TimePayload,
} from "@/lib/show-layers";

/**
 * One layer, drawn.
 *
 * The same component in the editor and in the viewer. Two of these would
 * be two things to keep in step, and the one that drifts is always the
 * one nobody is looking at — card-image.ts says the same about its own
 * pair. The editor passes `editing`, which only turns the live parts off:
 * a poll you are arranging should not take your vote, and a mention you
 * are placing should not navigate away mid-drag.
 *
 * Nothing here measures the screen. Position comes from `layerBox` as a
 * fraction of whatever frame it is given, so the same layer lands right
 * in the editor, the full-screen viewer, a ring preview and an export.
 */
export function LayerView({
  layer,
  frame,
  editing = false,
  showId,
  polls,
  embeds,
}: {
  layer: ShowLayer;
  frame: { width: number; height: number };
  /** In the editor: draw it, but do not let it act. */
  editing?: boolean;
  /** Which Show this is, for the layers that write something back. */
  showId?: string;
  /** What the server knows about this Show's polls, by layer id. */
  polls?: Record<string, PollState>;
  /** What each embedded post or Shot looks like now, by layer id. */
  embeds?: Record<string, EmbedState>;
}) {
  const box = layerBox(layer, frame);
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, transform: box.transform, transformOrigin: "center" }}
    >
      <div className={editing ? "pointer-events-none" : "pointer-events-auto"}>
        <LayerBody layer={layer} editing={editing} showId={showId} polls={polls} embeds={embeds} />
      </div>
    </div>
  );
}

/**
 * A layer's own appearance, with no positioning of its own.
 *
 * Exported because the editor's selection box already owns where the
 * thing sits; handing it a positioned LayerView would place the layer
 * twice and fight itself.
 */
export function LayerBody({
  layer,
  editing = false,
  showId,
  polls,
  embeds,
}: {
  layer: ShowLayer;
  editing?: boolean;
  showId?: string;
  polls?: Record<string, PollState>;
  embeds?: Record<string, EmbedState>;
}) {
  const look = lookFor(layer.type, layer.look, layer.tint);

  switch (layer.type) {
    case "text": {
      const { text } = layer.payload as TextPayload;
      return (
        <span
          style={{
            ...look.box,
            ...look.title,
            display: "inline-block",
            maxWidth: DESIGN_WIDTH * 0.78,
            fontSize: 34,
            lineHeight: 1.1,
            fontWeight: 800,
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </span>
      );
    }

    case "sticker": {
      const { emoji } = layer.payload as StickerPayload;
      return (
        <span
          style={{ ...look.box, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          role="img"
          aria-label="Sticker"
        >
          <span style={{ fontSize: 56, lineHeight: 1 }}>{emoji}</span>
        </span>
      );
    }

    case "music": {
      const track = layer.payload as MusicPayload;
      return (
        <span
          style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 10 }}
        >
          <span
            aria-hidden
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              flex: "none",
              background: `conic-gradient(from 210deg, ${look.ink}, #3f6212, ${look.ink})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0a0a0a" }} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.18, minWidth: 0 }}>
            <span style={{ ...look.title, fontSize: 12.5 }}>{track.title}</span>
            <span style={{ ...look.sub, fontSize: 11 }}>{track.artist}</span>
          </span>
        </span>
      );
    }

    case "mention": {
      const { username } = layer.payload as MentionPayload;
      const body = (
        <span style={{ ...look.box, ...look.title, display: "inline-block", fontSize: 15 }}>
          @{username}
        </span>
      );
      // While it is being placed it is a shape, not a link: a drag that
      // ends on it should not navigate away.
      return editing ? body : <Link href={`/u/${username}`}>{body}</Link>;
    }

    case "link": {
      const { url } = layer.payload as LinkPayload;
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // readLayers already refused anything that is not an https URL;
        // a hostname that still will not parse simply shows the url.
      }
      const body = (
        <span style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 9, maxWidth: 230 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={look.ink} strokeWidth="2.4" strokeLinecap="round" style={{ flex: "none" }} aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
          <span style={{ ...look.title, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {host}
          </span>
        </span>
      );
      return editing ? (
        body
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
          {body}
        </a>
      );
    }

    case "poll": {
      const poll = layer.payload as PollPayload;
      // Live only where there is a Show to vote on. In the editor it is
      // a shape being arranged, and a poll that took the author's own
      // vote while they placed it would be answering itself.
      if (editing || !showId) {
        return (
          <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 7, width: 230 }}>
            <span style={{ ...look.title, fontSize: 12.5 }}>{poll.question}</span>
            {poll.options.map((option, i) => (
              <span
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 11,
                  border: `1px solid ${look.ink}40`,
                  ...look.title,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {option}
              </span>
            ))}
            <span style={{ ...look.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Poll
            </span>
          </span>
        );
      }
      return (
        <ShowPoll
          showId={showId}
          layerId={layer.id}
          poll={poll}
          look={look}
          state={polls?.[layer.id]}
        />
      );
    }

    case "question": {
      const question = layer.payload as QuestionPayload;
      if (editing || !showId) {
        return (
          <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 10, width: 230 }}>
            <span style={{ ...look.title, fontSize: 12.5 }}>{question.prompt}</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                height: 36,
                padding: "0 13px",
                borderRadius: 100,
                background: "rgba(255,255,255,0.08)",
                ...look.sub,
                fontSize: 12,
              }}
            >
              Type something…
            </span>
          </span>
        );
      }
      return <ShowQuestion showId={showId} layerId={layer.id} question={question} look={look} />;
    }

    case "post":
    case "shot": {
      const id =
        layer.type === "post"
          ? (layer.payload as PostPayload).postId
          : (layer.payload as ShotPayload).shotId;
      const href = layer.type === "post" ? `/p/${id}` : `/shots/${id}`;
      // The picture is fetched by id and never stored on the layer: a
      // post that is deleted or taken down has to stop appearing inside
      // every Show that embedded it, and a thumbnail copied into the
      // layer would outlive the takedown.
      const embed = embeds?.[layer.id];
      const label = embed?.gone
        ? `This ${layer.type === "post" ? "post" : "Shot"} is gone`
        : embed?.caption?.trim() ||
          (layer.type === "post" ? "Post · tap to open" : "Shot · tap to open");
      const body = (
        <span
          style={{
            ...look.box,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            width: 170,
          }}
        >
          {embed?.thumb && !embed.gone ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={embed.thumb}
              alt=""
              style={{ display: "block", width: "100%", height: 112, objectFit: "cover" }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                display: "block",
                height: 112,
                background: "linear-gradient(160deg, #1b2320 0%, #101010 100%)",
              }}
            />
          )}
          <span
            style={{
              ...look.sub,
              display: "block",
              padding: "8px 10px",
              fontSize: 10.5,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        </span>
      );
      // A layer whose thing is gone stops being a door to it.
      if (editing || embed?.gone) return body;
      return <Link href={href}>{body}</Link>;
    }

    case "location": {
      const { place } = layer.payload as LocationPayload;
      return (
        <span style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 7, maxWidth: 260 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={look.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span style={{ ...look.title, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {place}
          </span>
        </span>
      );
    }

    case "hashtag": {
      const { tag } = layer.payload as HashtagPayload;
      const body = (
        <span style={{ ...look.box, ...look.title, display: "inline-block", fontSize: 15 }}>#{tag}</span>
      );
      return editing ? body : <Link href={`/tag/${encodeURIComponent(tag)}`}>{body}</Link>;
    }

    case "time": {
      const { at } = layer.payload as TimePayload;
      // Shown in the viewer's own clock: the moment is fixed, the reading
      // of it is theirs.
      const label = new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return (
        <span style={{ ...look.box, ...look.title, display: "inline-block", fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
          {label}
        </span>
      );
    }
  }
}

/**
 * Every layer on a Show, in order.
 *
 * Back to front, which is the order the list is stored in, so a layer
 * dragged on top stays on top.
 */
export function LayerStack({
  layers,
  frame,
  editing = false,
  showId,
  polls,
  embeds,
}: {
  layers: ShowLayer[];
  frame: { width: number; height: number };
  editing?: boolean;
  showId?: string;
  polls?: Record<string, PollState>;
  embeds?: Record<string, EmbedState>;
}) {
  // Everything inside a layer — a card's width, a sticker's size, the
  // point size of text — is written once at DESIGN_WIDTH, and the whole
  // stack is then scaled to whatever frame it has been given. The first
  // version let each component carry raw pixels instead, and a text
  // plate authored at 300px promptly hung out of both sides of a 260px
  // preview. One scale here is also one place to get it wrong.
  if (frame.width <= 0 || frame.height <= 0) return null;
  const k = frame.width / DESIGN_WIDTH;
  const design = { width: DESIGN_WIDTH, height: frame.height / k };

  return (
    <div
      className="absolute left-0 top-0"
      style={{
        width: design.width,
        height: design.height,
        transform: `scale(${k})`,
        transformOrigin: "top left",
      }}
    >
      {layers.map((layer) => (
        <LayerView
          key={layer.id}
          layer={layer}
          frame={design}
          editing={editing}
          showId={showId}
          polls={polls}
          embeds={embeds}
        />
      ))}
    </div>
  );
}
