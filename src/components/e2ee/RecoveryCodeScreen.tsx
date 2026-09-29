"use client";

import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";

/**
 * The one moment this code is ever visible.
 *
 * It is not stored anywhere the server can read — that is the whole point of
 * it — so if this screen is dismissed without the person keeping it, the
 * code is gone. On the day they reset their password or sign in with Google
 * on a new phone, that will be the difference between their history coming
 * back and being unreadable by anyone alive, us included.
 *
 * Hence the confirmation. Asking for four characters back is friction, and
 * it is deliberately placed exactly where the loss is permanent.
 */

/** How many characters we ask them to type back. */
const CHECK_LEN = 5;

export function RecoveryCodeScreen({
  code,
  onDone,
}: {
  code: string;
  /** Continue — they have kept it. */
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [wrong, setWrong] = useState(false);

  /** The last group, which is the one they will have read last. */
  const expected = useMemo(() => code.split("-").at(-1) ?? "", [code]);
  const matches = typed.toUpperCase().trim() === expected;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused — an insecure origin, or a WebView that has not
      // granted it. The code is on screen to be written down regardless, so
      // this is not worth an error.
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
          <ShieldCheck size={26} className="text-accent" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">Your messages are encrypted</h1>
        <p className="max-w-[320px] text-sm text-muted">
          Nobody at Hypefy can read your chats. Keep this code somewhere safe — it is the
          only way back in if you forget your password.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
          <KeyRound size={12} /> Recovery code
        </p>
        <p className="select-all break-all font-mono text-lg font-bold tracking-wide text-accent">
          {code}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-elevated text-sm font-bold transition active:scale-[0.99]"
        >
          {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99]"
        >
          I&rsquo;ve saved it
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="rc-check" className="text-sm font-semibold">
            Type the last {CHECK_LEN} characters to confirm
          </label>
          <input
            id="rc-check"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value.slice(0, CHECK_LEN));
              setWrong(false);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={"·".repeat(CHECK_LEN)}
            className="input text-center font-mono text-lg tracking-[0.3em] uppercase"
          />
          {wrong && (
            <p className="text-xs text-danger">
              That doesn&rsquo;t match. Check the code above.
            </p>
          )}
          <button
            type="button"
            onClick={() => (matches ? onDone() : setWrong(true))}
            className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
            disabled={typed.length < CHECK_LEN}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
