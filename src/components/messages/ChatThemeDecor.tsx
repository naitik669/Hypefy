import type { ChatTheme } from "@/lib/chat-themes";

/**
 * The small drawings a theme puts on a text bubble: Pond's duck and frog
 * peeking over the top edge with bubbles at the bottom corner, petals for
 * Sakura, and so on. Drawn by us — inspired by the classic "animals over a
 * speech bubble" look, not copied from any sticker set.
 *
 * Positioned against the bubble (which is `relative`), and inert so it
 * never catches a long-press meant for the message.
 */
export function ChatThemeDecor({ decor, mine }: { decor: NonNullable<ChatTheme["decor"]>; mine: boolean }) {
  switch (decor) {
    case "pond":
      return (
        <>
          <span aria-hidden className={`pointer-events-none absolute -top-[15px] ${mine ? "left-2" : "right-2"}`}>
            {mine ? <Frog /> : <Duck />}
          </span>
          <span aria-hidden className={`pointer-events-none absolute -bottom-[7px] ${mine ? "-left-[7px]" : "-right-[7px]"}`}>
            <PondBubbles />
          </span>
        </>
      );
    case "sakura":
      return (
        <span aria-hidden className={`pointer-events-none absolute -top-[9px] ${mine ? "-left-[6px]" : "-right-[6px]"}`}>
          <svg width="26" height="20" viewBox="0 0 26 20">
            <Petal x={8} y={9} r={0} fill="#ff8fc0" />
            <Petal x={19} y={6} r={40} fill="#ffc4dc" />
          </svg>
        </span>
      );
    case "galaxy":
      return (
        <span aria-hidden className={`pointer-events-none absolute -top-[8px] ${mine ? "-left-[6px]" : "-right-[6px]"}`}>
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path d="M11 1 Q12.2 9.8 21 11 Q12.2 12.2 11 21 Q9.8 12.2 1 11 Q9.8 9.8 11 1Z" fill="#fde68a" />
          </svg>
        </span>
      );
    case "sunset":
      return (
        <span aria-hidden className={`pointer-events-none absolute -top-[10px] ${mine ? "left-3" : "right-3"}`}>
          <svg width="26" height="14" viewBox="0 0 26 14">
            <path d="M3 14 A10 10 0 0 1 23 14Z" fill="#fdba74" />
            <path d="M13 0v2.5M4 4.5l1.8 1.6M22 4.5l-1.8 1.6" stroke="#fdba74" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "arcade":
      return (
        <span aria-hidden className={`pointer-events-none absolute -top-[11px] ${mine ? "left-2" : "right-2"}`}>
          <svg width="22" height="16" viewBox="0 0 11 8" shapeRendering="crispEdges">
            <path
              fill={mine ? "#22c55e" : "#22d3ee"}
              d="M2 0h1v1H2zM8 0h1v1H8zM3 1h5v1H3zM2 2h7v1H2zM1 3h2v1H1zM4 3h3v1H4zM8 3h2v1H8zM0 4h11v1H0zM0 5h1v1H0zM2 5h7v1H2zM10 5h1v1h-1zM0 6h1v1H0zM2 6h1v1H2zM8 6h1v1H8zM10 6h1v1h-1zM3 7h2v1H3zM6 7h2v1H6z"
            />
          </svg>
        </span>
      );
    case "candy":
      return (
        <span aria-hidden className={`pointer-events-none absolute -top-[10px] ${mine ? "-left-[4px]" : "-right-[4px]"}`}>
          <svg width="28" height="16" viewBox="0 0 28 16">
            <path d="M2 8 L7 3 L7 13Z M26 8 L21 3 L21 13Z" fill="#fde68a" />
            <circle cx="14" cy="8" r="6.5" fill="#ff7ab8" />
            <path d="M9.5 6.5 Q14 3 18.5 9.5" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      );
    default:
      return null;
  }
}

function Duck() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24">
      {/* ripples */}
      <path d="M2 21 Q6 18.5 10 21 M24 21 Q28 18.5 32 21" stroke="#7cc8ec" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* head */}
      <ellipse cx="17" cy="13" rx="10.5" ry="9.5" fill="#ffd84d" />
      <ellipse cx="17" cy="16" rx="10.5" ry="6" fill="#ffc933" />
      {/* tuft */}
      <path d="M15 4 Q16 0.5 18.5 3" stroke="#e0a800" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <ellipse cx="13" cy="11.5" rx="1.4" ry="1.8" fill="#2b1a00" />
      <ellipse cx="21" cy="11.5" rx="1.4" ry="1.8" fill="#2b1a00" />
      {/* beak */}
      <ellipse cx="17" cy="15" rx="3.2" ry="2" fill="#ff8a3d" />
      {/* cheeks */}
      <ellipse cx="10.5" cy="15" rx="2" ry="1.2" fill="#ff9bb5" opacity="0.8" />
      <ellipse cx="23.5" cy="15" rx="2" ry="1.2" fill="#ff9bb5" opacity="0.8" />
    </svg>
  );
}

function Frog() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24">
      <path d="M2 21 Q6 18.5 10 21 M24 21 Q28 18.5 32 21" stroke="#7cc8ec" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* eye bumps */}
      <circle cx="11" cy="7" r="5" fill="#5fcf6b" />
      <circle cx="23" cy="7" r="5" fill="#5fcf6b" />
      {/* head */}
      <ellipse cx="17" cy="15" rx="12" ry="8" fill="#5fcf6b" />
      {/* eyes */}
      <circle cx="11" cy="7" r="2.8" fill="#ffffff" />
      <circle cx="23" cy="7" r="2.8" fill="#ffffff" />
      <circle cx="11.5" cy="7.4" r="1.4" fill="#10301a" />
      <circle cx="22.5" cy="7.4" r="1.4" fill="#10301a" />
      {/* smile */}
      <path d="M12 15.5 Q17 20 22 15.5" stroke="#10301a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* cheeks */}
      <ellipse cx="8.5" cy="15" rx="2" ry="1.2" fill="#ff9bb5" opacity="0.85" />
      <ellipse cx="25.5" cy="15" rx="2" ry="1.2" fill="#ff9bb5" opacity="0.85" />
    </svg>
  );
}

function PondBubbles() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16">
      <circle cx="7" cy="8" r="6" fill="#d7f1fd" stroke="#7cc8ec" strokeWidth="1.3" />
      <circle cx="5" cy="6" r="1.6" fill="#ffffff" />
      <circle cx="16" cy="12" r="3" fill="#d7f1fd" stroke="#7cc8ec" strokeWidth="1.1" />
    </svg>
  );
}

function Petal({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${r})`}
      d="M0 -7 C4 -6 5 -1 0 5 C-5 -1 -4 -6 0 -7Z"
      fill={fill}
    />
  );
}
