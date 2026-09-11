import { redirect } from "next/navigation";

/** The screen is called Spotlight now; the pages on it are still pages. */
export default function PagesMoved() {
  redirect("/messages/spotlight");
}
