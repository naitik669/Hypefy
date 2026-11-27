import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth-user";
import { StudioScreen } from "./StudioScreen";

/**
 * The cutout sticker studio, as its own document.
 *
 * It lives outside the (app) shell on purpose. The cutter needs four threads
 * to cut in 3-4 s instead of ~11 s, and threads in the browser need the page
 * to be cross-origin isolated — next.config.ts sets COOP/COEP for this path
 * only. Isolation blocks any cross-origin image or script that does not opt
 * in, which would break avatars and embeds everywhere else in the app, and
 * which here only costs Google Analytics its page view.
 *
 * Isolation is decided when a document loads, so this page is always
 * entered and left with a full navigation (location.assign), never a
 * client-side route change: arriving by router.push would keep the chat's
 * unisolated document, and leaving that way would keep this one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "New sticker" };

export default async function NewStickerPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { to } = await searchParams;
  return <StudioScreen userId={user.id} conversationId={to && UUID.test(to) ? to : null} />;
}
