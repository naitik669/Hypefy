import { redirect } from "next/navigation";

/** Diary is Spotlight now; links to the old address still arrive. */
export default function DiaryMoved() {
  redirect("/messages/spotlight");
}
