"use client";

import { AMBIENT_LOOK, readLayers, type ShowLayer } from "@/lib/show-layers";

/**
 * The Add yours sticker, carried from the Show you answered onto your own.
 *
 * Joining used to drop you at a bare camera. Your answer and the prompt it
 * answered were then two posts that happened to mention each other, and the
 * thread only existed in the collab row. Carrying the sticker — in the place
 * it was, at the angle it was, in the look it was — is what makes the two read
 * as one thing.
 *
 * The geometry is already in hand: the viewer is rendering that layer when you
 * tap it, so there is nothing to ask the server for.
 *
 * sessionStorage, keyed by collab, the way lib/chat-media-url keeps signed
 * links: it has to survive one navigation and nothing more, and it must not
 * outlive the tab or reach another one. Deliberately NOT the URL — it is a
 * whole layer, and the URL is visible, shareable and length-limited.
 */

const KEY = "hypefy:show-carry:v1";

/** Everything that could be in the store, by collab id. */
type Carried = Record<string, unknown>;

function read(): Carried {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Carried) : {};
  } catch {
    // Unreadable, absent, or storage refused: carrying nothing is a fine
    // outcome — the answer is simply an undecorated Show.
    return {};
  }
}

function write(next: Carried): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* full or unavailable */
  }
}

/**
 * Remember this sticker for the Show the viewer is about to make.
 *
 * The `tint` goes. Look 4 is Ambient, which takes its colour from the
 * photograph underneath — and the photograph is about to be a different one,
 * so a carried tint would be the old picture's colour on the new picture.
 * Cleared here, and `ambientTint` fills it in again from the new photo.
 */
export function carryLayer(collabId: string, layer: ShowLayer): void {
  const { tint: _ambient, ...rest } = layer;
  void _ambient;
  write({ ...read(), [collabId]: rest });
}

/**
 * The sticker waiting for this collab, if there is one, and forget it either
 * way — it belongs to the one Show being made, not to every later visit.
 *
 * Validated on the way out, not trusted: sessionStorage is the viewer's own
 * and `readLayers` is the only validator the layer model has.
 */
export function takeCarried(collabId: string): ShowLayer[] {
  const all = read();
  const held = all[collabId];
  if (held === undefined) return [];
  delete all[collabId];
  write(all);
  const [layer] = readLayers([held]);
  if (!layer || layer.type !== "addyours") return [];
  return layer.look === AMBIENT_LOOK ? [{ ...layer, tint: undefined }] : [layer];
}
