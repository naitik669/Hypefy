"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import {
  kindOn,
  levelOf,
  levelValue,
  pauseEnd,
  pausedUntil,
  type ActivityPrefs,
  type KindKey,
  type Level,
  type LevelKey,
  type PauseChoice,
} from "@/lib/activity-prefs";

type Person = { id: string; display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url: string | null };

const LEVELS: { key: LevelKey[]; label: string; sub?: string }[] = [
  { key: ["hypes"], label: "Hypes", sub: "On your posts, Shots and comments" },
  { key: ["follows"], label: "New followers" },
  { key: ["comments", "mentions"], label: "Replies & mentions" },
  { key: ["shares"], label: "Shares to chats" },
];

const NEW_KINDS: { key: KindKey; label: string; sub: string }[] = [
  { key: "spotlight_pages", label: "Spotlight pages", sub: "A friend adds a page" },
  { key: "shows_posted", label: "Friends go live", sub: "Someone you follow posts a Show" },
  { key: "milestones", label: "Milestones", sub: "Your post passes 100 hypes" },
  { key: "back_after", label: "Back after a while", sub: "Someone you follow posts after weeks away" },
];

const PAUSES: { key: PauseChoice; label: string }[] = [
  { key: "hour", label: "1 hour" },
  { key: "tomorrow", label: "Until tomorrow" },
  { key: "week", label: "A week" },
];

/**
 * Tune your Activity: what shows on the Activity screen and what pings the
 * phone. Every change is one key, saved as it is made, and put back if the
 * save fails.
 */
export function TuneSheet({
  open,
  onClose,
  prefs,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  prefs: ActivityPrefs;
  onChange: (next: ActivityPrefs) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  /** Which break was picked this session, so its chip reads as chosen. */
  const [pause, setPause] = useState<PauseChoice | null>(null);
  const [muted, setMuted] = useState<Person[]>([]);

  const mutedIds = (prefs.muted ?? []).join(",");
  useEffect(() => {
    if (!open) return;
    const ids = mutedIds ? mutedIds.split(",") : [];
    if (!ids.length) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("id, display_name, username, avatar_hue, avatar_url")
      .in("id", ids)
      .then(({ data }) => {
        if (!cancelled) setMuted((data ?? []) as Person[]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mutedIds]);

  async function save(changes: Partial<Record<string, unknown>>) {
    const before = prefs;
    const next: Record<string, unknown> = { ...prefs };
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    onChange(next as ActivityPrefs);
    haptics.select();
    const results = await Promise.all(
      Object.entries(changes).map(([k, v]) => supabase.rpc("set_activity_pref", { p_key: k, p_value: v as never })),
    );
    if (results.some((r) => r.error)) {
      onChange(before);
      toast("Couldn't save that. Try again.", "error");
    }
  }

  function setLevel(keys: LevelKey[], level: Level) {
    const v = levelValue(level);
    void save(Object.fromEntries(keys.map((k) => [k, v])));
  }

  function choosePause(choice: PauseChoice) {
    if (pause === choice && pausedUntil(prefs)) {
      setPause(null);
      void save({ paused_until: null });
      return;
    }
    setPause(choice);
    void save({ paused_until: pauseEnd(choice).toISOString() });
  }

  async function unmute(id: string) {
    const before = prefs;
    onChange({ ...prefs, muted: (prefs.muted ?? []).filter((m) => m !== id) });
    const { error } = await supabase.rpc("set_activity_mute", { p_user: id, p_on: false });
    if (error) {
      onChange(before);
      toast("Couldn't unmute. Try again.", "error");
    }
  }

  const paused = pausedUntil(prefs);
  // Filtered by the live list, so someone unmuted leaves at once.
  const mutedPeople = muted.filter((m) => (prefs.muted ?? []).includes(m.id));

  return (
    <BottomSheet open={open} onClose={onClose} title="Tune your Activity" size="tall">
      <p className="-mt-1 text-xs text-muted">Only changes what shows here and what pings you.</p>

      <Section>Take a break</Section>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pause notifications">
        {PAUSES.map((p) => {
          const on = !!paused && pause === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => choosePause(p.key)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors ${
                on ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {paused && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted" data-paused>
          No pings until {formatPause(paused)}.
          <button
            type="button"
            onClick={() => {
              setPause(null);
              void save({ paused_until: null });
            }}
            className="font-bold text-accent"
          >
            Resume
          </button>
        </p>
      )}

      <Section>Show me</Section>
      <div className="flex flex-col">
        {LEVELS.map((row) => {
          const level = levelOf(prefs, row.key[0]);
          return (
            <div key={row.label} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{row.label}</p>
                {row.sub && <p className="text-[11px] text-muted">{row.sub}</p>}
              </div>
              <div className="flex rounded-full bg-background p-0.5" role="group" aria-label={row.label}>
                {(["all", "highlights", "off"] as Level[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={level === l}
                    onClick={() => level !== l && setLevel(row.key, l)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition-colors ${
                      level === l ? "bg-foreground text-background" : "text-muted"
                    }`}
                  >
                    {l === "all" ? "All" : l === "off" ? "Off" : "Highlights"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Section>
        New kinds{" "}
        <span className="ml-1 rounded-[5px] bg-accent px-1.5 py-0.5 align-[1px] text-[9px] font-extrabold tracking-[0.08em] text-accent-ink">
          NEW
        </span>
      </Section>
      {NEW_KINDS.map((k) => (
        <Switch key={k.key} label={k.label} sub={k.sub} checked={kindOn(prefs, k.key)} onChange={(v) => save({ [k.key]: v })} />
      ))}

      <Section>Who</Section>
      <Switch
        label="Only people I follow"
        sub="Everyone else still shows here, without a ping"
        checked={kindOn(prefs, "only_following")}
        onChange={(v) => save({ only_following: v || null })}
      />
      <Switch
        label="Daily summary"
        sub="Hypes stop pinging; one summary at 9 pm"
        checked={kindOn(prefs, "daily_summary")}
        onChange={(v) => save({ daily_summary: v || null })}
      />

      <Section>Muted people</Section>
      {mutedPeople.length === 0 ? (
        <p className="pb-3 text-xs text-muted">Swipe a notification left to mute someone.</p>
      ) : (
        <div className="flex flex-col pb-3">
          {mutedPeople.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-1.5">
              <Avatar name={m.display_name ?? m.username ?? "?"} hue={m.avatar_hue ?? 280} src={m.avatar_url ?? undefined} size={32} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.username ?? m.display_name}</p>
              <button
                type="button"
                onClick={() => unmute(m.id)}
                className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-foreground"
              >
                Unmute
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <p className="pb-1.5 pt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{children}</p>;
}

function Switch({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}>
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-[19px] bg-accent-ink" : "translate-x-[3px] bg-white"
          }`}
        />
      </span>
    </button>
  );
}

function formatPause(t: Date) {
  const sameDay = t.toDateString() === new Date().toDateString();
  const time = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${t.toLocaleDateString([], { weekday: "short" })} ${time}`;
}
