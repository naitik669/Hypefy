import { redirect } from "next/navigation";

/**
 * Favourites was a second private list of people beside Hypers. They are one
 * list now, so anyone arriving here from an old link lands on it.
 */
export default function FavouritesPage() {
  redirect("/hypers");
}
