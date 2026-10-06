"use client";

import { useEffect, useState } from "react";
import { MessageSquareLock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { useStepUp } from "@/components/auth/StepUpDialog";
import { ChatPinSetup } from "@/components/vault/ChatPinSetup";

/**
 * Chat lock, in Settings: the PIN, and the one place the app explains how
 * locked chats and the Vault are reached. The Vault has no button anywhere,
 * so if it is not written down here it is written down nowhere.
 *
 * Choosing a first PIN needs nothing. Changing one needs proof of who you
 * are (the database refuses otherwise, see 0115): that is also what makes
 * this the "Forgot PIN" for someone who is not standing at the door.
 */
export function ChatLockSettings() {
  const supabase = createClient();
  const toast = useToast();
  const { requireStepUp, stepUpDialog } = useStepUp();
  const [has, setHas] = useState<boolean | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.rpc("has_lock_pin", { p_scope: "chat" }).then(({ data }) => {
      if (live) setHas(data === true);
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  async function start() {
    // maxAge 0: a PIN change wants proof from now.
    if (has && !(await requireStepUp({ maxAge: 0 }))) return;
    setChoosing(true);
  }

  return (
    <section>
      {stepUpDialog}
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">Chat lock</p>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-accent">
            <MessageSquareLock size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {has === null ? "Chat lock" : has ? "PIN set for locked chats" : "No chat PIN yet"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Hold a chat in Messages and choose Lock chat. Locked chats move behind a row at the top of
              Messages and open with this PIN.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              A locked chat can also be hidden in your Vault, which has no button: pull Messages down and
              keep holding, or type your PIN into Messages search and press Enter.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              This keeps chats out of sight on your device. It does not encrypt them.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={has === null}
          className="mt-4 h-10 w-full rounded-xl border border-border bg-elevated text-sm font-semibold transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {has ? "Change PIN" : "Set a PIN"}
        </button>
      </div>

      {choosing && (
        <ChatPinSetup
          reason={has ? "change" : "first"}
          onClose={() => setChoosing(false)}
          onDone={() => {
            setChoosing(false);
            setHas(true);
            toast(has ? "PIN changed" : "PIN set", "success");
          }}
        />
      )}
    </section>
  );
}
