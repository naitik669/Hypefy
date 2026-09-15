/**
 * The paywall's hero: the Hypefy mark floating on a night sky, with the
 * things Premium gives you in orbit around it — a framed photo, the badge,
 * a styled bubble, a glowing name. Hand-drawn SVG, so it's crisp at every
 * size and costs no image download. Motion is gentle and stops under
 * reduced motion.
 */
export function PremiumHero() {
  return (
    <svg viewBox="0 0 390 280" className="block h-auto w-full" role="img" aria-label="Hypefy Premium">
      <defs>
        <linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101a07" />
          <stop offset="0.55" stopColor="#0b1210" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
        <radialGradient id="ph-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a3e635" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a3e635" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ph-blue" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3897f0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#3897f0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ph-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1c1c" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="ph-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#ffd000" />
          <stop offset="1" stopColor="#c8911c" />
        </linearGradient>
        <linearGradient id="ph-av" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>

      {/* Sky, ending in a soft wave into the page */}
      <path d="M0 0H390V224C340 250 290 206 232 226C176 246 132 262 80 240C50 228 22 232 0 244Z" fill="url(#ph-sky)" />
      <circle cx="195" cy="126" r="118" fill="url(#ph-glow)" />
      <circle cx="318" cy="70" r="80" fill="url(#ph-blue)" />

      {/* Stars */}
      <g fill="#f5f5f4">
        {[
          [38, 40, 1.6], [92, 22, 1.2], [150, 54, 1], [262, 30, 1.4], [352, 128, 1.2], [28, 150, 1], [300, 196, 1.2], [118, 196, 1],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="hy-anim hy-twinkle" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
      </g>
      <path d="M340 36 L343 44 L351 47 L343 50 L340 58 L337 50 L329 47 L337 44 Z" fill="#a3e635" />
      <path d="M58 92 L60 97 L65 99 L60 101 L58 106 L56 101 L51 99 L56 97 Z" fill="#fde68a" />

      {/* Orbit */}
      <ellipse cx="195" cy="128" rx="150" ry="58" fill="none" stroke="#a3e635" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="3 6" transform="rotate(-8 195 128)" />

      {/* The mark */}
      <g className="hy-anim motion-safe:animate-[ph-float_5s_ease-in-out_infinite]" style={{ transformOrigin: "195px 128px" }}>
        <g transform="rotate(-7 195 128)">
          <rect x="139" y="72" width="112" height="112" rx="34" fill="url(#ph-tile)" stroke="#a3e635" strokeOpacity="0.55" strokeWidth="1.5" />
          <rect x="139" y="72" width="112" height="112" rx="34" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="6" />
          {/* H. */}
          <path d="M168 100 H184 V122 H206 V100 H222 V156 H206 V134 H184 V156 H168 Z" fill="#ffffff" />
          <rect x="228" y="146" width="10" height="10" rx="1" fill="#a3e635" />
        </g>
      </g>

      {/* Framed photo, top left */}
      <g className="hy-anim motion-safe:animate-[ph-float_6s_ease-in-out_infinite_-1s]">
        <g transform="translate(26 18)">
          <rect x="46" y="54" width="46" height="46" rx="14" fill="url(#ph-av)" />
          <text x="69" y="84" textAnchor="middle" fontSize="20" fontWeight="800" fill="#ffffff" fontFamily="var(--font-jakarta), sans-serif">N</text>
          <rect x="43" y="51" width="52" height="52" rx="16" fill="none" stroke="url(#ph-gold)" strokeWidth="3.5" />
          <path d="M90 42 L93 50 L101 53 L93 56 L90 64 L87 56 L79 53 L87 50 Z" fill="#fff1a8" />
        </g>
      </g>

      {/* Verified star, right */}
      <g className="hy-anim motion-safe:animate-[ph-float_5.5s_ease-in-out_infinite_-2s]">
        <g transform="translate(300 96)">
          <circle cx="16" cy="16" r="22" fill="#3897f0" fillOpacity="0.14" />
          <path
            d="M 13.64 7.33 Q 16 4 18.36 7.33 Q 22.21 6.8 21.68 10.64 Q 25 13 21.68 15.36 Q 22.21 19.21 18.36 18.68 Q 16 22 13.64 18.68 Q 9.79 19.21 10.32 15.36 Q 7 13 10.32 10.64 Q 9.79 6.8 13.64 7.33 Z"
            transform="translate(-6.9 -5.3) scale(1.43)"
            fill="#3897f0"
          />
          <path d="M16 8.5 L17.6 13.1 L22.5 13.2 L18.6 16.1 L20 20.8 L16 18 L12 20.8 L13.4 16.1 L9.5 13.2 L14.4 13.1 Z" fill="#ffffff" />
        </g>
      </g>

      {/* Bubble, bottom right */}
      <g className="hy-anim motion-safe:animate-[ph-float_6.5s_ease-in-out_infinite_-3s]">
        <rect x="262" y="176" width="86" height="32" rx="16" fill="#0c1406" stroke="#a3e635" strokeWidth="2" />
        <text x="305" y="197" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#d9ff9e" fontFamily="var(--font-jakarta), sans-serif">being iconic</text>
      </g>

      {/* Glowing name, bottom left */}
      <g className="hy-anim motion-safe:animate-[ph-float_7s_ease-in-out_infinite_-4s]">
        <rect x="40" y="182" width="84" height="30" rx="15" fill="#141414" stroke="#ffffff" strokeOpacity="0.08" />
        <text x="82" y="202" textAnchor="middle" fontSize="15" fill="#e0efff" fontFamily="var(--font-name-script), cursive" style={{ filter: "drop-shadow(0 0 5px #3897f0)" }}>
          Naitik
        </text>
      </g>
    </svg>
  );
}
