"use client";

import { useId } from "react";

/**
 * A decoration on an avatar.
 *
 * Drawn over the photo in the photo's own 100×100 square: the photo keeps
 * its full size and its place in the layout, and nothing reaches past it.
 * Rings sit right at the edge and are thick enough to read at feed size;
 * accents (a crown, a star, hearts) are drawn inside the square rather than
 * poking out, so there is nothing to trim.
 *
 * `id` null renders the avatar alone, so call sites can pass whatever the
 * wearer currently has without a branch.
 */
export function AvatarFrame({
  id,
  size,
  children,
}: {
  id: string | null | undefined;
  size: number;
  children: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  if (!id) return <>{children}</>;
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {children}
      <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
        <Frame id={id} uid={uid} />
      </svg>
    </span>
  );
}

/**
 * A ring whose outer edge is the photo's edge. The avatar is a squircle with
 * 30% corners, so a stroke of width `w` centred `w/2` in keeps that shape.
 */
function Ring({ w, stroke, opacity, filter }: { w: number; stroke: string; opacity?: number; filter?: string }) {
  const i = w / 2;
  return (
    <rect
      x={i}
      y={i}
      width={100 - w}
      height={100 - w}
      rx={30 - i}
      fill="none"
      stroke={stroke}
      strokeWidth={w}
      strokeOpacity={opacity}
      filter={filter}
    />
  );
}

/** A four-pointed sparkle centred on (x, y). */
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** A heart centred on (x, y), `s` units across. */
const heart = (x: number, y: number, s: number) => {
  const k = s / 12;
  return `M${x} ${y + 4 * k} C${x - 1 * k} ${y - 1 * k} ${x - 6 * k} ${y - 2 * k} ${x - 6 * k} ${y - 5 * k} C${x - 6 * k} ${y - 8 * k} ${x - 2 * k} ${y - 9 * k} ${x} ${y - 6 * k} C${x + 2 * k} ${y - 9 * k} ${x + 6 * k} ${y - 8 * k} ${x + 6 * k} ${y - 5 * k} C${x + 6 * k} ${y - 2 * k} ${x + 1 * k} ${y - 1 * k} ${x} ${y + 4 * k}Z`;
};

/** A five-pointed star centred on (x, y), outer radius `r`. */
const star = (x: number, y: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)} ${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")}Z`;
};

