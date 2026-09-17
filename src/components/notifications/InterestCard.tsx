"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";

type Actor = { display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url: string | null };

/**
 * Asks once about a kind of notification someone has not chosen yet, using a
 * real one as the example: "riya added a page to their Spotlight — want to
 * hear when friends add pages?". After an answer it says what changed, with
 * Undo, until the screen is next opened.
 */
export function InterestCard({
  actor,
  href,
  answered,
  onAnswer,
  onUndo,
}: {
  actor: Actor | null;
  href: string;
  answered: "yes" | "no" | null;
  onAnswer: (interested: boolean) => void;
  onUndo: () => void;
}) {
  if (answered) {
    return (
      <div className="mx-3 my-2 flex items-center gap-3 rounded-[18px] border border-border bg-surface px-3.5 py-3" data-interest-card="answered">
        <p className="min-w-0 flex-1 text-xs text-muted">
          {answered === "yes"
            ? "You'll see friends' Spotlight pages here."
            : "Spotlight pages hidden. Change it in Tune."}
        </p>
        <button type="button" onClick={onUndo} className="text-xs font-bold text-muted hover:text-foreground">
          Undo
        </button>
      </div>
    );
  }

  const name = actor?.username ?? actor?.display_name ?? "A friend";
  return (
    <div
      className="mx-3 my-2 grid gap-2.5 rounded-[18px] border border-accent/25 p-3"
      style={{ background: "radial-gradient(120% 100% at 0% 0%, rgb(163 230 53 / 0.14), transparent 60%), var(--color-surface)" }}
      role="region"
      aria-label="New kind of notification"
      data-interest-card=""
    >
      <Link href={href} className="flex items-center gap-2.5">
        <Avatar name={name} hue={actor?.avatar_hue ?? 280} src={actor?.avatar_url ?? undefined} size={40} />
        <span className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-bold">{name}</span> added a page to their Spotlight{" "}
          <span className="rounded-[5px] bg-accent px-1.5 py-0.5 align-[1px] text-[9px] font-extrabold tracking-[0.08em] text-accent-ink">
            NEW
          </span>
          <span className="mt-0.5 block text-xs text-muted">Want to hear when friends add pages?</span>
        </span>
      </Link>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAnswer(true)}
          className="h-9 flex-1 rounded-full bg-accent text-[13px] font-bold text-accent-ink active:scale-[0.98]"
        >
          Interested
        </button>
        <button
          type="button"
          onClick={() => onAnswer(false)}
          className="h-9 flex-1 rounded-full bg-elevated text-[13px] font-bold text-foreground active:scale-[0.98]"
        >
          Not interested
        </button>
      </div>
    </div>
  );
}
