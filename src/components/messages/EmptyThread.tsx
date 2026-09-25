"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  fetchSharedFollows,
  sharedFollowsNames,
  SHARED_FOLLOWS_FLOOR,
  type SharedFollows,
} from "@/lib/hype-proof";

/**
 * A chat neither of you has ever written in.
 *
 * A profile is where you are curious; an empty chat is where you are actually
 * stuck, so this is the best place in the app for common ground. It shows the
 * people you both follow and offers to send the first word.
 *
 * No avatar: the header already says whose chat this is, and a second face
 * said the same thing twice. Follows only, never shared taste — taste overlap
 * with someone you have never spoken to reads as being studied.
 *
 * It is an empty state and nothing more. One message and it is gone, which is
 * automatic: the thread stops being empty.
 */
export function EmptyThread({
  isGroup,
  groupTitle,
  groupMemberCount,
  other,
  onSayHey,
}: {
  isGroup: boolean;
  groupTitle?: string;
  groupMemberCount?: number;
  other: { id: string; name: string };
  onSayHey: () => void;
}) {
  const [shared, setShared] = useState<SharedFollows | null>(null);

  useEffect(() => {
    if (isGroup || !other.id) return;
    let alive = true;
    void fetchSharedFollows(other.id).then((s) => {
      if (alive) setShared(s);
    });
    return () => {
      alive = false;
    };
  }, [isGroup, other.id]);

  if (isGroup) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-[30%]"
          style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}
        >
          <Users size={30} className="text-white/95" />
        </span>
        <p className="mt-2 text-sm font-semibold">{groupTitle}</p>
        <p className="text-xs text-muted">{groupMemberCount} members</p>
      </div>
    );
  }

  // Under three shared follows there is nothing worth saying, so it falls
  // back to the plain empty chat rather than reaching for a weaker fact.
  const enough = shared && shared.count >= SHARED_FOLLOWS_FLOOR;
  const names = enough ? sharedFollowsNames(shared) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <Users size={26} className="text-faint" />
      {enough ? (
        <>
          <p className="text-sm font-bold leading-snug">
            You both follow {shared.count} of the same people
          </p>
          {names && <p className="-mt-1 text-xs leading-snug text-muted">{names}</p>}
        </>
      ) : (
        <>
          <p className="text-sm font-bold">{other.name}</p>
          <p className="-mt-1 text-xs text-muted">This is the start of your conversation.</p>
        </>
      )}
      <button
        type="button"
        onClick={onSayHey}
        className="mt-1 rounded-pill bg-accent px-7 py-2 text-sm font-extrabold text-accent-ink transition-transform active:scale-95"
      >
        Hey
      </button>
    </div>
  );
}
