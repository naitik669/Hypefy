import { redirect } from "next/navigation";

/**
 * Where "Your activity" used to be. It is a screen of its own now, with
 * tabs, so anything pointing here — a bookmark, an old link — lands there.
 */
export default function YourActivityRedirect() {
  redirect("/activity");
}
