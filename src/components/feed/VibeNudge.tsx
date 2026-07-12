"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";

const SNOOZE_KEY = "hypefy_vibe_nudge_snooze";

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Gentle once-a-day prompt on Home to set a Note when the viewer has none
 * active. Dismiss snoozes for the rest of the day (localStorage) — no push,
 * no nagging. Opens the same NoteEditorSheet used in the inbox rail.
 */
export function VibeNudge() {
  const supabase = createClient();
  const [visible, setVisible] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [me, setMe] = useState<{ name: string; hue: number; avatarUrl: string | null } | null>(null);
  const [current, setCurrent] = useState<MyNote>(null);

  useEffect(() => {
    // Snoozed today already — render nothing, skip the queries entirely.
    try {
      if (localStorage.getItem(SNOOZE_KEY) === today()) return;
    } catch {
      return;
    }

    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const nowIso = new Date().toISOString();
      const [{ data: note }, { data: prof }] = await Promise.all([
        supabase.from("notes").select("text, audience, track").eq("user_id", user.id).gt("expires_at", nowIso).maybeSingle(),
        supabase.from("profiles").select("display_name, username, avatar_hue, avatar_url").eq("id", user.id).maybeSingle(),
      ]);
      if (!active) return;

      // Already has an active note — nothing to nudge.
      if (note) return;

      setMe({
        name: (prof as any)?.display_name ?? (prof as any)?.username ?? "You",
        hue: (prof as any)?.avatar_hue ?? 280,
        avatarUrl: (prof as any)?.avatar_url ?? null,
      });
      setVisible(true);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, today()); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">What&apos;s the vibe today?</span>
            <span className="block truncate text-xs text-muted">Drop a note your circle sees for 24 hours.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={snooze}
          aria-label="Not now"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <NoteEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        current={current}
        onSaved={(n) => {
          setCurrent(n);
          if (n) { snooze(); setVisible(false); } // posted → clear the nudge for today
        }}
        me={me ?? undefined}
      />
    </>
  );
}
