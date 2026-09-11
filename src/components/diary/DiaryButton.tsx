"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SpotlightIcon } from "@/components/diary/SpotlightIcon";
import { loadSeen, unseen } from "@/lib/diary";

/**
 * The way into Spotlight, from the Messages filter row.
 *
 * The badge counts other people's Diaries you have not opened since they were
 * written. It is read after mount because "seen" lives in localStorage, which
 * the server does not have — a count decided during render would disagree
 * between the two and flash.
 */
export function DiaryButton({
  diaries,
}: {
  diaries: { userId: string; createdAt: string; isSelf: boolean }[];
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setCount(unseen(diaries, loadSeen()).length);
  }, [diaries]);

  return (
    <Link
      href="/messages/spotlight"
      aria-label={count > 0 ? `Spotlight, ${count} new` : "Spotlight"}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-transform active:scale-90"
    >
      <SpotlightIcon size={24} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
