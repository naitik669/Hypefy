"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Danger zone: permanent account deletion. Requires typing the username
 * (or "delete" when no username) to arm the button.
 */
export function DeleteAccount({ username }: { username: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const confirmWord = username ?? "delete";

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  async function destroy() {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Deletion failed. Try again.");
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    // Clear saved multi-account entries for this user too
    try { localStorage.removeItem("hypefy_accounts"); } catch {}
    router.push("/");
  }

  return (
    <section className="rounded-2xl border border-danger/30 bg-danger/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-danger">Danger zone</p>

      {!open ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Permanently delete your account, posts, Shots, messages, and followers. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-danger/40 px-4 text-sm font-bold text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={15} /> Delete account
          </button>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted">
            Type <span className="font-bold text-foreground">{confirmWord}</span> to confirm. Everything is wiped — no recovery.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            className="input"
            autoComplete="off"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setTyped(""); setError(null); }}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={destroy}
              disabled={!armed || busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
