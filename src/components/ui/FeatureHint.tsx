"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * A one-time, in-context explanation of a feature.
 *
 * Hype, Hyper, Shot, Show and Note are all invented words, and nothing in the
 * app has ever defined them — after onboarding you are dropped on Home and
 * left to infer. The usage data shows where that lands: hypes are used 168
 * times, while Shows have 6 views, Notes 2 and Hypers 1. People work out the
 * button they can see and never find the rest.
 *
 * In-context rather than a product tour, matching the one explainer the app
 * already had (the Requests tab in MessagesInbox), which is good and works.
 * Nothing has to be dismissed before the app is usable.
 *
 * Dismissed for good, not for a day — an explanation you have read is noise
 * the second time.
 */
export function FeatureHint({
  id,
  title,
  text,
  icon,
}: {
  /** Storage key suffix. Changing it re-shows the hint to everyone. */
  id: string;
  title: string;
  text: string;
  icon?: React.ReactNode;
}) {
  const key = `hypefy_hint_${id}`;
  // Starts hidden and is switched on in an effect: rendering it during SSR
  // would flash a hint the reader has already dismissed.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) !== "1") setShow(true);
    } catch {
      /* private mode — skip rather than nag every render */
    }
  }, [key]);

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* nothing to do */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
      {icon ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Got it"
        className="-mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground"
      >
        <X size={15} />
      </button>
    </div>
  );
}
