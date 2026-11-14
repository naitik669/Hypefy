"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, Film, Share2 } from "lucide-react";
import { setCreatorMode } from "@/app/(app)/creator/actions";

/**
 * What you get, and what you are agreeing to, before the switch.
 *
 * The honesty here matters more than the copy does. Three of the four
 * numbers started being recorded the day this shipped and have no history
 * behind them, so a dashboard that opens on four confident zeroes reads as
 * broken rather than as new. Saying so once, here, costs a sentence and
 * saves the impression.
 */
export function CreatorModeIntro() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enable() {
    setError(null);
    start(async () => {
      const res = await setCreatorMode(true);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-10 pt-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">Creator tools</h1>
        <p className="mt-1.5 text-sm text-muted">
          See how far your posts travel, who they reach, and how much of your Shots
          people actually watch.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        <Line icon={<Eye size={17} />} title="Reach, not just views">
          How many people saw it, and how many of them already follow you.
        </Line>
        <Line icon={<Film size={17} />} title="How much of a Shot gets watched">
          Whether people finish it or leave at two seconds.
        </Line>
        <Line icon={<Share2 size={17} />} title="Where it went">
          Copied, sent to a chat, or out to another app.
        </Line>
        <Line icon={<BarChart3 size={17} />} title="Profile visits">
          How many people the posts sent to your profile.
        </Line>
      </ul>

      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Views go back to September. Watch time, profile visits and shares only
          started being recorded recently, so those will be thin for a few days
          before they mean anything.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Nothing changes on your profile and nobody is told. You see counts
          only — never who looked.
        </p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="button"
        onClick={enable}
        disabled={pending}
        className="h-12 rounded-2xl bg-accent text-sm font-black text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Turning on…" : "Turn on creator tools"}
      </button>
    </div>
  );
}

function Line({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-elevated text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{children}</span>
      </span>
    </li>
  );
}
