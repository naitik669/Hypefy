/**
 * Who touched the stickers on your Show, read defensively.
 *
 * The owner sees who; viewers see totals. That split is enforced in the
 * database — `show_sticker_results` is gated on being the Show's author, and
 * the two calls a viewer makes never learn a name — so this file only has to
 * read the answer without trusting its shape, the way `readStickerState` does.
 *
 * It also has to cope with the function not existing yet: 0194 adds it and
 * cannot be applied from the environment this was written in, so a client is
 * live against a database without it. Missing reads as "nothing to show",
 * never as a crash.
 */

import type { LayerType } from "@/lib/show-layers";

/** The kinds a sticker's results can be about. */
export const RESULT_KINDS = ["poll", "quiz", "slider", "countdown", "question", "addyours"] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

export function isResultKind(type: LayerType | string): type is ResultKind {
  return (RESULT_KINDS as readonly string[]).includes(type);
}

export type ResultPerson = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  hue: number;
  /** A poll or quiz choice index, or a slider's 0–100. Null where neither. */
  value: number | null;
  /** What they wrote, for a question. */
  body: string | null;
  at: string | null;
};

export type StickerResult = { kind: ResultKind; people: ResultPerson[] };

/** By layer id, matching the layers still on the Show. */
export type StickerResults = Record<string, StickerResult>;

export const NO_RESULTS: StickerResults = {};

/** A Postgres error for "that function does not exist", before 0194 is applied. */
export function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42883" || code === "PGRST202";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function person(raw: unknown): ResultPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  // Without an id there is nobody to show, and nothing to key a row on.
  if (!id) return null;
  return {
    id,
    username: str(r.username),
    displayName: str(r.display_name),
    avatarUrl: str(r.avatar_url),
    hue: Number(r.avatar_hue) || 200,
    value: typeof r.value === "number" ? r.value : null,
    body: str(r.body),
    at: str(r.at),
  };
}

export function readStickerResults(raw: unknown): StickerResults {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_RESULTS;
  const out: StickerResults = {};
  for (const [layerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const kind = String(v.kind ?? "");
    if (!isResultKind(kind)) continue;
    const people = Array.isArray(v.people)
      ? v.people.map(person).filter((p): p is ResultPerson => p !== null)
      : [];
    out[layerId] = { kind, people };
  }
  return out;
}

/** What one person's row says to the right of their name. */
export function resultValue(kind: ResultKind, p: ResultPerson, options: readonly string[]): string {
  if (kind === "slider") return p.value === null ? "" : `${p.value}%`;
  if (kind === "poll" || kind === "quiz") {
    if (p.value === null) return "";
    return options[p.value] ?? `Option ${p.value + 1}`;
  }
  // A countdown and an Add yours are a list of people and nothing else; a
  // question's words are too long for a column and get their own line.
  return "";
}

/** How a section heads itself when nobody has done anything yet. */
export function emptyResult(kind: ResultKind): string {
  switch (kind) {
    case "poll":
    case "quiz":
      return "Nobody has answered yet";
    case "slider":
      return "Nobody has hyped it yet";
    case "countdown":
      return "Nobody is waiting for it yet";
    case "question":
      return "Nobody has written anything yet";
    case "addyours":
      return "Nobody has added theirs yet";
  }
}
