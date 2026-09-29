"use client";

import type { ComponentProps, ReactNode } from "react";
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
  return <img {...rest} src={src} alt={alt} className={className} onError={retry} />;
}

export function ChatVideo({ url, fragment, className, ...rest }: VideoProps) {
  const { src, retry } = useChatMediaUrl(url);
  if (!src) return <span className={`block bg-surface ${className ?? ""}`} aria-hidden />;
  return (
    <video
      {...rest}
      poster={rest.poster ?? BLANK_POSTER}
      src={fragment ? `${src}${fragment}` : src}
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
