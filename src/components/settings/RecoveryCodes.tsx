"use client";

import { useState } from "react";
import { Copy, Check, Download, RefreshCw, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * The eight codes that get you back in when the phone is gone.
 *
 * Shown once. `generate_mfa_recovery_codes` (0063) is the only call in the
 * system that ever returns plaintext — everything else sees bcrypt hashes —
 * so if they are not written down here, they do not exist anywhere.
 */
export function RecoveryCodes({
  remaining,
  onRemainingChange,
  /** Blocks navigation away until the codes have been acknowledged. */
  onAcknowledged,
}: {
  remaining: number | null;
  onRemainingChange: (n: number) => void;
  onAcknowledged?: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setBusy(true);
    // Eight bcrypt rounds server-side, so this is a visible wait rather than
    // something to fire optimistically.
    const { data, error } = await supabase.rpc("generate_mfa_recovery_codes");
    setBusy(false);
    if (error) {
      toast("Couldn't make new codes, try again", "error");
      return;
    }
    const list = (data ?? []) as unknown as string[];
    setCodes(list);
    setSaved(false);
    onRemainingChange(list.length);
  }

  function copy() {
    if (!codes) return;
    navigator.clipboard.writeText(codes.join("\n")).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast("Couldn't copy — write them down instead", "error"),
    );
  }

  function download() {
    if (!codes) return;
    const blob = new Blob(
      [
        "Hypefy recovery codes\n",
        "Each code works once. Keep them somewhere you can reach without your phone.\n\n",
        codes.join("\n"),
        "\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hypefy-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (codes) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/[0.06] p-4">
        <div>
          <p className="text-sm font-bold">Save these now</p>
          <p className="mt-0.5 text-xs text-muted">
            Each code works once, and this is the only time they are shown. Keep
            them somewhere you can reach <em>without</em> your phone.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-background/60 p-3 font-mono text-[13px] tracking-tight">
          {codes.map((c) => (
            <span key={c} className="select-all">
              {c}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-xs font-bold transition-colors active:bg-white/5"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={download}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-xs font-bold transition-colors active:bg-white/5"
          >
            <Download size={14} />
            Download
          </button>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-semibold">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          I&apos;ve saved these somewhere safe
        </label>

        <button
          type="button"
          disabled={!saved}
          onClick={() => {
            setCodes(null);
            onAcknowledged?.();
          }}
          className="rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface text-foreground">
          <KeyRound size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Recovery codes</p>
          <p className="mt-0.5 text-xs text-muted">
            {remaining === null
              ? "Checking…"
              : remaining === 0
                ? "None left. Without one, a lost phone means a lost account."
                : `${remaining} unused code${remaining === 1 ? "" : "s"} left.`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-bold transition-colors active:bg-white/5 disabled:opacity-50"
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        {busy
          ? "Generating…"
          : remaining === 0
            ? "Generate codes"
            : "Generate new codes"}
      </button>

      {remaining !== null && remaining > 0 && (
        <p className="text-[11px] leading-snug text-faint">
          Generating replaces the whole set — the codes you have now stop
          working.
        </p>
      )}
    </div>
  );
}