function Frame({ id, uid }: { id: string; uid: string }) {
  switch (id) {
    case "deco-halo":
      return (
        <>
          <defs>
            <linearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff7c2" />
              <stop offset="0.45" stopColor="#ffd000" />
              <stop offset="1" stopColor="#ff9a3c" />
            </linearGradient>
          </defs>
          <Ring w={7} stroke={`url(#h${uid})`} />
          <rect x="7.5" y="7.5" width="85" height="85" rx="22.5" fill="none" stroke="#ffd000" strokeOpacity="0.45" strokeWidth="2" className="hy-anim motion-safe:animate-pulse" />
        </>
      );
    case "deco-sparkle":
      return (
        <>
          <Ring w={4.5} stroke="#ffffff" opacity={0.9} />
          <path d={spark(80, 20, 11)} fill="#ffffff" />
          <path d={spark(66, 11, 4)} fill="#bfe3ff" />
          <path d={spark(20, 80, 8)} fill="#ffffff" />
          <path d={spark(33, 90, 3)} fill="#bfe3ff" />
        </>
      );
    case "deco-neon":
      return (
        <>
          <defs>
            <filter id={`n${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>
          <rect x="5" y="5" width="90" height="90" rx="25" fill="none" stroke="#a3e635" strokeWidth="5" filter={`url(#n${uid})`} />
          <rect x="5" y="5" width="90" height="90" rx="25" fill="none" stroke="#e7ffc2" strokeWidth="2.5" />
          <Ring w={2} stroke="#3897f0" opacity={0.9} />
        </>
      );
    case "deco-flames":
      return (
        <>
          <defs>
            <linearGradient id={`f${uid}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#ff3d00" />
              <stop offset="0.55" stopColor="#ff9a1f" />
              <stop offset="1" stopColor="#ffe45e" />
            </linearGradient>
          </defs>
          <Ring w={4.5} stroke="#ff7a1a" />
          {[
            [20, 97, 0.8], [35, 99, 1.05], [50, 100, 1.3], [65, 99, 1.05], [80, 97, 0.8],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d={`M${x} ${y} C${x - 7 * s} ${y - 6 * s} ${x - 3 * s} ${y - 14 * s} ${x} ${y - 20 * s} C${x + 1 * s} ${y - 13 * s} ${x + 8 * s} ${y - 9 * s} ${x} ${y}Z`}
              fill={`url(#f${uid})`}
            />
          ))}
        </>
      );
    case "deco-crown":
      return (
        <>
          <defs>
            <linearGradient id={`c${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1a8" />
              <stop offset="1" stopColor="#e0a100" />
            </linearGradient>
          </defs>
          <Ring w={4.5} stroke="#f5c542" />
          <g transform="rotate(-24 24 22)">
            <path d="M8 32 L10 12 L18 22 L24 6 L30 22 L38 12 L40 32 Z" fill={`url(#c${uid})`} stroke="#8a5a00" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="24" cy="27" r="2.5" fill="#ff4f7b" />
            <circle cx="15" cy="28" r="1.6" fill="#3897f0" />
            <circle cx="33" cy="28" r="1.6" fill="#3897f0" />
          </g>
        </>
      );
    case "deco-hearts":
      return (
        <>
          <Ring w={4.5} stroke="#ff7ab8" />
          <path d={heart(78, 20, 18)} fill="#ff4fa3" />
          <path d={heart(90, 36, 8)} fill="#ff9ad5" />
          <path d={heart(20, 80, 14)} fill="#ff4fa3" />
        </>
      );
    case "deco-holo":
      return (
        <>
          <defs>
            <linearGradient id={`o${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff9ad5" />
              <stop offset="0.25" stopColor="#a5b4fc" />
              <stop offset="0.5" stopColor="#7dd3fc" />
              <stop offset="0.75" stopColor="#86efac" />
              <stop offset="1" stopColor="#fde68a" />
            </linearGradient>
          </defs>
          <Ring w={8} stroke={`url(#o${uid})`} />
        </>
      );
    case "deco-8bit":
      return (
        <g shapeRendering="crispEdges">
          <Ring w={7} stroke="#052e16" />
          <Ring w={4} stroke="#22c55e" />
          {[[12, 12], [82, 12], [12, 82], [82, 82]].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x} y={y} width="6" height="6" fill="#86efac" />
          ))}
        </g>
      );
    case "deco-bolt":
      return (
        <>
          <Ring w={5} stroke="#fde047" />
          <path
            d="M80 6 L66 30 L76 30 L68 48 L90 20 L79 20 L88 6 Z"
            fill="#fde047"
            stroke="#713f12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </>
      );
    case "deco-petals":
      return (
        <>
          <Ring w={4.5} stroke="#fb7185" />
          <ellipse cx="78" cy="18" rx="11" ry="6" transform="rotate(-40 78 18)" fill="#fda4af" />
          <ellipse cx="88" cy="31" rx="6" ry="3.5" transform="rotate(20 88 31)" fill="#fb7185" />
          <ellipse cx="22" cy="82" rx="10" ry="5.5" transform="rotate(-40 22 82)" fill="#fb7185" />
          <ellipse cx="12" cy="69" rx="5" ry="3" transform="rotate(30 12 69)" fill="#fda4af" />
        </>
      );
    case "deco-hypestar":
      return (
        <>
          <Ring w={5.5} stroke="#ffd000" />
          <path d={star(78, 22, 13)} fill="#ffd000" stroke="#5c4300" strokeWidth="1.4" strokeLinejoin="round" />
        </>
      );
    case "deco-gilded":
      return (
        <>
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff1a8" />
              <stop offset="0.35" stopColor="#c8911c" />
              <stop offset="0.6" stopColor="#fff1a8" />
              <stop offset="1" stopColor="#a8781a" />
            </linearGradient>
          </defs>
          <Ring w={9} stroke={`url(#g${uid})`} />
          <rect x="9" y="9" width="82" height="82" rx="21" fill="none" stroke="#5c4300" strokeOpacity="0.55" strokeWidth="1" />
        </>
      );
    default:
      return null;
  }
}
