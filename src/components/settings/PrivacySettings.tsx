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
  initialTwoStep,
}: {
  userId: string;
  initialIsPrivate: boolean;
  initialDmPrivacy: "everyone" | "following";
  initialShowActivity: boolean;
  initialTwoStep: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [dmPrivacy, setDmPrivacy] = useState(initialDmPrivacy);
  const [showActivity, setShowActivity] = useState(initialShowActivity);
  const [twoStep, setTwoStep] = useState(initialTwoStep);
  const [saving, setSaving] = useState(false);

  async function save(patch: { is_private?: boolean; dm_privacy?: string; show_activity?: boolean; two_step_enabled?: boolean }) {
    setSaving(true);
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    setSaving(false);
    if (error) toast("Couldn't save — try again", "error");
    else toast("Saved", "success");
    return !error;
  }

  async function togglePrivate(next: boolean) {
    setIsPrivate(next);
    if (!(await save({ is_private: next }))) setIsPrivate(!next);
  }

  async function toggleActivity(next: boolean) {
    setShowActivity(next);
    if (!(await save({ show_activity: next }))) setShowActivity(!next);
  }

  async function toggleTwoStep(next: boolean) {
    setTwoStep(next);
    if (!(await save({ two_step_enabled: next }))) setTwoStep(!next);
  }

  async function setDm(next: "everyone" | "following") {
    const prev = dmPrivacy;
    setDmPrivacy(next);
    if (!(await save({ dm_privacy: next }))) setDmPrivacy(prev);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">Account</p>
        <SettingToggle
          label="Private account"
          sub="Only your followers can see your posts and Shots"
          checked={isPrivate}
          onChange={togglePrivate}
          disabled={saving}
        />
        <div className="mt-2">
          <SettingToggle
            label="Show activity status"
            sub="Let others see when you're online and your last active time"
            checked={showActivity}
            onChange={toggleActivity}
            disabled={saving}
          />
        </div>
      </section>

      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">Security</p>
        <SettingToggle
          label="Two-step verification"
          sub="Require an emailed 6-digit code at sign-in, on top of your password"
          checked={twoStep}
          onChange={toggleTwoStep}
          disabled={saving}
        />
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">Who can message you</p>
        <div className="flex flex-col gap-2">
          {([
            { value: "everyone", label: "Everyone", sub: "Strangers land in Requests until you approve" },
            { value: "following", label: "People you follow", sub: "Only accounts you follow can start a chat" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => setDm(opt.value)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                dmPrivacy === opt.value ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-surface"
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
