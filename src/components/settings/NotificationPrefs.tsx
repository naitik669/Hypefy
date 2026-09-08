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
  {
    key: "hypes",
    label: "Hypes",
    sub: "Someone hypes your post, Shot, or comment",
  },
  {
    key: "comments",
    label: "Comments",
    sub: "New comments and replies on your content",
  },
  { key: "follows", label: "Follows", sub: "Someone starts following you" },
  {
    key: "mentions",
    label: "Mentions",
    sub: "Someone @mentions you in a post",
  },
  {
    key: "messages",
    label: "Messages",
    sub: "New direct messages and group chats",
  },
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
  /** Which single toggle is in flight — not a panel-wide freeze. */
  const [saving, setSaving] = useState<keyof NotifPrefs | null>(null);

  const isOn = (key: keyof NotifPrefs) => prefs[key] !== false;

  async function toggle(key: keyof NotifPrefs, next: boolean) {
    const prev = prefs;
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);

    // One key, merged server-side (0064). Writing the whole object meant two
    // devices with this panel open overwrote each other's unrelated choices —
    // last write wins on the entire JSONB, so turning messages off on your
    // phone silently turned hypes back on if your laptop had just changed
    // them.
    const { data, error } = await supabase.rpc("set_notif_pref", {
      p_key: key,
      p_on: next,
    });
    setSaving(null);
    if (error) {
      setPrefs(prev);
      toast("Couldn't save, try again", "error");
      return;
    }
    // Take the server's copy: it is authoritative, and it carries any change
    // another device made while this one was looking at a stale object.
    if (data && typeof data === "object") setPrefs(data as NotifPrefs);
    toast("Saved", "success");
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
          disabled={saving === item.key}
        />
      ))}
      <p className="mt-3 px-2 text-xs text-faint">
        Turning a type off hides those notifications from your feed and badge.
      </p>
    </div>
  );
}
