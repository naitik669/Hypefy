"use client";

import type { ReactNode } from "react";
import { useFeature, type FeatureId } from "@/lib/use-feature";

/**
 * Shows its children only where the named feature is available.
 *
 * This was `WebOnly`, and the rename is the point. "Web only" is a statement
 * about a platform; what the one call site actually meant was "do not invite
 * somebody to buy where buying is impossible" — a rule that belongs to the
 * purchase feature and that holds for reasons the component should not have
 * to know. A component named after the platform has to be revisited by hand
 * every time the set of platforms changes; this one does not.
 *
 * It renders nothing until the page knows where it is running, so a client
 * where the feature is unavailable never shows the thing for a moment and
 * then takes it back — the server snapshot is the restrictive one.
 */
export function FeatureOnly({ id, children }: { id: FeatureId; children?: ReactNode }) {
  return useFeature(id).state === "unavailable" ? null : <>{children}</>;
}
