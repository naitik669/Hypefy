"use client";

import { useEffect } from "react";
import { Keyboard } from "@capacitor/keyboard";
import { isNative } from "@/lib/native";

/**
 * Keeps a fixed-to-bottom composer visible when the keyboard opens.
 *
 * `resize: native` in capacitor.config already shortens the window, so the
 * composer is not buried — but a chat that was scrolled to the newest message
 * no longer is, because the viewport just got shorter while the scroll offset
 * stayed put. That reads as the conversation jumping away the moment you tap
 * to reply.
 *
 * Scrolling happens after a frame: the resize lands asynchronously, and
 * measuring in the same tick gives the pre-resize height.
 *
 * Inert on the web, where the visual viewport already handles this.
 */
export function useKeyboardInset(scrollToBottom: () => void) {
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    void Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() => scrollToBottom());
    }).then((handle) => { remove = () => void handle.remove(); });

    return () => remove?.();
    // Callers pass an inline closure, so depending on it would resubscribe on
    // every render. The behaviour never changes, only the captured refs it
    // touches, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
