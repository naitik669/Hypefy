"use client";

import { useSyncExternalStore } from "react";
import { Bug } from "lucide-react";
import { LOADED_BUILD } from "@/lib/app-version";
import { isNative } from "@/lib/native";

export const SUPPORT_EMAIL = "support@hypefy.chat";
const noop = () => () => {};

/**
 * The email a problem report opens: a subject, room to write, and the three
 * facts support always has to ask for (which build, app or web, what
 * device), already filled in below a line.
 */
export function problemMailto(build: string, native: boolean, userAgent: string): string {
  const body = [
    "What happened:",
    "",
    "",
    "What you expected:",
    "",
    "",
    "----",
    "Please leave this in. It tells us which version you have.",
    `Build: ${build}`,
    `Where: ${native ? "Android app" : "Web"}`,
    `Device: ${userAgent}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Problem with Hypefy")}&body=${encodeURIComponent(body)}`;
}

/**
 * "Report a problem", for when something in the app itself is broken.
 *
 * It opens an email rather than a form of our own: a report nobody reads is
 * worse than no button, and support already reads this inbox. Reporting a
 * person or a post is a different thing with its own menu, and the Help page
 * says so right underneath.
 */
export function ReportProblem() {
  const native = useSyncExternalStore(noop, isNative, () => false);
  const userAgent = useSyncExternalStore(noop, () => navigator.userAgent, () => "");

  return (
    <a
      href={problemMailto(LOADED_BUILD, native, userAgent)}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-4 transition-colors hover:bg-elevated"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-foreground">
        <Bug size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Report a problem</p>
        <p className="truncate text-xs text-muted">Something broken or not working right</p>
      </div>
    </a>
  );
}
