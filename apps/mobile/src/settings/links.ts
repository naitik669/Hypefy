/**
 * The legal footer under Settings, as the website lists it.
 *
 * These open in the phone's browser rather than being drawn here: they are
 * long documents the website already renders and keeps dated, and a second
 * copy would be a second thing to keep in step with the law.
 *
 * **Only pages the invite gate leaves open.** The phone's browser has no
 * gate cookie, so a gated page would open on a code field. Every path here is
 * asserted open by tests/mobile-settings.test.ts. The website's footer also
 * links /grievance, which the gate does NOT leave open today — so it is left
 * off here until it is, rather than linking to a wall.
 *
 * Plain data with no imports, so a Node test can read it as a value.
 */
export const LEGAL_LINKS = [
  { label: "Terms of Service", path: "/terms" },
  { label: "Privacy Policy", path: "/privacy" },
  { label: "Community Guidelines", path: "/guidelines" },
  { label: "Cookie Policy", path: "/cookies" },
  { label: "Child Safety", path: "/child-safety" },
] as const;
