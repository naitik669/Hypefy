"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CARD_LAYOUTS,
  CARD_THEMES,
  MAX_LINKS,
  type CardLayout,
  type ProfileLink,
} from "@/lib/profile-card";

/**
 * Owner-only editing for the profile card: the link buttons, the layout
 * and the colour.
 *
 * Writes go straight to Supabase under RLS — the owner policies on
 * profile_links and profiles are what authorise them, so there is no
 * server route to keep in sync. The database also re-checks link shape and
 * the eight-link cap, so this validation is for the message, not the
 * boundary.
 */
export function ProfileCardEditor({
  userId,
  links,
  layout,
  theme,
  onChange,
  onDone,
}: {
  userId: string;
  links: ProfileLink[];
  layout: CardLayout;
  theme: string;
  onChange: (next: {
    links?: ProfileLink[];
    layout?: CardLayout;
    theme?: string;
  }) => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = links.length >= MAX_LINKS;

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (busy || full) return;
    setError(null);

    const trimmed = label.trim();
    if (!trimmed) return setError("Give the button a label.");

    // Accept "example.com" and make it a real URL, so nobody has to think
    // about schemes. Anything already carrying one is left alone.
    const raw = url.trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return setError("That does not look like a web address.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return setError("Links have to be http or https.");
    }

    setBusy(true);
    const { data, error: err } = await supabase
      .from("profile_links")
      .insert({
        user_id: userId,
        label: trimmed,
        url: parsed.toString(),
        position: links.length,
      })
      .select("id, label, url, position")
      .single();
    setBusy(false);

    if (err) {
      setError(
        err.message.includes("at most")
          ? `A card holds up to ${MAX_LINKS} links.`
          : "Could not save that link.",
      );
      return;
    }

    onChange({ links: [...links, data as ProfileLink] });
    setLabel("");
    setUrl("");
  }

  async function removeLink(id: string) {
    const before = links;
    // Optimistic: the row is gone from view immediately, restored if the
    // delete fails.
    onChange({ links: links.filter((l) => l.id !== id) });
    const { error: err } = await supabase.from("profile_links").delete().eq("id", id);
    if (err) {
      onChange({ links: before });
      setError("Could not remove that link.");
    }
  }

  async function saveLook(next: { layout?: CardLayout; theme?: string }) {
    onChange(next);
    const patch: { card_layout?: CardLayout; card_theme?: string } = {};
    if (next.layout) patch.card_layout = next.layout;
    if (next.theme) patch.card_theme = next.theme;
    const { error: err } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (err) setError("Could not save the card style.");
  }

  return (
    <div className="animate-rise flex flex-col gap-5 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDone}
          aria-label="Back to card"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-white/10"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-bold">Edit card</span>
      </div>

      {/* Layout */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-widest text-faint uppercase">Layout</p>
        <div className="grid grid-cols-3 gap-2">
          {CARD_LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => saveLook({ layout: l.id })}
              aria-pressed={layout === l.id}
              title={l.hint}
              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                layout === l.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-white/10 bg-white/[0.04] text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-widest text-faint uppercase">Colour</p>
        <div className="flex flex-wrap gap-2">
          {CARD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => saveLook({ theme: t.id })}
              aria-label={t.label}
              aria-pressed={theme === t.id}
              title={t.label}
              style={{ background: t.gradient }}
              className={`h-10 w-10 rounded-xl border-2 transition ${
                theme === t.id ? "border-accent" : "border-white/10"
              }`}
            />
          ))}
        </div>
      </section>

      {/* Links */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-widest text-faint uppercase">
          Links {links.length > 0 && `(${links.length}/${MAX_LINKS})`}
        </p>

        {links.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
              >
                <GripVertical size={14} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{l.label}</span>
                  <span className="block truncate text-[11px] text-faint">{l.url}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeLink(l.id)}
                  aria-label={`Remove ${l.label}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {full ? (
          <p className="text-xs text-faint">
            That is the maximum. Remove one to add another.
          </p>
        ) : (
          <form onSubmit={addLink} className="flex flex-col gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder="Button label"
              aria-label="Button label"
              className="h-11 w-full rounded-xl border border-white/5 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-faint focus:border-white/25"
            />
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="example.com/shop"
                aria-label="Link address"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/5 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-faint focus:border-white/25"
              />
              <button
                type="submit"
                disabled={busy || !label.trim() || !url.trim()}
                className="flex h-11 shrink-0 items-center gap-1 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-50"
              >
                <Plus size={15} />
                Add
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
