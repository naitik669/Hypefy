import type { MascotMood } from "@/lib/profile";

const SIZES = { sm: 52, md: 88, lg: 132 } as const;

// Facial features are dark so they pop on the lime body (like the reference).
const FACE = "#0c1400";

/**
 * Hype Buddy — Hypefy's flame mascot.
 *
 * Solid electric-lime body with a flame-tip crown and dark expressive
 * features. Reads clearly on the dark UI (a dark body would vanish).
 */
export function HypeMascot({
  mood = "friendly",
  size = "md",
  animated = false,
  className = "",
}: {
  mood?: MascotMood;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  const h = Math.round(px * 1.12);
  const gid = `mascot-grad-${size}`;

  return (
    <div
      aria-hidden
      className={`relative inline-flex items-center justify-center ${animated ? "animate-mascot-float" : ""} ${className}`}
      style={{ width: px, height: h }}
    >
      {/* Soft ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(200,255,0,0.30) 0%, transparent 68%)" }}
      />

      <svg viewBox="0 0 100 112" width={px} height={h} className="relative" fill="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7ff6e" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>

        {/* Flame tips */}
        <path d="M26 43 Q21 28 27 12 Q33 27 38 43 Z" fill="#eaff85" />
        <path d="M44 41 Q46 16 50 1  Q54 16 56 41 Z" fill="#eaff85" />
        <path d="M74 43 Q79 28 73 12 Q67 27 62 43 Z" fill="#eaff85" />

        {/* Body */}
        <rect x="14" y="38" width="72" height="68" rx="24" fill={`url(#${gid})`} />
        {/* Arm nubs */}
        <ellipse cx="8" cy="74" rx="10" ry="7.5" fill="var(--color-accent)" />
        <ellipse cx="92" cy="74" rx="10" ry="7.5" fill="var(--color-accent)" />

        {/* Eyes */}
        <EyeLayer mood={mood} animated={animated} />
        {/* Mouth */}
        <MouthLayer mood={mood} />

        {/* Sparkle for hype / welcome */}
        {(mood === "hype" || mood === "welcome") && (
          <g className={animated ? "animate-mascot-sparkle" : ""}>
            <path d="M84 36 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z" fill="#ffffff" />
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─── Eye layer ──────────────────────────────────────────────── */
function EyeLayer({ mood, animated }: { mood: MascotMood; animated: boolean }) {
  const shouldBlink = animated && !["proud", "calm", "sleepy", "welcome", "hype"].includes(mood);
  return (
    <g className={shouldBlink ? "animate-mascot-blink" : ""} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
      <EyeShape mood={mood} />
    </g>
  );
}

function EyeShape({ mood }: { mood: MascotMood }) {
  const D = FACE; // dark eyes on lime body

  switch (mood) {
    // Happy arcs (^ ^)
    case "hype":
    case "welcome":
    case "proud":
      return (
        <>
          <path d="M28 64 Q37 55 46 64" stroke={D} strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M54 64 Q63 55 72 64" stroke={D} strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      );
    // Calm / sleepy lids
    case "calm":
    case "sleepy":
      return (
        <>
          <path d="M28 63 Q37 68 46 63" stroke={D} strokeWidth="3.6" strokeLinecap="round" fill="none" />
          <path d="M54 63 Q63 68 72 63" stroke={D} strokeWidth="3.6" strokeLinecap="round" fill="none" />
        </>
      );
    // Shocked
    case "shocked":
      return (
        <>
          <circle cx="34" cy="63" r="10" fill={D} />
          <circle cx="66" cy="63" r="10" fill={D} />
          <circle cx="34" cy="61" r="3" fill="#fff" />
          <circle cx="66" cy="61" r="3" fill="#fff" />
        </>
      );
    // Confused (squint + open)
    case "confused":
      return (
        <>
          <path d="M26 61 Q35 56 44 63" stroke={D} strokeWidth="3.6" strokeLinecap="round" fill="none" />
          <circle cx="66" cy="62" r="7" fill={D} />
        </>
      );
    // Thinking (look up-right)
    case "thinking":
      return (
        <>
          <circle cx="35" cy="62" r="7" fill={D} />
          <circle cx="67" cy="62" r="7" fill={D} />
        </>
      );
    // Curious / watching / default — round dark eyes with a tiny white glint
    default:
      return (
        <>
          <circle cx="35" cy="63" r="7" fill={D} />
          <circle cx="65" cy="63" r="7" fill={D} />
          <circle cx="37" cy="61" r="2" fill="#fff" />
          <circle cx="67" cy="61" r="2" fill="#fff" />
        </>
      );
  }
}

/* ─── Mouth layer ────────────────────────────────────────────── */
function MouthLayer({ mood }: { mood: MascotMood }) {
  const D = FACE;
  switch (mood) {
    case "hype":
    case "welcome":
      return <path d="M38 78 Q50 93 62 78 Z" fill={D} />;
    case "proud":
    case "friendly":
      return <path d="M40 79 Q50 88 60 79" stroke={D} strokeWidth="3.6" strokeLinecap="round" fill="none" />;
    case "calm":
      return <path d="M43 80 Q50 85 57 80" stroke={D} strokeWidth="3.2" strokeLinecap="round" fill="none" />;
    case "sleepy":
      return <circle cx="50" cy="80" r="3" fill={D} />;
    case "shocked":
      return <ellipse cx="50" cy="80" rx="5.5" ry="7" fill={D} />;
    case "confused":
    case "thinking":
      return <path d="M41 80 q4 -5 8 0 t8 0" stroke={D} strokeWidth="3.2" strokeLinecap="round" fill="none" />;
    default:
      return <path d="M43 80 H57" stroke={D} strokeWidth="3.4" strokeLinecap="round" />;
  }
}
