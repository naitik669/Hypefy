"use client";

import { useState } from "react";
import Link from "next/link";
import { lookFor, type Look } from "@/lib/show-looks";
import { ShowPoll, ShowQuestion, type PollState } from "@/components/shows/ShowPoll";
import { ShowAddYours, ShowCountdown, ShowQuiz, ShowSlider } from "@/components/shows/ShowStickers";
import type { StickerState } from "@/lib/show-stickers";
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
  type QuizPayload,
  type SliderPayload,
  type CountdownPayload,
  type AddYoursPayload,
  type SpotlightPayload,
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
  stickers,
  isAuthor = false,
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
  /** What viewers have done with the interactive stickers (show_sticker_state). */
  stickers?: StickerState;
  /** The person looking is the one who posted it. */
  isAuthor?: boolean;
}) {
  const box = layerBox(layer, frame);
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, transform: box.transform, transformOrigin: "center" }}
    >
      <div className={editing ? "pointer-events-none" : "pointer-events-auto"}>
        <LayerBody
          layer={layer}
          editing={editing}
          showId={showId}
          polls={polls}
          embeds={embeds}
          stickers={stickers}
          isAuthor={isAuthor}
        />
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
  stickers,
  isAuthor = false,
}: {
  layer: ShowLayer;
  editing?: boolean;
  showId?: string;
  polls?: Record<string, PollState>;
  embeds?: Record<string, EmbedState>;
  /** What viewers have done with the interactive stickers (show_sticker_state). */
  stickers?: StickerState;
  /** The person looking is the one who posted it. */
  isAuthor?: boolean;
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

    case "music":
      return <MusicSticker track={layer.payload as MusicPayload} look={look} editing={editing} />;

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
    case "shot":
    case "spotlight":
      return <EmbedSticker layer={layer} look={look} embed={embeds?.[layer.id]} editing={editing} />;

    case "location": {
      const { place, area } = layer.payload as LocationPayload;
      return (
        <span style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 7, maxWidth: 260 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={look.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.15 }}>
            <span style={{ ...look.title, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {place}
            </span>
            {area && (
              <span style={{ ...look.sub, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {area}
              </span>
            )}
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

    case "quiz": {
      const preview = editing || !showId;
      return (
        <ShowQuiz
          showId={showId}
          layerId={layer.id}
          quiz={layer.payload as QuizPayload}
          look={look}
          state={polls?.[layer.id]}
          preview={preview}
        />
      );
    }

    case "slider":
      return (
        <ShowSlider
          showId={showId}
          layerId={layer.id}
          slider={layer.payload as SliderPayload}
          look={look}
          state={stickers?.sliders[layer.id]}
          isAuthor={isAuthor}
          preview={editing || !showId}
        />
      );

    case "countdown":
      return (
        <ShowCountdown
          showId={showId}
          layerId={layer.id}
          countdown={layer.payload as CountdownPayload}
          look={look}
          reminded={stickers?.reminders.includes(layer.id) ?? false}
          isAuthor={isAuthor}
          preview={editing || !showId}
        />
      );

    case "addyours":
      return (
        <ShowAddYours
          showId={showId}
          layerId={layer.id}
          addYours={layer.payload as AddYoursPayload}
          look={look}
          added={stickers?.added[layer.id] ?? 0}
          isAuthor={isAuthor}
          preview={editing || !showId}
        />
      );

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
  stickers,
  isAuthor = false,
  version = "",
}: {
  layers: ShowLayer[];
  frame: { width: number; height: number };
  editing?: boolean;
  showId?: string;
  polls?: Record<string, PollState>;
  embeds?: Record<string, EmbedState>;
  /** What viewers have done with the interactive stickers (show_sticker_state). */
  stickers?: StickerState;
  /** The person looking is the one who posted it. */
  isAuthor?: boolean;
  /**
   * Changes when what the server knows has arrived. The live stickers take
   * their starting state once, when they mount, and that state lands a
   * moment after the Show does — so they are drawn again when it lands.
   */
  version?: string;
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
          key={`${layer.id}:${version}`}
          layer={layer}
          frame={design}
          editing={editing}
          showId={showId}
          polls={polls}
          embeds={embeds}
          stickers={stickers}
          isAuthor={isAuthor}
        />
      ))}
    </div>
  );
}

/**
 * A song on a Show, in the style its author swiped to.
 *
 * Banner is the default and the old sticker: the disc on the left of a
 * bar with the title. "Music only" is the song with nothing on the
 * picture — while arranging it is a faint pill so it can still be found,
 * and for everyone else it is not drawn at all.
 */
function MusicSticker({ track, look, editing }: { track: MusicPayload; look: Look; editing: boolean }) {
  const style = track.style ?? "banner";
  const disc = (size: number) => (
    <span
      aria-hidden
      className="animate-spin"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        animationDuration: "4s",
        background: `radial-gradient(circle, #0a0a0a 0 ${size * 0.09}px, #e5e5e5 ${size * 0.1}px ${size * 0.16}px, transparent ${size * 0.17}px), conic-gradient(from 30deg, #f9a8d4, #a5b4fc, #67e8f9, #fde68a, #f9a8d4)`,
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.25)",
        display: "block",
        ...(track.artwork
          ? {
              backgroundImage: `radial-gradient(circle, #0a0a0a 0 ${size * 0.09}px, #e5e5e5 ${size * 0.1}px ${size * 0.16}px, transparent ${size * 0.17}px), url("${track.artwork.replace(/"/g, "")}")`,
              backgroundSize: "cover",
            }
          : {}),
      }}
    />
  );
  const lines = (title: number, sub: number) => (
    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.18, minWidth: 0 }}>
      <span style={{ ...look.title, fontSize: title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</span>
      <span style={{ ...look.sub, fontSize: sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist}</span>
    </span>
  );

  if (style === "only") {
    if (!editing) return null;
    return (
      <span style={{ ...look.box, ...look.title, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.8 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={look.ink} aria-hidden>
          <path d="M8.5 6.2V16a3.5 3.5 0 1 1-2-3.2V4.8L21 2.5v4z" />
        </svg>
        Music only
      </span>
    );
  }
  if (style === "cd") {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {disc(92)}
        <span style={{ ...look.box, padding: "4px 10px", maxWidth: 170 }}>{lines(12, 10)}</span>
      </span>
    );
  }
  if (style === "waves") {
    return (
      <span style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 10, maxWidth: 240 }}>
        <span aria-hidden style={{ display: "flex", alignItems: "center", gap: 2.5, height: 30, flex: "none" }}>
          {[0.45, 0.8, 1, 0.6, 0.9, 0.5, 0.75].map((h, i) => (
            <span
              key={i}
              className={editing ? undefined : "animate-eq"}
              style={{ width: 3.5, height: 30 * h, borderRadius: 2, background: look.ink, animationDelay: `${i * 90}ms`, display: "block" }}
            />
          ))}
        </span>
        {lines(12.5, 11)}
      </span>
    );
  }
  if (style === "type") {
    return (
      <span style={{ ...look.box, display: "inline-flex", flexDirection: "column", maxWidth: 240, lineHeight: 0.95 }}>
        <span style={{ ...look.title, fontSize: 26, letterSpacing: "-0.03em", textTransform: "uppercase", overflowWrap: "anywhere" }}>{track.title}</span>
        <span style={{ ...look.sub, fontSize: 11.5, marginTop: 4, fontWeight: 700 }}>{track.artist}</span>
      </span>
    );
  }
  if (style === "cover") {
    return (
      <span style={{ ...look.box, display: "inline-flex", flexDirection: "column", gap: 7, width: 132, padding: 7 }}>
        {track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artwork} alt="" draggable={false} style={{ width: 118, height: 118, borderRadius: 12, objectFit: "cover", display: "block" }} />
        ) : (
          <span aria-hidden style={{ width: 118, height: 118, borderRadius: 12, background: "linear-gradient(135deg, #fbbf24, #db2777)", display: "block" }} />
        )}
        <span style={{ padding: "0 3px 2px" }}>{lines(12, 10.5)}</span>
      </span>
    );
  }
  return (
    <span style={{ ...look.box, display: "inline-flex", alignItems: "center", gap: 10, maxWidth: 250 }}>
      {disc(34)}
      {lines(12.5, 11)}
    </span>
  );
}

