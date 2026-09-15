import { redirect } from "next/navigation";

/** The Shop is the Marketplace now; old links still land. */
export default function ShopRedirect() {
  redirect("/marketplace");
}
