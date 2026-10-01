import Link from "next/link";

/**
 * The 404: the offline page's saucer, now taking a page with it.
 *
 * It is the same craft, drawn the same way, because offline and not-found are
 * the two ways the app has of saying "there is nothing here" — one story told
 * twice rather than two unrelated screens. The page rises up the beam, fades,
 * and comes back, which is the only moving part.
 *
 * Styled with the app's own classes rather than inline, unlike global-error:
 * a 404 is a routed page, so the stylesheet is there. The keyframes live in
 * globals.css beside the rest (`lost-*`).
 */
export default function NotFound() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-3.5 overflow-hidden bg-background px-6 text-center">
      {/* The same few stars that drift behind the offline page. */}
      <span className="lost-star" style={{ top: "11%", left: "12%" }} />
      <span className="lost-star" style={{ top: "20%", right: "14%" }} />
      <span className="lost-star" style={{ bottom: "18%", left: "16%" }} />
      <span className="lost-star" style={{ bottom: "11%", right: "12%" }} />
      <span className="lost-dust" style={{ top: "8%", right: "30%" }} />
      <span className="lost-dust" style={{ top: "48%", left: "7%" }} />
      <span className="lost-dust" style={{ top: "55%", right: "8%" }} />

      <svg
        viewBox="0 0 240 190"
        aria-hidden
        className="-mb-1.5 h-auto w-[min(72vw,280px)] overflow-visible"
      >
        <g className="lost-drift">
          <path d="M79 62 A41 38 0 0 1 161 62 Z" fill="#1c1c1c" stroke="#333" strokeWidth="2.4" />
          <path d="M98 38 Q108 28 122 27" stroke="#333" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M120 23 V8" stroke="#333" strokeWidth="3" strokeLinecap="round" />
          <circle cx="120" cy="5" r="4.8" fill="#333" />
          <ellipse cx="120" cy="74" rx="101" ry="24" fill="#262626" />
          <ellipse cx="120" cy="67" rx="101" ry="12" fill="#333" />
          <circle className="lost-blink" cx="58" cy="81" r="5.4" fill="#333" />
          <circle className="lost-blink lost-b2" cx="96" cy="87" r="5.4" fill="#333" />
          <circle className="lost-blink lost-b3" cx="144" cy="87" r="5.4" fill="#333" />
          <circle className="lost-blink lost-b4" cx="182" cy="81" r="5.4" fill="#333" />
        </g>
        <path className="lost-beam" d="M92 86 L62 176 H178 L148 86 Z" fill="#fff" opacity="0.05" />
        <path d="M92 86 L62 176" stroke="#333" strokeWidth="1.5" opacity="0.6" />
        <path d="M148 86 L178 176" stroke="#333" strokeWidth="1.5" opacity="0.6" />
        <g className="lost-lift">
          <rect x="100" y="120" width="40" height="52" rx="6" fill="#1c1c1c" stroke="#333" strokeWidth="2.2" />
          <rect x="109" y="133" width="22" height="3" rx="1.5" fill="#333" />
          <rect x="109" y="143" width="16" height="3" rx="1.5" fill="#333" />
        </g>
      </svg>

      <svg viewBox="0 0 40 40" aria-hidden className="h-[72px] w-[72px]">
        <rect fill="#fff" x="4" y="5.8" width="7" height="28.4" />
        <rect fill="#fff" x="21.8" y="5.8" width="6.8" height="28.4" />
        <rect fill="#fff" x="4" y="16.8" width="24.6" height="5.8" />
        <rect fill="#a3e635" x="31.4" y="29.6" width="4.6" height="4.6" />
      </svg>

      <h1 className="mt-2.5 text-[26px] font-extrabold uppercase leading-[1.2] tracking-[-0.01em]">
        This page got beamed up<span className="text-accent">.</span>
      </h1>
      <p className="mt-0.5 max-w-[280px] text-sm leading-[1.5] text-muted">
        It moved, expired, or never existed.
      </p>
      <Link
        href="/home"
        className="mt-3 rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-extrabold text-accent-ink transition-transform active:scale-95"
      >
        Back to home
      </Link>
    </div>
  );
}
