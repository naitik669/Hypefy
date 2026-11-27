/**
 * Which of the approved studio shapes the cutout studio uses (design canvas,
 * Final board 6). Kept as one switch because the choice is still Naitik's:
 *
 *   "D" — the cut lands by itself and fills the screen; hold the picture to
 *         see the original; Edit is one round button that opens the brush.
 *         The default, because it is the flow he described.
 *   "E" — one screen: the brush tools float on the picture from the moment
 *         the cut arrives, the edge is a button in the same rail, and Send
 *         sits in the top bar.
 *
 * "F" (cut every recent photo while you choose) is not offered on the web:
 * a web page cannot list the photo library, only receive the one file the
 * person picks, so there is nothing to cut ahead of the choice.
 */
export type StudioLayout = "D" | "E";

export const STUDIO_LAYOUT: StudioLayout = "D";

/** The stage the studio opens in once the cut has landed. */
export function stageAfterCut(layout: StudioLayout): "cut" | "edit" {
  return layout === "E" ? "edit" : "cut";
}
