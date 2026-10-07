"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { createClient } from "@/lib/supabase/client";
import { isAndroidApp } from "@/lib/native";

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=chat.hypefy.app";

/**
 * Is this install too old to keep running?
 *
 * Only a real, readable build number that is below a real minimum counts.
 * Anything unknown (no number, a minimum of 0, a failed lookup) lets the app
 * run: locking people out because a check could not be made would be a
 * worse failure than the one this exists to prevent.
 */
export function mustUpdate(installed: string | number | null | undefined, minimum: number | null | undefined): boolean {
  const have = Number(installed);
  const need = Number(minimum);
  if (!Number.isInteger(have) || have <= 0) return false;
  if (!Number.isInteger(need) || need <= 0) return false;
  return have < need;
}

/**
 * "Update Hypefy", over everything, when this install is older than the
 * site still supports.
 *
 * The app is a shell around the live site: the site is always current and
 * the shell is whatever was installed. See 0124 for the number it is
 * compared against, and how to raise it. On the web, and in an app that is
 * new enough, this renders nothing.
 */
export function UpdateGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!isAndroidApp()) return;
    let live = true;
    void (async () => {
      try {
        const [info, min] = await Promise.all([App.getInfo(), createClient().rpc("min_app_build")]);
        if (live && mustUpdate(info.build, min.data as number | null)) setBlocked(true);
      } catch {
        /* could not check: let the app run */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!blocked) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
      data-update-gate
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-background px-8 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl font-black">
        H<span className="text-accent">.</span>
      </span>
      <h1 id="update-title" className="mt-6 text-xl font-extrabold tracking-tight">
        Update Hypefy
      </h1>
      <p className="mt-2 max-w-[30ch] text-sm leading-relaxed text-muted">
        This version is too old to keep working. Get the latest one to carry on; your account and
        everything in it stay as they are.
      </p>
      <a
        href={PLAY_STORE_URL}
        className="mt-6 flex h-12 w-full max-w-[280px] items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
      >
        Update on Google Play
      </a>
    </div>
  );
}
