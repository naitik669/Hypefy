"use client";

import { useId } from "react";

/**
 * A decoration around an avatar.
 *
 * Drawn as an overlay a little larger than the avatar, so the frame sits
 * around the squircle without changing the avatar's size or the layout
 * around it. The viewBox is 140 units with the avatar filling 20–120.
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
  const pad = size * 0.2;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 140 140"
        className="pointer-events-none absolute"
        style={{ left: -pad, top: -pad, width: size + pad * 2, height: size + pad * 2, overflow: "visible" }}
      >
        <Frame id={id} uid={uid} />
      </svg>
    </span>
  );
}

/** A four-pointed sparkle centred on (x, y). */
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** A heart whose top-centre dip is at (x, y). */
const heart = (x: number, y: number, s: number) =>
  `M${x} ${y + 3 * s} C${x - 1 * s} ${y - 1 * s} ${x - 6 * s} ${y - 1 * s} ${x - 6 * s} ${y + 3 * s} C${x - 6 * s} ${y + 7 * s} ${x} ${y + 10 * s} ${x} ${y + 12 * s} C${x} ${y + 10 * s} ${x + 6 * s} ${y + 7 * s} ${x + 6 * s} ${y + 3 * s} C${x + 6 * s} ${y - 1 * s} ${x + 1 * s} ${y - 1 * s} ${x} ${y + 3 * s}Z`;

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
          <rect x="13" y="13" width="114" height="114" rx="38" fill="none" stroke={`url(#h${uid})`} strokeWidth="5" />
          <rect x="13" y="13" width="114" height="114" rx="38" fill="none" stroke="#ffd000" strokeOpacity="0.35" strokeWidth="11" className="motion-safe:animate-pulse" />
        </>
      );
    case "deco-sparkle":
      return (
        <>
          <rect x="14" y="14" width="112" height="112" rx="37" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="3" />
          <path d={spark(118, 20, 13)} fill="#ffffff" />
          <path d={spark(99, 9, 6)} fill="#bfe3ff" />
          <path d={spark(21, 121, 10)} fill="#ffffff" />
          <path d={spark(8, 100, 5)} fill="#bfe3ff" />
          <circle cx="132" cy="44" r="2.5" fill="#ffffff" />
        </>
      );
    case "deco-neon":
      return (
        <>
          <defs>
            <filter id={`n${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
          </defs>
          <rect x="14" y="14" width="112" height="112" rx="37" fill="none" stroke="#a3e635" strokeWidth="6" filter={`url(#n${uid})`} />
          <rect x="14" y="14" width="112" height="112" rx="37" fill="none" stroke="#e7ffc2" strokeWidth="2.5" />
          <rect x="7" y="7" width="126" height="126" rx="42" fill="none" stroke="#3897f0" strokeOpacity="0.8" strokeWidth="2" />
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
          <rect x="15" y="15" width="110" height="110" rx="36" fill="none" stroke="#ff7a1a" strokeWidth="3" />
          {[
            [22, 128, 1.1], [44, 134, 1.4], [70, 136, 1.7], [96, 134, 1.4], [118, 128, 1.1],
            [132, 96, 0.9], [8, 96, 0.9],
          ].map(([x, y, s], i) => (
            <path
              key={i}
              d={`M${x} ${y} C${x - 9 * s} ${y - 8 * s} ${x - 4 * s} ${y - 18 * s} ${x} ${y - 26 * s} C${x + 1 * s} ${y - 17 * s} ${x + 10 * s} ${y - 12 * s} ${x} ${y}Z`}
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
          <rect x="15" y="15" width="110" height="110" rx="36" fill="none" stroke="#f5c542" strokeWidth="3" />
          <g transform="rotate(-22 30 22)">
            <path d="M8 34 L12 10 L22 22 L30 4 L38 22 L48 10 L52 34 Z" fill={`url(#c${uid})`} stroke="#8a5a00" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="30" cy="27" r="3" fill="#ff4f7b" />
            <circle cx="17" cy="28" r="2" fill="#3897f0" />
            <circle cx="43" cy="28" r="2" fill="#3897f0" />
          </g>
        </>
      );
    case "deco-hearts":
      return (
        <>
          <rect x="15" y="15" width="110" height="110" rx="36" fill="none" stroke="#ff7ab8" strokeWidth="3" />
          <path d={heart(118, 6, 2.2)} fill="#ff4fa3" />
          <path d={heart(135, 36, 1.2)} fill="#ff9ad5" />
          <path d={heart(16, 112, 1.9)} fill="#ff4fa3" />
          <path d={heart(4, 90, 1)} fill="#ff9ad5" />
        </>
      );
    default:
      return null;
  }
}
