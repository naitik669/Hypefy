"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { useChatMediaUrl } from "@/lib/chat-media-url";

/**
 * Chat media that arrives through a signed link.
 *
 * Thin wrappers over img, video and a, so the thread's existing markup keeps
 * its classes and behaviour and only its `src` changes hands. Each draws an
 * empty tile of the same size until the link is ready — a blank square
 * instead of a broken image icon, and no layout jump when it lands.
 *
 * Anything that is not chat media (a GIF, a local preview blob) passes
 * straight through, so callers do not have to know which kind they hold.
 */

type ImgProps = Omit<ComponentProps<"img">, "src"> & { url: string | null | undefined };
type VideoProps = Omit<ComponentProps<"video">, "src"> & {
  url: string | null | undefined;
  /** Appended after signing — a media fragment such as `#t=0.1`. */
  fragment?: string;
};

export function ChatImg({ url, className, alt = "", ...rest }: ImgProps) {
  const { src, retry } = useChatMediaUrl(url);
  if (!src) return <span className={`block bg-surface ${className ?? ""}`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading="lazy" decoding="async" {...rest} src={src} alt={alt} className={className} onError={retry} />;
}

/** How far outside the viewport a video is given its source. */
const ARM_MARGIN = "200px";

/**
 * A video in a thread, which holds a decoder only while it is near the screen.
 *
 * Every video message used to commit its `src` with `preload="metadata"` the
 * moment it rendered, and a thread renders every message it has loaded. Scroll
 * back through a chat full of clips and you accumulate one live decoder per
 * video, with no ceiling. Android's WebView allows somewhere between six and
 * sixteen before it stops decoding — which is the "freezes after a few
 * interactions" report, in the one place the audit had not looked. The reels
 * feed had the identical bug and the identical fix.
 *
 * The source is committed when the element comes within `ARM_MARGIN` of the
 * viewport, and released again when it leaves — but only if it is paused at
 * the very start. A video someone has actually played keeps its source, and
 * therefore its position, because removing `src` would rewind it: scroll away
 * from a clip half-watched, come back, and it would start over. So what gets
 * released is exactly the decoder nobody asked for.
 */
export function ChatVideo({ url, fragment, className, preload = "metadata", ...rest }: VideoProps) {
  const { src, retry } = useChatMediaUrl(url);
  const ref = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(
    // A browser with no observer must show its videos, not a column of blank
    // tiles — unlike the feed's autoplay, where losing the observer costs
    // only an enhancement. Decided here rather than inside the effect so
    // nothing sets state during an effect body and cascades a render. The
    // `window` check keeps the server's answer `false`, which is what it
    // renders for everybody; the one browser old enough to lack
    // IntersectionObserver corrects itself on hydration.
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  );
  const wasArmed = useRef(false);

  /**
   * Dropping the `src` attribute is not enough to free anything: the resource
   * selection algorithm re-runs when `src` is set or changed, never when it is
   * removed, so the element would quietly hold the decoder it already had.
   * `load()` with no source runs the algorithm again and empties it.
   */
  useEffect(() => {
    const el = ref.current;
    if (el && wasArmed.current && !armed) el.load();
    wasArmed.current = armed;
  }, [armed]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const near = entries.some((e) => e.isIntersecting);
        if (near) {
          setArmed(true);
          return;
        }
        const v = ref.current;
        if (v && v.paused && v.currentTime === 0) setArmed(false);
      },
      { rootMargin: ARM_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  if (!src) return <span className={`block bg-surface ${className ?? ""}`} aria-hidden />;
  return (
    <video
      ref={ref}
      {...rest}
      poster={rest.poster ?? BLANK_POSTER}
      src={armed ? (fragment ? `${src}${fragment}` : src) : undefined}
      preload={armed ? preload : "none"}
      className={className}
      onError={retry}
    />
  );
}

/**
 * A link that opens a file — documents. Not a link at all until the signed
 * URL exists, so a tap in that moment does nothing instead of opening a 400.
 */
export function ChatLink({
  url,
  children,
  ...rest
}: Omit<ComponentProps<"a">, "href"> & { url: string; children: ReactNode }) {
  const { src } = useChatMediaUrl(url);
  return (
    <a
      {...rest}
      href={src}
      aria-disabled={!src || undefined}
      onClick={(e) => {
        if (!src) e.preventDefault();
        rest.onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
