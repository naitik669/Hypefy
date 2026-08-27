import type { Json } from "@/lib/supabase/database.types";

/**
 * Helpers for the two places Supabase types genuinely can't be narrowed
 * automatically. Everything else should use the generated types directly.
 *
 * `one()` was previously copy-pasted five times — in discover/page.tsx,
 * calls/page.tsx, admin/reports/page.tsx, messages/[threadId]/page.tsx and
 * RealChatView.tsx — each as an untyped `(p: any)`.
 */

/**
 * Embedded relations come back as `T` or `T[]` depending on how PostgREST
 * infers cardinality, so a to-one join still has to be unwrapped by hand.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The array-shaped counterpart of `one()`. */
export function many<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/**
 * `toggle_hype` returns `jsonb` — typed as `Json`, which isn't indexable — so
 * narrow it to the shape the callers actually read.
 */
export function hypeResult(value: Json | null | undefined): { hyped: boolean; hype_count: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return { hyped: Boolean(v.hyped), hype_count: Number(v.hype_count) };
}

/**
 * RPCs declared `returns jsonb` type as `Json`, which isn't indexable. Used for
 * get_affinity's author/tag weight maps.
 */
export function jsonRecord(value: Json | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
