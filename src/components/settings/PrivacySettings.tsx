"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { useToast } from "@/components/ui/ToastProvider";

export function PrivacySettings({
  userId,
  initialIsPrivate,
  initialDmPrivacy,
  initialShowActivity,
  initialHideReadReceipts,
  initialShowHypes,
}: {
  userId: string;
  initialIsPrivate: boolean;
  initialDmPrivacy: "everyone" | "following";
  initialShowActivity: boolean;
  initialHideReadReceipts: boolean;
  initialShowHypes: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [dmPrivacy, setDmPrivacy] = useState(initialDmPrivacy);
  const [showActivity, setShowActivity] = useState(initialShowActivity);
  const [hideReceipts, setHideReceipts] = useState(initialHideReadReceipts);
  const [showHypes, setShowHypes] = useState(initialShowHypes);
  /**
   * Which single control is mid-save — not a panel-wide flag.
   *
   * One shared boolean disabled all five while any one of them was in flight,
   * so toggling "Private account" froze the read-receipt switch for the length
   * of a round trip. Nothing about these settings makes them mutually
   * exclusive.
   */
  const [pending, setPending] = useState<string | null>(null);

  async function save(
    key: string,
    patch: {
      is_private?: boolean;
      dm_privacy?: string;
      show_activity?: boolean;
      hide_read_receipts?: boolean;
      show_hypes?: boolean;
    }
  ) {
    setPending(key);
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    setPending(null);
    if (error) toast("Couldn't save, try again", "error");
    else toast("Saved", "success");
    return !error;
  }

  async function togglePrivate(next: boolean) {
    setIsPrivate(next);
    if (!(await save("private", { is_private: next }))) setIsPrivate(!next);
  }

  async function toggleActivity(next: boolean) {
    setShowActivity(next);
    if (!(await save("activity", { show_activity: next })))
      setShowActivity(!next);
  }

  /**
   * Whether your name appears when someone you both know sees something you
   * hyped. Separate from show_activity, which is about last-seen: hiding when
   * you were online is a different decision from hiding what you liked.
   */
  async function toggleShowHypes(next: boolean) {
    setShowHypes(next);
    if (!(await save("hypes", { show_hypes: next }))) setShowHypes(!next);
  }

  async function toggleReceipts(next: boolean) {
    setHideReceipts(next);
    if (!(await save("receipts", { hide_read_receipts: next })))
      setHideReceipts(!next);
  }

  async function setDm(next: "everyone" | "following") {
    const prev = dmPrivacy;
    setDmPrivacy(next);
    if (!(await save("dm", { dm_privacy: next }))) setDmPrivacy(prev);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
          Account
        </p>
        <SettingToggle
          label="Private account"
          sub="Only your followers can see your posts and Shots"
          checked={isPrivate}
          onChange={togglePrivate}
          disabled={pending === "private"}
        />
        <div className="mt-2">
          <SettingToggle
            label="Show activity status"
            sub="Let others see when you're online and your last active time"
            checked={showActivity}
            onChange={toggleActivity}
            disabled={pending === "activity"}
          />
        </div>
        <div className="mt-2">
          <SettingToggle
            label="Show my name when I hype"
            sub="Let people you both know see that you hyped a post or Shot. Your hypes still count either way."
            checked={showHypes}
            onChange={toggleShowHypes}
            disabled={pending === "hypes"}
          />
        </div>
        <div className="mt-2">
          {/* Migration 0032 added this column and then nothing ever read or
              wrote it. RealChatView reads it now: with this on, your reading
              never turns their ticks to "seen". */}
          <SettingToggle
            label="Hide read receipts"
            sub="Don't let people see when you've read their messages"
            checked={hideReceipts}
            onChange={toggleReceipts}
            disabled={pending === "receipts"}
          />
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
          Who can message you
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              {
                value: "everyone",
                label: "Everyone",
                sub: "Strangers land in Requests until you approve",
              },
              {
                value: "following",
                label: "People you follow",
                sub: "Only accounts you follow can start a chat",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={pending === "dm"}
              onClick={() => setDm(opt.value)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                dmPrivacy === opt.value
                  ? "border-accent/40 bg-accent/[0.06]"
                  : "border-border bg-surface"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted">{opt.sub}</p>
              </div>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  dmPrivacy === opt.value
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
