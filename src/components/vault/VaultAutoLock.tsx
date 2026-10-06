"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearVaultOpen, inMessages, vaultMarkedOpen } from "@/lib/chat-vault";

const VAULT_PATH = "/messages/vault";

/** How long the app can be out of sight before coming back means the PIN again. */
export const AWAY_MS = 20_000;

/** While unlocked and still in Messages, the server's 15 minutes are renewed this often. */
const KEEP_OPEN_MS = 5 * 60 * 1000;

/**
 * Locks the chats again when you walk away from them.
 *
 * Unlocked chats stay unlocked while you are in Messages. Going anywhere
 * else in the app locks them, and so does coming back after the app has been
 * out of sight for more than a few seconds. The lock itself is on the server (0115); this is what tells
 * it. If this never ran (a crash, a closed tab) the server's own expiry does
 * the same job fifteen minutes later.
 *
 * Mounted once, in the app's layout. It does nothing at all unless something
 * was unlocked in this tab.
 */
export function VaultAutoLock() {
  const pathname = usePathname();
  const router = useRouter();
  /** Where this tab was a moment ago. */
  const cameFrom = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function lock() {
      if (!vaultMarkedOpen()) return;
      clearVaultOpen();
      await supabase.rpc("lock_vault");
      // Still on a page that was drawn unlocked: have the server draw the door.
      if (inMessages(window.location.pathname)) router.refresh();
    }

    // Out of Messages altogether, or out of the Vault back to the inbox: the
    // Vault is the one list that locks behind you even inside Messages.
    const from = cameFrom.current;
    cameFrom.current = pathname;
    if (!inMessages(pathname) || (from === VAULT_PATH && pathname === "/messages")) void lock();

    // Away for longer than a moment. Not the instant the page is hidden:
    // choosing a photo to send opens the system picker, which hides the page
    // too, and would lock the chat you were sending it in.
    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > AWAY_MS) void lock();
      hiddenAt = null;
    }
    document.addEventListener("visibilitychange", onVisibility);

    const keep = setInterval(() => {
      if (vaultMarkedOpen() && inMessages(window.location.pathname)) void supabase.rpc("touch_vault");
    }, KEEP_OPEN_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(keep);
    };
  }, [pathname, router]);

  return null;
}
