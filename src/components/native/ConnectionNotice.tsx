"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WifiOff, Wifi } from "lucide-react";

/** How long "Back online" stays up. */
export const BACK_ONLINE_MS = 2200;

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/**
 * Says when the connection is gone, and when it is back.
 *
 * Without it, losing signal looked like the app breaking: a hype that did
 * not stick, a message that sat there, a feed that would not refresh, and
 * nothing to say why. A thin line at the top names the cause, stays while it
 * is true, and confirms the return for a moment so nobody has to test it.
 *
 * It only reports what the device says about itself. A connection that is
 * up but cannot reach Hypefy is a different failure, and the screens that
 * meet it say so themselves.
 */
export function ConnectionNotice() {
  // Assume a connection on the server: there is no device to ask, and a
  // notice that flashes on every load would be worse than none.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    // Deferred: an effect that sets state straight away renders twice.
    const show = setTimeout(() => setJustBack(true), 0);
    const hide = setTimeout(() => setJustBack(false), BACK_ONLINE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [online]);

  if (online && !justBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-connection={online ? "back" : "offline"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[300] flex justify-center px-4 pt-[calc(0.5rem+var(--sat))]"
    >
      <span
        className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-lg ${
          online
            ? "border-accent/40 bg-elevated text-accent"
            : "border-border bg-elevated text-foreground"
        }`}
      >
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {online ? "Back online" : "No connection"}
      </span>
    </div>
  );
}
