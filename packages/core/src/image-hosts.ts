/**
 * Which image URLs next/image is allowed to touch.
 *
 * next/image throws at runtime for any host missing from
 * `images.remotePatterns` in next.config, so every caller has to ask
 * before handing one over. This list and that config are a pair: add a
 * host to one and you must add it to the other.
 *
 * Kept here rather than inside a component because two of them need
 * it — OptimizedImage for post and Shot media, Avatar for faces — and
 * a second copy is the kind that quietly stops matching the config.
 */
const OPTIMIZABLE_HOSTS = new Set(["fyaioseridqabockidyp.supabase.co"]);

export function canOptimize(src: string): boolean {
  // Local (public/) and inline data URLs are always safe for next/image.
  if (src.startsWith("/") || src.startsWith("data:")) return true;
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}
