"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const REF_KEY = "hypefy_ref";

/**
 * Invisible referral plumbing, mounted once in the root layout.
 * 1. Capture: any page arrived at with ?ref=<username> stores the referrer.
 * 2. Claim: once a session exists, claim_referral credits the inviter
 *    (server-side guards: no self-referral, fresh accounts only, one-shot).
 * The stored ref is cleared after any claim attempt so it never re-fires.
 */
export function ReferralTracker() {
  useEffect(() => {
    let ref: string | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      if (fromUrl && /^[a-z0-9_.]{2,30}$/i.test(fromUrl)) {
        localStorage.setItem(REF_KEY, fromUrl.toLowerCase());
      }
      ref = localStorage.getItem(REF_KEY);
    } catch {
      return; // storage unavailable — skip quietly
    }
    if (!ref) return;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return; // not signed in yet — claim on a later visit
      await supabase.rpc("claim_referral", { p_ref_username: ref! });
      // One attempt per stored ref — server enforces correctness, we just
      // stop retrying (covers success, self-ref, expired, already-referred).
      try { localStorage.removeItem(REF_KEY); } catch {}
    });
  }, []);

  return null;
}
