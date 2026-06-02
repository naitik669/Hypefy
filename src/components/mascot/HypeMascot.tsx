import type { MascotMood } from "@/lib/profile";

const SIZES = { sm: 52, md: 88, lg: 136 } as const;

/**
 * Hype Buddy — Hypefy's flame mascot.
 *
 * Original character inspired by simple expressive flat-design flame characters
 * (see design reference sheet). Adapted to Hypefy: dark body, lime flame tips.
 * Not red. Not generic. Belongs in a dark social app.
 *
 * Shape: flame-body silhouette with 3 lime tips, dark rounded body,
 * arm nubs, expressive white eyes + minimal mouth.
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

  return (
    <div
      aria-hidden
      className={`relative inline-flex items-center justify-center ${
        animated ? "animate-mascot-float" : ""
      } ${className}`}
      style={{ width: px, height: h }}
    >
      {/* Soft ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(200,255,0,0.20) 0%, transparent 70%)",
        }}
      />

      <svg
        viewBox="0 0 100 112"
        width={px}
        height={h}
        className="relative"
        fill="none"
      >
        {/* ── Lime flame tips ──────────────────────────── */}
        <path
          d="M26 43 Q21 29 27 13 Q32 27 38 43 Z"
          fill="var(--color-accent)"
          opacity="0.88"
        />
        <path
          d="M44 41 Q46 17 50 2 Q54 17 56 41 Z"
          fill="var(--color-accent)"
        />
        <path
          d="M74 43 Q79 29 73 13 Q68 27 62 43 Z"
          fill="var(--color-accent)"
          opacity="0.88"
        />

        {/* ── Dark body ────────────────────────────────── */}
        <rect x="14" y="38" width="72" height="68" rx="24" fill="#1E1E1E" />

        {/* ── Arm nubs ─────────────────────────────────── */}
        <ellipse cx="8"  cy="74" rx="10" ry="7.5" fill="#1E1E1E" />
        <ellipse cx="92" cy="74" rx="10" ry="7.5" fill="#1E1E1E" />

        {/* ── Eyes ─────────────────────────────────────── */}
        <EyeLayer mood={mood} animated={animated} />

        {/* ── Mouth ────────────────────────────────────── */}
        <MouthLayer mood={mood} />

        {/* Hype sparkle (hype / welcome only) */}
        {(mood === "hype" || mood === "welcome") && (
          <g className={animated ? "animate-mascot-sparkle" : ""}>
            <path
              d="M82 38 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z"
              fill="var(--color-hype)"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─── Eye layer ──────────────────────────────────────────────── */
function EyeLayer({
  mood,
  animated,
}: {
  mood: MascotMood;
  animated: boolean;
}) {
  const shouldBlink =
    animated &&
    !["proud", "calm", "sleepy", "welcome", "hype"].includes(mood);

  return (
    <g
      className={shouldBlink ? "animate-mascot-blink" : ""}
      style={{ transformOrigin: "center", transformBox: "fill-box" }}
    >
      <EyeShape mood={mood} />
    </g>
  );
}

function EyeShape({ mood }: { mood: MascotMood }) {
  const W = "#ffffff";
  const P = "#0a0a0a";

  switch (mood) {
    // ── Happy / satisfied (arc eyes)
    case "hype":
    case "welcome":
    case "proud":
      return (
        <>
          <path d="M28 66 Q37 57 46 66" stroke={W} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d="M54 66 Q63 57 72 66" stroke={W} strokeWidth="3.4" strokeLinecap="round" fill="none" />
        </>
      );

    // ── Calm / sleepy (drooping lids)
    case "calm":
    case "sleepy":
      return (
        <>
          <path d="M28 63 Q37 68 46 63" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M54 63 Q63 68 72 63" stroke={W} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </>
      );

    // ── Shocked (big wide eyes)
    case "shocked":
      return (
        <>
          <circle cx="34" cy="63" r="11"   fill={W} />
          <circle cx="66" cy="63" r="11"   fill={W} />
          <circle cx="34" cy="63" r="5.5"  fill={P} />
          <circle cx="66" cy="63" r="5.5"  fill={P} />
        </>
      );

    // ── Confused (one squint + one open)
    case "confused":
      return (
        <>
          <path d="M26 61 Q35 56 44 63" stroke={W} strokeWidth="3" strokeLinecap="round" fill="none" />
          <circle cx="66" cy="63" r="9"   fill={W} />
          <circle cx="66" cy="63" r="4.5" fill={P} />
        </>
      );

    // ── Thinking (pupils up-right)
    case "thinking":
      return (
        <>
          <circle cx="34" cy="63" r="8.5" fill={W} />
          <circle cx="66" cy="63" r="8.5" fill={W} />
          <circle cx="36" cy="60" r="4.5" fill={P} />
          <circle cx="68" cy="60" r="4.5" fill={P} />
        </>
      );

    // ── Curious (pupils slightly up)
    case "curious":
      return (
        <>
          <circle cx="34" cy="63" r="8.5" fill={W} />
          <circle cx="66" cy="63" r="8.5" fill={W} />
          <circle cx="34" cy="61" r="4.5" fill={P} />
          <circle cx="66" cy="61" r="4.5" fill={P} />
        </>
      );

    // ── Watching (alert, centered pupils)
    case "watching":
      return (
        <>
          <circle cx="34" cy="64" r="9"   fill={W} />
          <circle cx="66" cy="64" r="9"   fill={W} />
          <circle cx="34" cy="64" r="4.5" fill={P} />
          <circle cx="66" cy="64" r="4.5" fill={P} />
        </>
      );

    // ── Friendly / default (normal open eyes)
    default:
      return (
        <>
          <circle cx="34" cy="64" r="8.5" fill={W} />
          <circle cx="66" cy="64" r="8.5" fill={W} />
          <circle cx="34" cy="64" r="4.5" fill={P} />
          <circle cx="66" cy="64" r="4.5" fill={P} />
        </>
      );
  }
}

/* ─── Mouth layer ────────────────────────────────────────────── */
function MouthLayer({ mood }: { mood: MascotMood }) {
  const W = "#ffffff";

  switch (mood) {
    case "hype":
    case "welcome":
      // Big open grin
      return <path d="M36 78 Q50 95 64 78 Z" fill={W} />;

    case "proud":
    case "friendly":
      // Gentle smile arc
      return (
        <path
          d="M38 79 Q50 89 62 79"
          stroke={W}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />
      );

    case "calm":
      // Small content smile
      return (
        <path
          d="M42 80 Q50 86 58 80"
          stroke={W}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      );

    case "sleepy":
      // Tiny dot mouth
      return <circle cx="50" cy="80" r="3" fill={W} />;

    case "shocked":
      // Open O
      return <ellipse cx="50" cy="80" rx="6" ry="7.5" fill={W} />;

    case "confused":
    case "thinking":
      // Wavy/uncertain
      return (
        <path
          d="M40 80 q4 -5 8 0 t8 0"
          stroke={W}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      );

    // watching / curious / default: neutral flat line
    default:
      return (
        <path
          d="M43 80 H57"
          stroke={W}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      );
  }
}
