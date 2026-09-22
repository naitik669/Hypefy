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

const LEVEL_ORDER: Level[] = ["all", "highlights", "off"];
const LEVEL_LABEL: Record<Level, string> = { all: "All", highlights: "Highlights", off: "Off" };

/**
 * Tune your Activity: what shows on the Activity screen and what pings the
 * phone. Every change is one key, saved as it is made, and put back if the
 * save fails.
 *
 * Shapes follow the rest of the app: rounded at roughly a third of the
 * shorter side (see ProfileStatusBubble's note on this), not the full pills
 * this sheet used to reach for. A pill is its own family of shape and read
 * as foreign next to every squircle elsewhere in Hypefy.
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
              className={`rounded-[10px] px-3 py-1.5 text-[13px] font-bold transition-colors ${
                on ? "bg-accent text-accent-ink" : "bg-surface text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {paused && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] bg-accent/10 px-3 py-2 text-xs text-accent" data-paused>
          <span>No pings until {formatPause(paused)}.</span>
          <button
            type="button"
            onClick={() => {
              setPause(null);
              void save({ paused_until: null });
            }}
            className="shrink-0 font-bold"
          >
            Resume
          </button>
        </div>
      )}

      <Section>Show me</Section>
      <div className="flex flex-col">
        {LEVELS.map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{row.label}</p>
              {row.sub && <p className="text-[11px] text-muted">{row.sub}</p>}
            </div>
            <LevelControl label={row.label} level={levelOf(prefs, row.key[0])} onChange={(l) => setLevel(row.key, l)} />
          </div>
        ))}
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
                className="rounded-[10px] bg-surface px-3 py-1.5 text-xs font-bold text-foreground"
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
  return <p className="pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{children}</p>;
}

/**
 * All / Highlights / Off as one squircle track with a sliding fill, instead
 * of three separate pill buttons — the same three choices, read as one
 * control rather than a row of individual buttons.
 */
function LevelControl({ label, level, onChange }: { label: string; level: Level; onChange: (next: Level) => void }) {
  const index = LEVEL_ORDER.indexOf(level);
  return (
    <div className="relative flex w-[156px] shrink-0 rounded-[10px] bg-surface p-[3px]" role="group" aria-label={label}>
      <span
        aria-hidden
        className="absolute inset-y-[3px] rounded-[7px] bg-foreground transition-transform duration-200 ease-out"
        style={{ width: "calc((100% - 6px) / 3)", transform: `translateX(${index * 100}%)` }}
      />
      {LEVEL_ORDER.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={level === l}
          onClick={() => level !== l && onChange(l)}
          className={`relative z-10 flex-1 py-1.5 text-center text-[10px] font-bold whitespace-nowrap transition-colors ${
            level === l ? "text-background" : "text-muted"
          }`}
        >
          {LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  );
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
      <span className={`relative h-[22px] w-[38px] shrink-0 rounded-[7px] transition-colors ${checked ? "bg-accent" : "bg-border"}`}>
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-[5px] transition-transform ${
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
