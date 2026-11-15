/**
 * The picture that stands for a Show when it is not being played.
 *
 * A photo Show is its own still. A video one has a poster_url since 0213
 * and had nothing at all before that, which is why every grid, showcase
 * and reply card mounted a live <video> with BLANK_POSTER on it and let
 * the decoder catch up — eight tiles meaning eight decoders running to
 * display eight still pictures, on a phone, in a list somebody is
 * scrolling.
 *
 * One function so the decision is made once. It was made in three places
 * with three slightly different fallbacks, and a fourth was about to be
 * written.
 */

import { isVideoUrl } from "@/lib/video-mime";

export type ShowStillSource = {
  media_url?: string | null;
  poster_url?: string | null;
};

/**
 * A still to draw, or null when there is none to be had.
 *
 * Null means a video Show posted before 0213: nothing captured a frame at
 * the time and nothing can now without downloading and decoding the clip.
 * Callers fall back to a player, which is what every Show did before.
 */
export function showStill(show: ShowStillSource): string | null {
  if (show.poster_url) return show.poster_url;
  const media = show.media_url;
  if (!media) return null;
  // A photo Show is its own still. A video one without a poster is not.
  return isVideoUrl(media) ? null : media;
}

/**
 * Whether this one still has to be drawn with a player.
 *
 * True only for an old video Show with no poster. Every new one is a
 * picture, and every photo Show always was.
 */
export function needsPlayer(show: ShowStillSource): boolean {
  return showStill(show) === null && !!show.media_url && isVideoUrl(show.media_url);
}
