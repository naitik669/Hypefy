"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useMentionHashtag, type Suggestion } from "@/components/ui/MentionHashtagPicker";
import { lookFor } from "@/lib/show-looks";
import type { Place } from "@/lib/places";
import {
  typedValue,
  type LayerPayload,
  type LocationPayload,
  type ShowLayer,
} from "@/lib/show-layers";

/** The tags typed on the sticker itself. */
export type TagType = "location" | "hashtag" | "mention" | "link";

export function isTagType(type: string): type is TagType {
  return type === "location" || type === "hashtag" || type === "mention" || type === "link";
}

/** How long typing has to pause before a place is looked up. */
const PLACE_PAUSE_MS = 450;

/**
 * A tag, typed on the sticker itself.
 *
 * The rest of the picture dims and the sticker comes up near the top, as
 * the field: a caret on the chip, in the chip's own colours, so what is
 * typed is already what it will look like. Under it, what it might be — a
 * place with the rest of its address filled in, a person, a tag people
 * already use. Picking one finishes it.
 *
 * It replaced a field at the foot of the screen for places and tags, and
 * two sheets for people and links: four ways to type a word onto a picture.
 */
export function TagWriter({
  layer,
  onType,
  onPick,
  onDone,
}: {
  layer: ShowLayer & { type: TagType };
  /** Every keystroke, as typed. */
  onType: (value: string) => void;
  /** A suggestion taken: the whole payload, and it is finished. */
  onPick: (payload: LayerPayload) => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(() => typedValue(layer));
  const look = lookFor(layer.type, layer.look, layer.tint);

  const prefix = layer.type === "hashtag" ? "#" : layer.type === "mention" ? "@" : "";
  const placeholder =
    layer.type === "location"
      ? "Where are you?"
      : layer.type === "hashtag"
        ? "tag"
        : layer.type === "mention"
          ? "someone"
          : "hypefy.app";

  function type(next: string) {
    setValue(next);
    onType(next);
  }

  return (
    <div
      className="absolute inset-0 z-40 bg-black/45"
      onPointerDown={(e) => e.stopPropagation()}
      data-tag-writer={layer.type}
    >
      <button
        type="button"
        onClick={onDone}
        className="absolute right-3 top-3.5 h-10 rounded-[14px] bg-accent px-[18px] text-[15px] font-extrabold text-accent-ink transition active:scale-95"
      >
        Done
      </button>

      <div className="absolute inset-x-0 top-[120px] flex justify-center px-6">
        <label
          className="flex max-w-full items-center gap-2 shadow-[0_12px_26px_rgba(0,0,0,0.4)]"
          style={{ ...look.box, transform: "rotate(-2deg)", fontSize: 20 }}
        >
          {layer.type === "location" && <MapPin size={20} strokeWidth={2.6} color={look.ink} aria-hidden />}
          {prefix && (
            <span aria-hidden style={{ ...look.title, fontSize: 20 }}>
              {prefix}
            </span>
          )}
          <span className="sr-only">
            {layer.type === "location" ? "Place" : layer.type === "mention" ? "Username" : layer.type === "link" ? "Link" : "Tag"}
          </span>
          <input
            autoFocus
            value={value}
            onChange={(e) => type(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDone();
            }}
            placeholder={placeholder}
            inputMode={layer.type === "link" ? "url" : undefined}
            autoCapitalize={layer.type === "location" ? "words" : "none"}
            autoCorrect="off"
            spellCheck={false}
            size={Math.max(4, value.length + 1)}
            maxLength={layer.type === "link" ? 2048 : 60}
            className="min-w-0 bg-transparent outline-none placeholder:opacity-45"
            style={{ ...look.title, fontSize: 20, caretColor: look.ink, maxWidth: 260 }}
          />
        </label>
      </div>

      <div className="absolute inset-x-5 top-[200px]">
        {layer.type === "location" && <PlaceList query={value} onPick={(p) => onPick({ place: p.name, area: p.area } satisfies LocationPayload)} />}
        {layer.type === "mention" && <PeopleRow query={value} onPick={(username) => onPick({ username })} />}
        {layer.type === "hashtag" && <TagRow query={value} onPick={(tag) => onPick({ tag })} />}
        {layer.type === "link" && (
          <p className="text-center text-xs font-semibold text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            Only https links. People see where it goes before they tap.
          </p>
        )}
      </div>
    </div>
  );
}

/** Places matching what is typed, and "where I am now". */
function PlaceList({ query, onPick }: { query: string; onPick: (place: Place) => void }) {
  const [found, setFound] = useState<{ q: string; places: Place[] }>({ q: "", places: [] });
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++asked.current;
    const wait = setTimeout(() => {
      void fetch(`/api/places?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((body: { places?: Place[] }) => {
          if (ticket === asked.current) setFound({ q, places: body.places ?? [] });
        })
        .catch(() => {});
    }, PLACE_PAUSE_MS);
    return () => clearTimeout(wait);
  }, [query]);

  function here() {
    if (!("geolocation" in navigator)) return setDenied(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        void fetch(`/api/places?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`)
          .then((r) => (r.ok ? r.json() : { places: [] }))
          .then((body: { places?: Place[] }) => {
            setLocating(false);
            const [place] = body.places ?? [];
            if (place) onPick(place);
          })
          .catch(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setDenied(true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const places = query.trim().length >= 2 && found.q === query.trim() ? found.places : [];

  return (
    <div role="listbox" aria-label="Places" className="rounded-[20px] bg-neutral-900/85 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)] backdrop-blur-md">
      {places.map((p) => (
        <button
          key={`${p.name}|${p.area}`}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-white transition hover:bg-white/10"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
            <MapPin size={18} fill="currentColor" strokeWidth={0} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold">{p.name}</span>
            {p.area && <span className="block truncate text-xs font-semibold text-white/70">{p.area}</span>}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={here}
        disabled={locating}
        className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-white/90 transition hover:bg-white/10 disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <LocateFixed size={18} strokeWidth={2.4} aria-hidden />
        </span>
        <span className="text-sm font-bold">
          {locating ? "Finding where you are…" : denied ? "Location is off — type the place instead" : "Use where I am now"}
        </span>
      </button>
      <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-white/50">Places © OpenStreetMap contributors</p>
    </div>
  );
}

function suggestionsFor(
  suggestions: Suggestion[],
): { people: Extract<Suggestion, { kind: "mention" }>[]; tags: Extract<Suggestion, { kind: "hashtag" }>[] } {
  return {
    people: suggestions.filter((s): s is Extract<Suggestion, { kind: "mention" }> => s.kind === "mention"),
    tags: suggestions.filter((s): s is Extract<Suggestion, { kind: "hashtag" }> => s.kind === "hashtag"),
  };
}

/** People, as faces in a row: the chat composer's own search, asked the same question. */
function PeopleRow({ query, onPick }: { query: string; onPick: (username: string) => void }) {
  const typed = `@${query.replace(/^@+/, "")}`;
  const { people } = suggestionsFor(useMentionHashtag(typed, typed.length).suggestions);
  if (people.length === 0) return null;
  return (
    <div role="listbox" aria-label="People" className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(p.username)}
          className="flex w-[66px] shrink-0 flex-col items-center gap-1.5 text-white active:scale-95"
        >
          <span className="rounded-[19px] border-2 border-white/90">
            <Avatar name={p.display_name ?? p.username} hue={p.avatar_hue ?? 280} size={52} src={p.avatar_url ?? undefined} className="rounded-[17px]" />
          </span>
          <span className="max-w-[66px] truncate text-[11px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{p.username}</span>
        </button>
      ))}
    </div>
  );
}

/** Tags people already use, with how often. */
function TagRow({ query, onPick }: { query: string; onPick: (tag: string) => void }) {
  const typed = `#${query.replace(/^#+/, "")}`;
  const { tags } = suggestionsFor(useMentionHashtag(typed, typed.length).suggestions);
  if (tags.length === 0) return null;
  return (
    <div role="listbox" aria-label="Tags" className="flex flex-wrap justify-center gap-2">
      {tags.slice(0, 8).map((t) => (
        <button
          key={t.tag}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(t.tag)}
          className="h-10 rounded-[13px] bg-black/55 px-3.5 text-[13px] font-bold text-white backdrop-blur-sm active:scale-95"
        >
          #{t.tag}
          {t.count > 0 && <span className="ml-1.5 font-semibold text-white/60">· {t.count}</span>}
        </button>
      ))}
    </div>
  );
}
