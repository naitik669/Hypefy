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
  const h = Math.round(px * 1.16);
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
        style={{ background: "radial-gradient(circle, rgba(163,230,53,0.30) 0%, transparent 68%)" }}
      />

      <svg viewBox="0 0 100 116" width={px} height={h} className="relative" fill="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eaff85" />
            <stop offset="55%" stopColor="#d8ff3a" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>

        {/* Little stubby arms (behind body) */}
        <path d="M14 72 q-12 -1 -13 9 q9 4 15 -2 z" fill="var(--color-accent)" />
        <path d="M86 72 q12 -1 13 9 q-9 4 -15 -2 z" fill="var(--color-accent)" />

        {/* Little feet (behind body) */}
        <ellipse cx="38" cy="107" rx="9" ry="6" fill="#bfe600" />
        <ellipse cx="62" cy="107" rx="9" ry="6" fill="#bfe600" />

        {/* Organic flame body — soft wavy licks + chubby round belly */}
        <path
          d="M50 5
             C 55 19 57 27 60 33
             C 64 26 71 24 76 31
             C 82 42 89 54 89 71
             C 89 93 73 107 50 107
             C 27 107 11 93 11 71
             C 11 54 18 42 24 31
             C 29 24 36 26 40 33
             C 43 27 45 19 50 5 Z"
          fill={`url(#${gid})`}
        />

        {/* Soft glossy belly highlight */}
        <ellipse cx="36" cy="52" rx="15" ry="9" fill="#ffffff" opacity="0.12" />

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
