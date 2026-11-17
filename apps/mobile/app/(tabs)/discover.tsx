import { Placeholder } from "@/Placeholder";

/**
 * Routable, but not in the bar — `bottomBar: false` in core says so, and the
 * tabs layout registers it with `href: null`. On the phone it is reached the
 * way the web reaches it: the compass in the top bar, or a swipe right from
 * Home. Neither exists yet, so today this screen is only reachable by URL.
 */
export default function Discover() {
  return (
    <Placeholder
      href="/discover"
      label="Discover"
      blurb="Ranked by @hypefy/core's discover-rank and discover-mix. It has never had a tab — on a phone it sits one swipe right of Home."
    />
  );
}
