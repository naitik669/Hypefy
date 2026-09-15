/**
 * The paywall's hero, kept deliberately quiet: the Hypefy mark in a single
 * tile on near-black, a faint lime light behind it, two hairline squircles
 * echoing the avatar frames, and the badge on its corner. Everything else on
 * the page is words and choices, so the hero only has to feel expensive.
 */
export function PremiumHero() {
  return (
    <svg viewBox="0 0 390 260" className="block h-auto w-full" role="img" aria-label="Hypefy Premium">
      <defs>
        <radialGradient id="ph-light" cx="0.5" cy="0.46" r="0.5">
          <stop offset="0" stopColor="#a3e635" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#a3e635" stopOpacity="0.04" />
          <stop offset="1" stopColor="#a3e635" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ph-tile" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#1f1f1f" />
          <stop offset="1" stopColor="#0b0b0b" />
        </linearGradient>
        <linearGradient id="ph-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#a3e635" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="ph-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.7" stopColor="#0a0a0a" stopOpacity="0" />
          <stop offset="1" stopColor="#0a0a0a" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="390" height="260" fill="#0a0a0a" />
      <ellipse cx="195" cy="122" rx="210" ry="150" fill="url(#ph-light)" />

      {/* Hairline squircles */}
      <rect x="99" y="30" width="192" height="192" rx="60" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
      <rect x="123" y="54" width="144" height="144" rx="46" fill="none" stroke="#ffffff" strokeOpacity="0.08" />

      {/* The mark */}
      <g className="hy-anim motion-safe:animate-[ph-float_6s_ease-in-out_infinite]">
        <rect x="147" y="78" width="96" height="96" rx="30" fill="url(#ph-tile)" />
        <rect x="147.5" y="78.5" width="95" height="95" rx="29.5" fill="none" stroke="url(#ph-edge)" />
        <path d="M172 104 H184 V121 H202 V104 H214 V148 H202 V131 H184 V148 H172 Z" fill="#fafafa" />
        <rect x="219" y="140" width="8" height="8" rx="1" fill="#a3e635" />

        {/* Badge on the corner */}
        <g transform="translate(225 64)">
          <circle cx="12" cy="12" r="14" fill="#0a0a0a" />
          <path
            d="M 9.32 5.53 Q 12 2 14.68 5.53 Q 19.07 4.93 18.47 9.32 Q 22 12 18.47 14.68 Q 19.07 19.07 14.68 18.47 Q 12 22 9.32 18.47 Q 4.93 19.07 5.53 14.68 Q 2 12 5.53 9.32 Q 4.93 4.93 9.32 5.53 Z"
            fill="#3897f0"
          />
          <path d="M12 6 L13.41 10.06 L17.71 10.15 L14.28 12.74 L15.53 16.85 L12 14.4 L8.47 16.85 L9.72 12.74 L6.29 10.15 L10.59 10.06 Z" fill="#ffffff" />
        </g>
      </g>

      <rect width="390" height="260" fill="url(#ph-fade)" />
    </svg>
  );
}
