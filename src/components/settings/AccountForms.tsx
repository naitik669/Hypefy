"use client";

import { useState } from "react";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AccountForms({ currentEmail }: { currentEmail: string }) {
  const supabase = createClient();

  // ── Email change ──
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changeEmail() {
    if (emailBusy || !newEmail.trim() || newEmail.trim() === currentEmail) return;
    setEmailBusy(true);
    setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailBusy(false);
    if (error) {
      setEmailMsg({ ok: false, text: error.message });
      return;
    }
    setEmailMsg({ ok: true, text: "Check both inboxes, confirm the change from the links we sent." });
    setNewEmail("");
  }

  // ── Password change ──
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePassword() {
    if (pwBusy || !currentPw || newPw.length < 8) return;
    setPwBusy(true);
    setPwMsg(null);

    // Re-auth with the current password first
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPw,
    });
    if (authErr) {
      setPwBusy(false);
      setPwMsg({ ok: false, text: "Current password is incorrect." });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (error) {
      setPwMsg({ ok: false, text: error.message });
      return;
    }
    setPwMsg({ ok: true, text: "Password updated." });
    setCurrentPw("");
    setNewPw("");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Email */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Email</p>
        <p className="mt-1 text-sm">{currentEmail}</p>

        <div className="mt-3 flex flex-col gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className="input"
          />
          <button
            type="button"
            onClick={changeEmail}
            disabled={emailBusy || !newEmail.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink disabled:opacity-50"
          >
            {emailBusy ? <Loader2 size={15} className="animate-spin" /> : "Change email"}
          </button>
          {emailMsg && (
            <p className={`flex items-start gap-1.5 text-xs ${emailMsg.ok ? "text-accent" : "text-danger"}`}>
              {emailMsg.ok && <Check size={13} className="mt-px shrink-0" />}
              {emailMsg.text}
            </p>
          )}
        </div>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Password</p>

        <div className="mt-3 flex flex-col gap-2">
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className="input"
          />
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoComplete="new-password"
              className="input pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="button"
            onClick={changePassword}
            disabled={pwBusy || !currentPw || newPw.length < 8}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink disabled:opacity-50"
          >
            {pwBusy ? <Loader2 size={15} className="animate-spin" /> : "Change password"}
          </button>
          {pwMsg && (
            <p className={`flex items-start gap-1.5 text-xs ${pwMsg.ok ? "text-accent" : "text-danger"}`}>
              {pwMsg.ok && <Check size={13} className="mt-px shrink-0" />}
              {pwMsg.text}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
