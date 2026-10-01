"use client";

/**
 * Root error boundary: a satellite that stopped working.
 *
 * Deliberately not the 404's saucer. A missing page and a crash are different
 * things to be told, and one picture for both would make our fault look like
 * a typo in the address. This one is plainly broken — a panel hanging off its
 * hinge, the antenna snapped, the whole thing tumbling — and it offers Try
 * again first, because a crash is usually worth one reload.
 *
 * Kept free of any @sentry/nextjs import — the Sentry client SDK doesn't
 * instantiate cleanly under Next 16's Turbopack and was blanking client
 * pages. Server-side errors are still captured via instrumentation.ts
 * (onRequestError).
 *
 * Inline styles and a <style> tag of its own, with no class from the app:
 * this renders when the app shell and its stylesheet have failed, so
 * everything it needs has to be in this file — the same reasoning, and the
 * same look, as offline.html.
 */

const LIME = "#a3e635";
const LINE = "#333";

const CSS = `
  @keyframes crash-tumble { 0%,100% { transform: rotate(-7deg) translateY(0) } 50% { transform: rotate(6deg) translateY(-8px) } }
  @keyframes crash-panel { 0%,100% { transform: rotate(16deg) } 50% { transform: rotate(31deg) } }
  @keyframes crash-blink { 0%,100% { fill: #333 } 50% { fill: #4a4a4a } }
  .crash-tumble { animation: crash-tumble 9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .crash-panel { animation: crash-panel 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
  .crash-blink { animation: crash-blink 2.4s ease-in-out infinite; }
  .crash-star, .crash-dust { position: absolute; pointer-events: none; }
  .crash-star { width: 9px; height: 9px; }
  .crash-star::before, .crash-star::after { content: ""; position: absolute; background: #333; border-radius: 1px; }
  .crash-star::before { left: 3.7px; top: 0; width: 1.6px; height: 9px; }
  .crash-star::after { top: 3.7px; left: 0; width: 9px; height: 1.6px; }
  .crash-dust { width: 3px; height: 3px; border-radius: 50%; background: #333; }
  @media (prefers-reduced-motion: reduce) {
    .crash-tumble, .crash-panel, .crash-blink { animation: none }
  }
`;

const BUTTON: React.CSSProperties = {
  appearance: "none",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 800,
  padding: "13px 26px",
  borderRadius: 16,
};

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <style>{CSS}</style>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            display: "flex",
            minHeight: "100dvh",
            maxWidth: 480,
            margin: "0 auto",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 24,
            textAlign: "center",
          }}
        >
          <span className="crash-star" style={{ top: "11%", left: "12%" }} />
          <span className="crash-star" style={{ top: "20%", right: "14%" }} />
          <span className="crash-star" style={{ bottom: "18%", left: "16%" }} />
          <span className="crash-star" style={{ bottom: "11%", right: "12%" }} />
          <span className="crash-dust" style={{ top: "8%", right: "30%" }} />
          <span className="crash-dust" style={{ top: "48%", left: "7%" }} />
          <span className="crash-dust" style={{ top: "55%", right: "8%" }} />

          <svg
            viewBox="0 0 240 170"
            aria-hidden
            style={{ width: "min(72vw, 280px)", height: "auto", overflow: "visible", marginBottom: -6 }}
          >
            <g className="crash-tumble">
              <rect x="100" y="60" width="44" height="50" rx="8" fill="#262626" stroke={LINE} strokeWidth="2.4" />
              <rect x="112" y="74" width="20" height="4" rx="2" fill={LINE} />
              <rect x="112" y="86" width="14" height="4" rx="2" fill={LINE} />
              <rect x="26" y="70" width="66" height="30" rx="4" fill="#1c1c1c" stroke={LINE} strokeWidth="2.2" />
              <path d="M26 85 H92 M48 70 V100 M70 70 V100" stroke={LINE} strokeWidth="1.6" />
              {/* the panel that came loose */}
              <g className="crash-panel">
                <rect x="152" y="74" width="66" height="30" rx="4" fill="#1c1c1c" stroke={LINE} strokeWidth="2.2" />
                <path d="M152 89 H218 M174 74 V104 M196 74 V104" stroke={LINE} strokeWidth="1.6" />
              </g>
              {/* the snapped antenna */}
              <path d="M122 60 V38" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
              <path d="M122 38 L136 26" stroke={LINE} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
              <circle className="crash-blink" cx="122" cy="118" r="5" fill={LINE} />
            </g>
          </svg>

          <svg viewBox="0 0 40 40" aria-hidden style={{ width: 72, height: 72 }}>
            <rect fill="#fff" x="4" y="5.8" width="7" height="28.4" />
            <rect fill="#fff" x="21.8" y="5.8" width="6.8" height="28.4" />
            <rect fill="#fff" x="4" y="16.8" width="24.6" height="5.8" />
            <rect fill={LIME} x="31.4" y="29.6" width="4.6" height="4.6" />
          </svg>

          <h1
            style={{
              margin: "10px 0 0",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            Something broke on our side<span style={{ color: LIME }}>.</span>
          </h1>
          <p style={{ margin: "2px 0 0", maxWidth: 280, fontSize: 14, lineHeight: 1.5, color: "#8a8a8a" }}>
            Not your fault. Try that again.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ ...BUTTON, background: LIME, color: "#0a0a0a" }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/home";
              }}
              style={{ ...BUTTON, background: "transparent", color: "#fff", border: `1px solid ${LINE}`, padding: "13px 22px" }}
            >
              Home
            </button>
          </div>

          {/* The one thing worth keeping from a crash: the id that finds it in
              the logs. Quiet, and only when there is one. */}
          {error?.digest && (
            <p style={{ margin: "14px 0 0", fontSize: 11, color: "#4a4a4a", fontVariantNumeric: "tabular-nums" }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
