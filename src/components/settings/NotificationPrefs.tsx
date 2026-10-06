"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { LevelControl } from "@/components/notifications/TuneSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { levelOf, levelValue, type ActivityPrefs, type Level, type LevelKey } from "@/lib/activity-prefs";

/** The same stored object the Tune sheet edits. */
export type NotifPrefs = ActivityPrefs;

/**
 * The kinds that have a level: All, Highlights (only from people you
 * follow), or Off.
 *
 * This page used to offer each as an on/off switch, while the Tune sheet in
 * Activity offered the three levels for the same stored setting. A kind set
 * to Highlights there showed here as plain "on", and the two screens could
 * not describe each other's choices. One control now, in both places.
 */
const ITEMS: { key: LevelKey; label: string; sub: string }[] = [
  { key: "hypes", label: "Hypes", sub: "On your posts, Shots and comments" },
  { key: "rehypes", label: "Rehypes", sub: "Someone passes your post or Shot on" },
  { key: "comments", label: "Comments", sub: "New comments and replies" },
  { key: "follows", label: "Follows", sub: "Someone starts following you" },
  { key: "mentions", label: "Mentions", sub: "Someone @mentions you" },
];

export function NotificationPrefs({
  initialPrefs,
}: {
  userId: string;
  initialPrefs: NotifPrefs;
}) {
  const supabase = createClient();
  const toast = useToast();
  // Everything defaults to All: the stored object only holds what was changed.
  const [prefs, setPrefs] = useState<NotifPrefs>(initialPrefs);
  /** Which single control is in flight, not a panel-wide freeze. */
  const [saving, setSaving] = useState<string | null>(null);

  async function setLevel(key: LevelKey, level: Level) {
    const before = prefs;
    const value = levelValue(level);
    const next: Record<string, unknown> = { ...prefs };
    if (value === null) delete next[key];
    else next[key] = value;
    setPrefs(next as NotifPrefs);
    setSaving(key);
    // One key, merged server-side, through the same door as the Tune sheet.
    const { data, error } = await supabase.rpc("set_activity_pref", { p_key: key, p_value: value as never });
    setSaving(null);
    if (error) {
      setPrefs(before);
      toast("Couldn't save, try again", "error");
      return;
    }
    // The server's copy is the truth, and carries what another device changed.
    if (data && typeof data === "object") setPrefs(data as NotifPrefs);
  }

  async function setMessages(on: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, messages: on });
    setSaving("messages");
    const { data, error } = await supabase.rpc("set_notif_pref", { p_key: "messages", p_on: on });
    setSaving(null);
    if (error) {
      setPrefs(before);
      toast("Couldn't save, try again", "error");
      return;
    }
    if (data && typeof data === "object") setPrefs(data as NotifPrefs);
  }

  return (
    <div className="flex flex-col">
      {ITEMS.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-3 px-2 py-3 ${saving === item.key ? "opacity-60" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="text-xs text-muted">{item.sub}</p>
          </div>
          <LevelControl
            label={item.label}
            level={levelOf(prefs, item.key)}
            onChange={(level) => void setLevel(item.key, level)}
          />
        </div>
      ))}
      <SettingToggle
        label="Messages"
        sub="New direct messages and group chats"
        checked={prefs.messages !== false}
        onChange={(next) => void setMessages(next)}
        disabled={saving === "messages"}
      />
      <p className="mt-3 px-2 text-xs text-faint">
        Highlights keeps only people you follow. Off hides that kind from Activity and stops its pings.
      </p>
    </div>
  );
}
