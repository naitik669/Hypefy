import { redirect } from "next/navigation";

/**
 * There was a second Shot composer here, older than the camera screen and
 * behaving differently from it: it held you on a spinner for the upload, and
 * its "copy link" copied the Shots feed rather than the Shot. Everything
 * posts through the creator now; an old link to this address lands there.
 */
export default function CreateShotPage() {
  redirect("/create?mode=shot");
}
