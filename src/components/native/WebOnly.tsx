"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { isNative } from "@/lib/native";

const noop = () => () => {};

/**
 * Shows its children on the web and not in the Android app.
 *
 * For the few things that only make sense where they can be acted on: an
 * invitation to buy, where the app cannot sell. It stays hidden until the
 * page knows where it is running, so the app never shows the thing for a
 * moment and then takes it back; on the web it appears a beat after the rest.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  // The server cannot know, so it answers "in the app": hidden.
  const native = useSyncExternalStore(noop, isNative, () => true);
  return native ? null : <>{children}</>;
}
