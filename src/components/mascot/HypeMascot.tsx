import type { MascotMood } from "@/lib/profile";

const SIZES = { sm: 44, md: 80, lg: 128 } as const;

/**
 * Hype Buddy — Hypefy's original mascot.
 * A dark rounded blob with a lime spark crown and mood-driven eyes/mouth.
 * Visual only, CSS-animated. Use sparingly (onboarding, setup, empty states).
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
  const eyesOpen = !["proud", "calm", "sleepy"].includes(mood);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${
        animated ? "animate-mascot-float" : ""
      } ${className}`}
      style={{ width: px, height: px }}
      aria-hidden
    >
      {/* Soft lime glow */}
      <div className="absolute inset-2 rounded-full bg-accent/25 blur-xl" />

      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        className="relative"
        fill="none"
      >
        {/* Spark crown */}
        <path
          d="M50 6 C45 17 44 25 50 30 C56 25 55 17 50 6 Z"
          fill="var(--color-accent)"
        />
        <path
          d="M37 15 C34 22 34 28 40 31 C43 26 42 20 37 15 Z"
          fill="var(--color-accent)"
          opacity="0.85"
        />
        <path
          d="M63 15 C66 22 66 28 60 31 C57 26 58 20 63 15 Z"
          fill="var(--color-accent)"
          opacity="0.85"
        />

        {/* Body */}
        <path
          d="M50 28 C73 28 85 44 85 63 C85 83 71 91 50 91 C29 91 15 83 15 63 C15 44 27 28 50 28 Z"
          fill="#242424"
          stroke="rgba(200,255,0,0.25)"
          strokeWidth="1.5"
        />

        {/* Eyes */}
        <g
          className={animated && eyesOpen ? "animate-mascot-blink" : ""}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        >
          <Eyes mood={mood} />
        </g>

        {/* Mouth */}
        <Mouth mood={mood} />

        {/* Hype mood: sparkle */}
        {mood === "hype" && (
          <g className={animated ? "animate-mascot-sparkle" : ""}>
            <path d="M82 40 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z" fill="var(--color-hype)" />
          </g>
        )}
      </svg>
    </div>
  );
}

function Eyes({ mood }: { mood: MascotMood }) {
  const W = "#ffffff";
  const P = "#0f0f0f";

  // Closed/curved-eye moods
  if (mood === "proud") {
    // happy upward arcs (^ ^)
    return (
      <>
        <path d="M31 60 Q39 52 47 60" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M53 60 Q61 52 69 60" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </>
    );
  }
  if (mood === "calm" || mood === "sleepy") {
    // gentle downward closed lids
    return (
      <>
        <path d="M31 58 Q39 63 47 58" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M53 58 Q61 63 69 58" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </>
    );
  }

  // Open-eye moods → pupil position / size varies
  const dy = mood === "curious" ? -2.5 : 0; // looking up
  const pr = mood === "shocked" ? 3 : 4; // pupil radius
  const er = mood === "shocked" || mood === "hype" ? 9 : 8; // eye radius

  if (mood === "confused") {
    return (
      <>
        {/* small brow over left eye */}
        <path d="M32 47 L46 50" stroke={W} strokeWidth="2" strokeLinecap="round" />
        <circle cx="39" cy="58" r="7" fill={W} />
        <circle cx="39" cy="58" r="3.5" fill={P} />
        <circle cx="61" cy="57" r="9" fill={W} />
        <circle cx="61" cy="57" r="4" fill={P} />
      </>
    );
  }

  return (
    <>
      <circle cx="39" cy="58" r={er} fill={W} />
      <circle cx={39} cy={58 + dy} r={pr} fill={P} />
      <circle cx="61" cy="58" r={er} fill={W} />
      <circle cx={61} cy={58 + dy} r={pr} fill={P} />
    </>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  const W = "#ffffff";
  switch (mood) {
    case "hype":
      return <path d="M38 70 Q50 86 62 70 Z" fill={W} />;
    case "proud":
    case "friendly":
      return (
        <path d="M40 71 Q50 79 60 71" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      );
    case "calm":
      return (
        <path d="M44 73 Q50 77 56 73" stroke={W} strokeWidth="3" strokeLinecap="round" fill="none" />
      );
    case "shocked":
      return <ellipse cx="50" cy="73" rx="5" ry="6" fill={W} />;
    case "confused":
      return (
        <path d="M42 73 q4 -5 8 0 t8 0" stroke={W} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      );
    case "sleepy":
      return <circle cx="50" cy="73" r="3" fill={W} />;
    case "curious":
      return <ellipse cx="50" cy="73" rx="3.5" ry="4" fill={W} />;
    case "watching":
    default:
      return <path d="M44 73 H56" stroke={W} strokeWidth="3" strokeLinecap="round" />;
  }
}
