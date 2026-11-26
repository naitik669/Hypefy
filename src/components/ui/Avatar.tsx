import Image from "next/image";
import { canOptimize } from "@/lib/image-hosts";

/**
 * Rounded-square avatar (Hypefy uses squircles, not circles — a small
 * differentiator from Instagram). Falls back to a gradient + initial.
 *
 * The picture goes through next/image. It used to be a raw <img> with
 * no srcset and no lazy attribute, pointed straight at the upload —
 * and ImageCropper writes those at 1080px, so a feed screen with
 * fifteen faces pulled fifteen full-resolution photographs to paint
 * them into 40px boxes. There are 125 call sites, which is why this
 * one file was the cheapest win in the performance audit.
 *
 * Deliberately not using OptimizedImage: that is a Client Component
 * with load state, and turning every avatar into a client island
 * would trade one cost for another. This stays a Server Component —
 * next/image works in one, and a 40px square has no use for blur-up.
 */
export function Avatar({
  name,
  hue = 200,
  size = 40,
  src,
  className = "",
}: {
  name: string;
  hue?: number;
  size?: number;
  src?: string;
  className?: string;
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] ${className}`}
      style={{
        width: size,
        height: size,
        /*
         * The gradient TURNS rather than darkens: same lightness and
         * saturation at both ends, the hue carried round by 36°.
         *
         * It used to run from 52% lightness to 38% at a lower saturation,
         * which on half the hues landed in olive or mud — the thing that
         * made a row of faces over a video look cheap. Holding the
         * lightness keeps every hue the colour it started as.
         */
        background: src
          ? undefined
          : `linear-gradient(145deg, hsl(${hue} 72% 64%) 0%, hsl(${hue} 63% 57%) 45%, hsl(${(hue + 36) % 360} 63% 57%) 100%)`,
      }}
    >
      {src ? (
        canOptimize(src) ? (
          <Image
            src={src}
            alt={name}
            width={size}
            height={size}
            // Avatars are fixed-size, so one candidate at 1x and one at
            // 2x is the whole useful srcset; `sizes` in px keeps Next
            // from generating the full viewport ladder for a 40px box.
            sizes={`${size}px`}
            className="h-full w-full object-cover"
          />
        ) : (
          // An unexpected host — a future OAuth provider's CDN, say.
          // next/image throws on those, so it never sees them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <span
          // The gradient no longer falls to a dark end, so the letter has
          // less to sit against: the shadow is what carries it now.
          className="font-bold text-white"
          style={{ fontSize: size * 0.4, textShadow: "0 1px 2px rgba(0,0,0,0.38)" }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
