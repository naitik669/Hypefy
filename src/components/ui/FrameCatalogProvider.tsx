"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FrameCatalog } from "@/lib/frames";

/**
 * The frame catalogue, read once per page rather than once per avatar.
 *
 * A feed row, every comment, every name in the inbox draws an avatar, and
 * each of those needs to know what the wearer's frame looks like. Asking
 * the database at each one would be a query per row; asking from the
 * browser after mount would mean every avatar in the app pops its frame on
 * a beat late. So the layout fetches the list server-side — it is small,
 * public and changes only when an admin uploads something — and hands it
 * down from here.
 */
const FrameCatalogContext = createContext<FrameCatalog>({});

export function FrameCatalogProvider({
  frames,
  children,
}: {
  frames: FrameCatalog;
  children: ReactNode;
}) {
  return <FrameCatalogContext.Provider value={frames}>{children}</FrameCatalogContext.Provider>;
}

/**
 * Empty outside the provider rather than throwing.
 *
 * Avatars render in places that are not inside the app shell — an error
 * screen, a test harness, a preview — and a missing frame is a cosmetic
 * loss, not a reason to take the page down with it.
 */
export function useFrameCatalog(): FrameCatalog {
  return useContext(FrameCatalogContext);
}
