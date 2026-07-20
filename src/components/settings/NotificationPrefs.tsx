"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { useToast } from "@/components/ui/ToastProvider";

export type NotifPrefs = {
  hypes?: boolean;
  comments?: boolean;
  follows?: boolean;
  mentions?: boolean;
  messages?: boolean;
};

const ITEMS: { key: keyof NotifPrefs; label: string; sub: string }[] = [
  { key: "hypes",    label: "Hypes",    sub: "Someone hypes your post, Shot, or comment" },
  { key: "comments", label: "Comments", sub: "New comments and replies on your content" },
  { key: "follows",  label: "Follows",  sub: "Someone starts following you" },
  { key: "mentions", label: "Mentions", sub: "Someone @mentions you in a post" },
  { key: "messages", label: "Messages", sub: "New direct messages and group chats" },
];

export function NotificationPrefs({
  userId,
  initialPrefs,
}: {
  userId: string;
  initialPrefs: NotifPrefs;
}) {
  const supabase = createClient();
  const toast = useToast();
  // Everything defaults ON — prefs store explicit opt-outs
  const [prefs, setPrefs] = useState<NotifPrefs>(initialPrefs);
  const [saving, setSaving] = useState(false);

  const isOn = (key: keyof NotifPrefs) => prefs[key] !== false;

  async function toggle(key: keyof NotifPrefs, next: boolean) {
    const prev = prefs;
    const updated = { ...prefs, [key]: next };
    setPrefs(updated);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ notif_prefs: updated })
      .eq("id", userId);
    setSaving(false);
    if (error) { setPrefs(prev); toast("Couldn't save, try again", "error"); }
    else toast("Saved", "success");
  }

  return (
    <div className="flex flex-col">
      {ITEMS.map((item) => (
        <SettingToggle
          key={item.key}
          label={item.label}
          sub={item.sub}
          checked={isOn(item.key)}
          onChange={(next) => toggle(item.key, next)}
          disabled={saving}
        />
      ))}
      <p className="mt-3 px-2 text-xs text-faint">
        Turning a type off hides those notifications from your feed and badge.
      </p>
    </div>
  );
}
