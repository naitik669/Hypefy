import { redirect } from "next/navigation";

/**
 * There was a second Show creator here. It turned the camera on the moment
 * it opened, drew a picked video as a broken image, and offered text-only
 * posts it then refused to share. Shows are made in the creator now, which
 * took its one thing worth keeping, the song; a post is added to your Show
 * from that post's own share sheet. An old link to this address lands there.
 */
export default function AddShowPage() {
  redirect("/create?mode=show");
}
