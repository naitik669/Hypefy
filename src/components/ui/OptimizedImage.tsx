"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Hosts configured in next.config `images.remotePatterns`. next/image throws at
 * runtime for any un-configured host, so we only hand it URLs we know it can
 * optimise; everything else falls through to a plain <img>.
 */
const OPTIMIZABLE_HOSTS = new Set(["fyaioseridqabockidyp.supabase.co"]);

function canOptimize(src: string): boolean {
  // Local (public/) and inline data URLs are always safe for next/image.
  if (src.startsWith("/") || src.startsWith("data:")) return true;
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

/**
 * Fill-mode image that optimises allowlisted hosts (resized srcset + WebP/AVIF)
 * and falls back to a plain lazy <img> for any other URL — so unexpected user
 * media never crashes the render. The parent must be `position: relative` with
 * a defined size (e.g. `relative aspect-square w-full`). Media blur-up: a
 * surface-colored placeholder sits behind, and the pixels settle in with a
 * short blur→sharp fade — no layout shift, no white flash.
 */
export function OptimizedImage({
  src,
  alt,
  sizes,
  className = "object-cover",
  draggable,
  priority,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  draggable?: boolean;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const loadCls = loaded ? "animate-img-in" : "opacity-0";

  return (
    <>
      {/* Placeholder behind the image — vanishes once pixels arrive */}
      {!loaded && <span aria-hidden className="absolute inset-0 bg-surface" />}
      {canOptimize(src) ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={`${className} ${loadCls}`}
          draggable={draggable}
          priority={priority}
          onLoad={() => setLoaded(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${className} ${loadCls}`}
          draggable={draggable}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      )}
    </>
  );
}
