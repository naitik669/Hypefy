/**
 * The onboarding slides and their copy.
 *
 * Lifted word for word from the web's IntroCarousel. Separated from the
 * component for the same reason the icon map is: a module with no React in
 * it can be read by a test, and `tests/mobile-onboarding.test.ts` compares
 * every string here against the web's source. Change the wording on the
 * site and this fails until the phone says the same thing.
 *
 * The web writes the accent span as JSX — `Welcome to <span>Hypefy</span>`.
 * React Native has no span, so the title is split into the plain lead and
 * the accented tail, which the component renders as two <Text> runs. The
 * test reconstructs the web's string from these two halves rather than
 * being told what it should be, so a change to either half is caught.
 */

export const SLIDES = ["welcome", "posts", "shots", "discover", "identity"] as const;

export type SlideId = (typeof SLIDES)[number];

export type SlideCopy = {
  /** The title up to the accented run. */
  readonly titleLead: string;
  /** The accented tail, if the slide has one. Only "welcome" does. */
  readonly titleAccent?: string;
  readonly lead: string;
  readonly text: string;
};

export const COPY: Readonly<Record<SlideId, SlideCopy>> = {
  welcome: {
    titleLead: "Welcome to ",
    titleAccent: "Hypefy",
    lead: "Where your personality lives.",
    text: "Post, share Shots, hype what hits, and connect through a social app that feels alive.",
  },
  posts: {
    titleLead: "Post what matters",
    lead: "Your world, your way.",
    text: "Share your thoughts, images, and moments, then let people Hype what hits.",
  },
  shots: {
    titleLead: "Share quick Shots",
    lead: "Short video, big energy.",
    text: "Post short video reels your people can't stop watching.",
  },
  discover: {
    titleLead: "Find your people",
    lead: "Discover your vibe.",
    text: "Explore creators, posts, profiles, and conversations that match your energy.",
  },
  identity: {
    titleLead: "Make the profile yours",
    lead: "Show up as you.",
    text: "Your name, photo, bio, and tags shape how the world sees you.",
  },
};

/** The full title as one string, for tests and for an accessible name. */
export function titleOf(slide: SlideId): string {
  const c = COPY[slide];
  return `${c.titleLead}${c.titleAccent ?? ""}`;
}
