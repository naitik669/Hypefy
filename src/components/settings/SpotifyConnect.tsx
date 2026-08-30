"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Music, Check, AlertTriangle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

/** Outcomes the callback route can hand back in ?spotify=… */
const RESULT_COPY: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Spotify connected." },
  not_premium: {
    tone: "warn",
    text: "Connected, but this account isn't Premium — Spotify only allows full-track playback for Premium subscribers.",
  },
  cancelled: { tone: "warn", text: "Connection cancelled." },
  state_mismatch: { tone: "warn", text: "That link expired. Try connecting again." },
  failed: { tone: "warn", text: "Couldn't connect to Spotify. Try again." },
};

export function SpotifyConnect({
  connected,
  isPremium,
  displayName,
  result,
}: {
  connected: boolean;
  isPremium: boolean;
  displayName: string | null;
  result: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const banner = result ? RESULT_COPY[result] : null;

  async function disconnect() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("disconnect_spotify");
    setBusy(false);
    if (error) {
      toast("Couldn't disconnect", "error");
      return;
    }
    toast("Spotify disconnected", "success");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {banner && (
        <p
          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
            banner.tone === "ok"
              ? "border-accent/30 bg-accent/10 text-foreground"
              : "border-border bg-surface text-muted"
          }`}
        >
          {banner.text}
        </p>
      )}

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
        <Music size={18} className={connected ? "shrink-0 text-accent" : "shrink-0 text-muted"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {connected ? displayName || "Spotify account" : "Not connected"}
          </p>
          <p className="text-xs text-muted">
            {connected
              ? isPremium
                ? "Full songs will play in Hypefy."
                : "Free account — playback is unavailable."
              : "Connect to play full songs instead of 30-second previews."}
          </p>
        </div>
        {connected ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="shrink-0 rounded-pill border border-border px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Disconnect"}
          </button>
        ) : (
          // A plain link, not fetch(): this leaves the app for Spotify's
          // consent screen, and an XHR cannot follow that redirect.
          <a
            href="/api/spotify/auth"
            className="shrink-0 rounded-pill bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink"
          >
            Connect
          </a>
        )}
      </div>

      {connected && isPremium && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-faint">
          <Check size={12} className="mt-0.5 shrink-0 text-accent" />
          Songs you attach play in full for anyone else who has connected Spotify Premium.
        </p>
      )}

      {/* The constraint people will actually run into, stated once and
          plainly rather than discovered as silence on someone else's post. */}
      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-faint">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        Spotify only permits full-track playback for signed-in Premium subscribers. Listeners
        without Premium won&apos;t hear songs attached to posts.
      </p>
    </div>
  );
}
