"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { InterestPills } from "@/components/profile/InterestPills";
import { useToast } from "@/components/ui/ToastProvider";
import { updateInterests } from "@/app/(app)/settings/profile/actions";
import { haptics } from "@/lib/haptics";

/**
 * Picks the topics that steer the feed.
 *
 * The pills themselves already existed and were wired to nothing —
 * `profiles.interests` has been read by the ranker since day one with no way
 * for anyone to fill it in. This sheet is that missing write path.
 */
export function InterestSheet({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: string[];
  onSaved?: (next: string[]) => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    haptics.tap();
    startTransition(async () => {
      const res = await updateInterests(picked);
      if ("error" in res) {
        toast("Couldn't save that", "error");
        return;
      }
      haptics.success();
      toast(
        picked.length ? "Feed updated" : "Interests cleared",
        picked.length ? "success" : "plain"
      );
      onSaved?.(picked);
      onClose();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="What are you into?">
      <div className="pt-1 pb-4">
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Posts tagged with these get lifted in your feed. Change them whenever
          — nothing is locked in.
        </p>

        <InterestPills value={picked} onChange={setPicked} />

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-pill bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </BottomSheet>
  );
}