/**
 * A post, a Shot or a Spotlight page on a Show.
 *
 * The picture is fetched by id and never stored on the layer: a post that
 * is deleted or taken down has to stop appearing inside every Show that
 * embedded it, and a thumbnail copied into the layer would outlive the
 * takedown. A Shot in its tall style plays where it sits, muted, the way
 * a reel does in a story; tapping it opens it.
 */
function EmbedSticker({
  layer,
  look,
  embed,
  editing,
}: {
  layer: ShowLayer;
  look: Look;
  embed: EmbedState | undefined;
  editing: boolean;
}) {
  if (layer.type === "spotlight") {
    const { ownerId } = layer.payload as SpotlightPayload;
    const body = (
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: 180,
          minHeight: 150,
          padding: 14,
          borderRadius: 22,
          background: embed?.color || "linear-gradient(165deg, #2a3a12, #0e0e0e)",
          color: "#ffffff",
          boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
          Spotlight{embed?.author ? ` · @${embed.author}` : ""}
        </span>
        <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {embed?.gone ? "This page has ended" : embed?.caption || "Your Spotlight page"}
        </span>
      </span>
    );
    if (editing || embed?.gone) return body;
    return <Link href={`/messages/spotlight?page=${encodeURIComponent(ownerId)}`}>{body}</Link>;
  }

  const isShot = layer.type === "shot";
  const id = isShot ? (layer.payload as ShotPayload).shotId : (layer.payload as PostPayload).postId;
  const style = (layer.payload as PostPayload | ShotPayload).style ?? (isShot ? "tall" : "card");
  const href = isShot ? `/shots/${id}` : `/p/${id}`;
  const gone = !!embed?.gone;
  const label = gone
    ? `This ${isShot ? "Shot" : "post"} is gone`
    : embed?.caption?.trim() || (isShot ? "Shot · tap to open" : "Post · tap to open");
  // It plays while being arranged too, so what is placed is what plays.
  const plays = isShot && !gone && !!embed?.video;
  const picture = (w: number, h: number, radius: number) =>
    plays ? (
      <ShotLoop src={embed!.video!} poster={embed?.thumb ?? null} width={w} height={h} radius={radius} />
    ) : embed?.thumb && !gone ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={embed.thumb} alt="" draggable={false} style={{ display: "block", width: w, height: h, objectFit: "cover", borderRadius: radius }} />
    ) : (
      <span aria-hidden style={{ display: "block", width: w, height: h, borderRadius: radius, background: "linear-gradient(160deg, #1b2320 0%, #101010 100%)" }} />
    );
  const byline = embed?.author ? (
    <span style={{ fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{embed.author}</span>
  ) : null;

  let body: React.ReactNode;
  if (style === "tall") {
    body = (
      <span style={{ position: "relative", display: "block", width: 150, height: 266, borderRadius: 22, border: "3px solid #ffffff", overflow: "hidden", boxShadow: "0 14px 30px rgba(0,0,0,0.4)", background: "#111" }}>
        {picture(144, 260, 0)}
        {isShot && !plays && (
          <span aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 46, height: 46, margin: "-23px 0 0 -23px", borderRadius: 16, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l13-7.5z" /></svg>
          </span>
        )}
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 10px 9px", background: "linear-gradient(transparent, rgba(0,0,0,0.75))", color: "#fff", display: "flex", flexDirection: "column", gap: 2 }}>
          {byline}
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </span>
      </span>
    );
  } else if (style === "compact") {
    body = (
      <span style={{ ...look.box, display: "flex", alignItems: "center", gap: 10, width: 240, padding: "7px 14px 7px 7px" }}>
        <span style={{ flex: "none" }}>{picture(54, 54, 13)}</span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
          <span style={{ ...look.title, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ ...look.sub, fontSize: 11, fontWeight: 700 }}>
            {embed?.author ? `@${embed.author} · ` : ""}
            {isShot ? "Shot" : "Post"}
          </span>
        </span>
      </span>
    );
  } else if (style === "bubble") {
    body = (
      <span style={{ display: "block", width: 104, height: 104, borderRadius: "50%", border: "4px solid #a3e635", overflow: "hidden", boxShadow: "0 10px 24px rgba(0,0,0,0.4)" }}>
        {picture(96, 96, 48)}
      </span>
    );
  } else {
    body = (
      <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 7, width: 178, padding: 8, overflow: "hidden" }}>
        {byline && <span style={{ ...look.title, padding: "0 3px" }}>{byline}</span>}
        {picture(162, 170, 13)}
        <span style={{ ...look.sub, fontSize: 11.5, fontWeight: 700, padding: "0 3px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </span>
    );
  }
  // A layer whose thing is gone stops being a door to it.
  if (editing || gone) return body;
  return <Link href={href}>{body}</Link>;
}

/** A Shot playing in place: muted, round and round, with how far along it is. */
function ShotLoop({ src, poster, width, height, radius }: { src: string; poster: string | null; width: number; height: number; radius: number }) {
  const [progress, setProgress] = useState(0);
  return (
    <span style={{ position: "relative", display: "block", width, height }}>
      <video
        src={src}
        poster={poster ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress(v.currentTime / v.duration);
        }}
        style={{ display: "block", width, height, objectFit: "cover", borderRadius: radius }}
      />
      {height > 120 && (
        <span aria-hidden style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.35)" }}>
          <span style={{ display: "block", height: 3, borderRadius: 2, width: `${progress * 100}%`, background: "#fff" }} />
        </span>
      )}
    </span>
  );
}
