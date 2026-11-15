/**
 * Per-user accent colour for profile surfaces.
 *
 * Mirrors BANNERS/bannerGradient in ./profile.ts: a text id resolved against
 * a list that lives in code, so adding a colour is a deploy rather than a
 * migration. Unknown ids fall back to the brand lime at read time, which is
 * also what makes the column safe to widen later.
 *
 * Ink is stored per accent rather than assumed dark. The global
 * --color-accent-ink is #0a0a0a, and that assumption only holds while every
 * accent is light; storing it here means a deep accent later needs one entry
 * in this list and no code change at all.
 *
 * Every colour sits in a lightness band where #0a0a0a on it clears 4.5:1 AND
 * the colour itself is still legible as text on the #0a0a0a background —
 * accents are used both ways round in this app.
 */

export type ProfileAccent = {
  id: string;
  label: string;
  color: string;
  ink: string;
};

export const ACCENTS: ProfileAccent[] = [
  { id: "lime", label: "Lime", color: "#a3e635", ink: "#0a0a0a" },
  { id: "cyan", label: "Cyan", color: "#67e8f9", ink: "#0a0a0a" },
  { id: "sky", label: "Sky", color: "#7dd3fc", ink: "#0a0a0a" },
  { id: "violet", label: "Violet", color: "#c4b5fd", ink: "#0a0a0a" },
  { id: "pink", label: "Pink", color: "#f9a8d4", ink: "#0a0a0a" },
  { id: "rose", label: "Rose", color: "#fda4af", ink: "#0a0a0a" },
  { id: "amber", label: "Amber", color: "#fcd34d", ink: "#0a0a0a" },
  { id: "mint", label: "Mint", color: "#6ee7b7", ink: "#0a0a0a" },
];

export const DEFAULT_ACCENT_ID = "lime";

export function accentById(id?: string | null): ProfileAccent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/**
 * The two CSS variables to drop on a wrapper element.
 *
 * Tailwind v4 compiles `bg-accent` to `background-color: var(--color-accent)`,
 * so redefining the variable on an ancestor re-tints that subtree and nothing
 * outside it. No client JS, and it works from a server component because it
 * is only an inline style.
 */
export function accentVars(id?: string | null): React.CSSProperties {
  const a = accentById(id);
  return {
    "--color-accent": a.color,
    "--color-accent-ink": a.ink,
  } as React.CSSProperties;
}
