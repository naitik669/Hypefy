/**
 * The way into the cutout studio, from the drawer's Create tile.
 *
 * A full navigation, deliberately not router.push: the studio page is
 * cross-origin isolated (its model needs that for threads), and isolation is
 * decided when a document loads. Arriving by a client-side route change
 * would keep the chat's unisolated document and the cut would run on one
 * thread, about three times slower. See src/app/stickers/new/page.tsx.
 */
export function stickerStudioHref(conversationId: string | null): string {
  return conversationId ? `/stickers/new?to=${encodeURIComponent(conversationId)}` : "/stickers/new";
}

export function openStickerStudio(conversationId: string | null, nav: Pick<Location, "assign"> = window.location): void {
  nav.assign(stickerStudioHref(conversationId));
}
