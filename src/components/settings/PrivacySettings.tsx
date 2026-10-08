"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { useToast } from "@/components/ui/ToastProvider";

/** Who may reach you by writing @you. */
export type MentionPrivacy = "everyone" | "following" | "nobody";

export function PrivacySettings({
  userId,
  initialIsPrivate,
  initialDmPrivacy,
  initialShowActivity,
  initialHideReadReceipts,
  initialShowHypes,
  initialMentionPrivacy,
}: {
  userId: string;
  initialIsPrivate: boolean;
  initialDmPrivacy: "everyone" | "following";
  initialShowActivity: boolean;
  initialHideReadReceipts: boolean;
  initialShowHypes: boolean;
  initialMentionPrivacy: MentionPrivacy;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [dmPrivacy, setDmPrivacy] = useState(initialDmPrivacy);
  const [mentionPrivacy, setMentionPrivacy] = useState(initialMentionPrivacy);
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
      mention_privacy?: string;
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

  async function setMention(next: MentionPrivacy) {
    const prev = mentionPrivacy;
    setMentionPrivacy(next);
    if (!(await save("mention", { mention_privacy: next }))) setMentionPrivacy(prev);
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

      <Chooser
        title="Who can message you"
        value={dmPrivacy}
        busy={pending === "dm"}
        onPick={(v) => setDm(v as "everyone" | "following")}
        options={[
          { value: "everyone", label: "Everyone", sub: "Strangers land in Requests until you approve" },
          { value: "following", label: "People you follow", sub: "Only accounts you follow can start a chat" },
        ]}
      />

      {/* What a mention costs the person mentioned is the notification, so
          that is what this governs. The @ still reads as written: deciding
          otherwise would mean asking this setting for every name in every
          post, on every render. */}
      <Chooser
        title="Who can notify you by mentioning you"
        value={mentionPrivacy}
        busy={pending === "mention"}
        onPick={(v) => setMention(v as MentionPrivacy)}
        options={[
          { value: "everyone", label: "Everyone", sub: "Anyone who writes @you sends you a notification" },
          { value: "following", label: "People you follow", sub: "Only from accounts you follow" },
          { value: "nobody", label: "No one", sub: "You are never notified about a mention" },
        ]}
      />
    </div>
  );
}

/** One setting with a few answers, only one of them true at a time. */
function Chooser({
  title,
  value,
  options,
  busy,
  onPick,
}: {
  title: string;
  value: string;
  options: readonly { value: string; label: string; sub: string }[];
  busy: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <section>
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">{title}</p>
      <div role="radiogroup" aria-label={title} className="flex flex-col gap-2">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => onPick(opt.value)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                on ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-surface"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted">{opt.sub}</p>
              </div>
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  on ? "border-accent bg-accent text-accent-ink" : "border-border text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
