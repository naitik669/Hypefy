import { redirect } from "next/navigation";

/** Saved is the Library now. Old links, bookmarks and shortcuts still land. */
export default function SavedMoved() {
  redirect("/library");
}
