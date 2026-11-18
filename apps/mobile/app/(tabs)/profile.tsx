import { Placeholder } from "@/Placeholder";
import { SignOutRow } from "@/auth/SignOutRow";

/**
 * Profile, still a placeholder — but not a dead end.
 *
 * Sign-out lives here until Settings is ported. It is on this tab because
 * it is where someone would look for it, and because without it a
 * signed-in device cannot reach the sign-in or sign-up screens at all:
 * the entry router sends a session straight to the feed.
 */
export default function Profile() {
  return (
    <Placeholder
      href="/profile"
      label="Profile"
      blurb="Frames, nameplates, avatar decorations — the customisation the product is actually about. The marketplace browses here; buying stays on the web."
      footer={<SignOutRow />}
    />
  );
}
