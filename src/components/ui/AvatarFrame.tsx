"use client";

import { useId } from "react";

/**
 * How far a frame may reach past the photo, as a share of the photo's size,
 * on every side. The photo is the 0–100 square of the drawing; frames draw
 * anywhere in −REACH…100+REACH.
 */
const REACH = 50;

/**
 * A decoration on an avatar: a ring and accents around it.
 *
 * The photo keeps its full size and the avatar keeps its exact place in the
 * layout: the frame is an overlay that is allowed to reach past the photo
 * (up to half its size on each side), the way decorations do on Discord.
 * Nothing around the avatar moves.
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
  const pad = (size * REACH) / 100;
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {children}
      <svg
        aria-hidden
        viewBox={`${-REACH} ${-REACH} ${100 + 2 * REACH} ${100 + 2 * REACH}`}
        className="pointer-events-none absolute"
        style={{ left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad, overflow: "visible" }}
      >
        <Frame id={id} uid={uid} />
      </svg>
    </span>
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

/**
 * Laurel leaves climbing both sides of the photo from the bottom, as
 * [cx, cy, rotation] per leaf. Angles run clockwise from the right, y down.
 */
const laurel = (() => {
  const leaves: [number, number, number][] = [];
  const R = 63;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const deg = 90 + side * (14 + i * 17);
      const a = (deg * Math.PI) / 180;
      const out = i % 2 === 0 ? 3.5 : -3.5;
      leaves.push([
        50 + (R + out) * Math.cos(a),
        50 + (R + out) * Math.sin(a),
        deg + 90 + side * 30 * (i % 2 === 0 ? 1 : -1),
      ]);
    }
  }
  return leaves;
})();

/**
 * The frames: accents only, placed around the photo. No rings or borders —
 * the photo's own edge is the frame, and the accent is the decoration.
 */
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
          <ellipse cx="50" cy="-12" rx="32" ry="8" fill="none" stroke="#ffd000" strokeOpacity="0.25" strokeWidth="9" />
          <ellipse cx="50" cy="-12" rx="32" ry="8" fill="none" stroke={`url(#h${uid})`} strokeWidth="4.5" className="hy-anim motion-safe:animate-pulse" />
        </>
      );
    case "deco-sparkle":
      return (
        <>
          <path d={spark(98, 2, 14)} fill="#ffffff" />
          <path d={spark(80, -12, 5)} fill="#bfe3ff" />
          <path d={spark(2, 98, 11)} fill="#ffffff" />
          <path d={spark(-12, 80, 4)} fill="#bfe3ff" />
          <circle cx="112" cy="30" r="2.5" fill="#ffffff" />
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
          {[
            [-4, 86, 0.9], [12, 106, 1.1], [32, 110, 1.35], [50, 112, 1.6], [68, 110, 1.35], [88, 106, 1.1], [104, 86, 0.9],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d={`M${x} ${y} C${x - 8 * s} ${y - 7 * s} ${x - 3 * s} ${y - 16 * s} ${x} ${y - 23 * s} C${x + 1 * s} ${y - 15 * s} ${x + 9 * s} ${y - 10 * s} ${x} ${y}Z`}
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
          <g transform="rotate(-22 14 4)">
            <path d="M-10 18 L-7 -8 L4 6 L14 -14 L24 6 L35 -8 L38 18 Z" fill={`url(#c${uid})`} stroke="#8a5a00" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="14" cy="11" r="3" fill="#ff4f7b" />
            <circle cx="2" cy="12" r="2" fill="#3897f0" />
            <circle cx="26" cy="12" r="2" fill="#3897f0" />
          </g>
        </>
      );
    case "deco-hearts":
      return (
        <>
          <path d={heart(96, 2, 24)} fill="#ff4fa3" />
          <path d={heart(114, 26, 11)} fill="#ff9ad5" />
          <path d={heart(2, 98, 18)} fill="#ff4fa3" />
          <path d={heart(-14, 78, 9)} fill="#ff9ad5" />
        </>
      );
    case "deco-holo":
      // Iridescent sparkles: the Sparkle frame's shape in holographic foil.
      return (
        <>
          <defs>
            <linearGradient id={`o${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff9ad5" />
              <stop offset="0.3" stopColor="#a5b4fc" />
              <stop offset="0.55" stopColor="#7dd3fc" />
              <stop offset="0.8" stopColor="#86efac" />
              <stop offset="1" stopColor="#fde68a" />
            </linearGradient>
          </defs>
          <path d={spark(98, 0, 17)} fill={`url(#o${uid})`} />
          <path d={spark(118, 26, 6)} fill={`url(#o${uid})`} />
          <path d={spark(0, 100, 12)} fill={`url(#o${uid})`} />
          <path d={spark(-16, 76, 5)} fill={`url(#o${uid})`} />
        </>
      );
    case "deco-8bit":
      return (
        <g shapeRendering="crispEdges">
          {[[-10, -10], [102, -10], [-10, 102], [102, 102]].map(([x, y]) => (
            <g key={`${x}${y}`}>
              <rect x={x - 1} y={y - 1} width="10" height="10" fill="#052e16" />
              <rect x={x} y={y} width="8" height="8" fill="#22c55e" />
              <rect x={x + 2} y={y + 2} width="3" height="3" fill="#86efac" />
            </g>
          ))}
        </g>
      );
    case "deco-bolt":
      return (
        <path
          d="M104 -22 L84 12 L98 12 L86 40 L118 0 L102 0 L114 -22 Z"
          fill="#fde047"
          stroke="#713f12"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case "deco-petals":
      return (
        <>
          <ellipse cx="96" cy="2" rx="15" ry="8" transform="rotate(-40 96 2)" fill="#fda4af" />
          <ellipse cx="112" cy="20" rx="8" ry="4.5" transform="rotate(20 112 20)" fill="#fb7185" />
          <ellipse cx="4" cy="98" rx="14" ry="7.5" transform="rotate(-40 4 98)" fill="#fb7185" />
          <ellipse cx="-12" cy="80" rx="7" ry="4" transform="rotate(30 -12 80)" fill="#fda4af" />
        </>
      );
    case "deco-hypestar":
      return <path d={star(96, 4, 18)} fill="#ffd000" stroke="#5c4300" strokeWidth="1.5" strokeLinejoin="round" />;
    case "deco-gilded":
      // A gold laurel wreath rising up both sides from under the photo.
      return (
        <>
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff1a8" />
              <stop offset="0.5" stopColor="#d9a21c" />
              <stop offset="1" stopColor="#a8781a" />
            </linearGradient>
          </defs>
          {laurel.map(([x, y, r], i) => (
            <ellipse
              key={i}
              cx={x.toFixed(2)}
              cy={y.toFixed(2)}
              rx="7"
              ry="3.2"
              transform={`rotate(${r.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`}
              fill={`url(#g${uid})`}
              stroke="#5c4300"
              strokeOpacity="0.5"
              strokeWidth="0.8"
            />
          ))}
          <circle cx="50" cy="114" r="3.5" fill={`url(#g${uid})`} stroke="#5c4300" strokeOpacity="0.5" strokeWidth="0.8" />
        </>
      );
    default:
      return null;
  }
}
