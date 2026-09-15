import type { ChatTheme } from "@/lib/chat-themes";

// Fixed positions, so the effect looks the same for everyone and never
// reshuffles on a re-render.
const STARS = [
  [8, 12, 2], [22, 38, 1.5], [37, 8, 2], [51, 27, 1.5], [66, 15, 2.5], [79, 44, 1.5], [91, 9, 2],
  [14, 62, 1.5], [30, 80, 2], [47, 55, 1.5], [60, 72, 2], [74, 88, 1.5], [88, 66, 2], [5, 90, 1.5],
] as const;
const DROPS = [6, 17, 29, 41, 52, 63, 75, 86, 95] as const;

/**
 * A slow effect behind a themed chat: twinkling stars, or rain.
 *
 * Sticky at the top of the scroll area with no height of its own, so it
 * stays put while messages scroll over it and takes no room in the list.
 * The scroll area isolates its stacking, which is what lets -z-10 sit this
 * above the chat's background but under every message.
 */
export function ChatAmbient({ kind }: { kind: NonNullable<ChatTheme["ambient"]> }) {
  return (
    <div aria-hidden className="pointer-events-none sticky top-0 -z-10 h-0">
      <div className="hy-anim absolute -inset-x-4 -top-4 h-[100dvh] overflow-hidden">
        {kind === "stars"
          ? STARS.map(([x, y, s], i) => (
              <i
                key={i}
                className="hy-twinkle absolute rounded-full bg-white"
                style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${(i % 5) * 0.6}s` }}
              />
            ))
          : DROPS.map((x, i) => (
              <i
                key={i}
                className="hy-fall absolute top-0 w-px bg-sky-300/40"
                style={{ left: `${x}%`, height: 22, animationDelay: `${(i * 0.37) % 1.6}s`, animationDuration: `${1.3 + (i % 4) * 0.2}s` }}
              />
            ))}
      </div>
    </div>
  );
}
