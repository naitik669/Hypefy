/**
 * A transparent 1x1 GIF, used as every <video>'s poster when it has no cover
 * image of its own.
 *
 * Android's WebView paints its own placeholder on a video with no poster
 * while the first frame is on its way: a big grey circle with a play
 * triangle. In the app that showed on Shots tiles and chat videos before
 * they loaded. Any poster at all suppresses it, and a transparent one lets
 * the tile's own background show instead.
 */
export const BLANK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
