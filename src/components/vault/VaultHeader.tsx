"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, LockOpen, MoreHorizontal, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import type { ChatLevel } from "@/lib/chat-vault";

/** As much of a chat as a row in a picker needs. */
export type VaultChat = { id: string; name: string; hue: number; avatarUrl?: string | null; isGroup: boolean };

type Job = "add" | "hide" | "unhide" | "unlock";

/**
 * What each job is: which chats it offers, where it sends them, and the
 * words for it. Written out per list, because the same word means different
 * things in each: "add" brings chats in to wherever you are standing.
 */
function jobFor(job: Job, level: "locked" | "hidden") {
  switch (job) {
    case "add":
      return level === "locked"
        ? { to: "locked" as ChatLevel, menu: "Add chats", title: "Add to Locked chats", verb: "Lock", done: "locked" }
        : { to: "hidden" as ChatLevel, menu: "Add chats to Vault", title: "Add to Vault", verb: "Hide", done: "hidden in your Vault" };
    case "hide":
      return { to: "hidden" as ChatLevel, menu: "Hide chats", title: "Hide in Vault", verb: "Hide", done: "hidden in your Vault" };
    case "unhide":
      return { to: "locked" as ChatLevel, menu: "Unhide chats", title: "Move to Locked chats", verb: "Unhide", done: "back in Locked chats" };
    case "unlock":
      return { to: "normal" as ChatLevel, menu: "Unlock chats", title: "Unlock chats", verb: "Unlock", done: "unlocked" };
  }
}

/**
 * The header of Locked chats and of the Vault, with the three dots.
 *
 * Holding one chat at a time is how a single chat is moved. This is for
 * several at once, and for the one thing holding cannot do: bringing in
 * chats that are not in this list yet. Each job opens the same picker over a
 * different set of chats.
 */
export function VaultHeader({
  level,
  here,
  outside,
}: {
  level: "locked" | "hidden";
  /** The chats in this list. */
  here: VaultChat[];
  /** Chats that could be brought in: not locked for Locked chats; not hidden for the Vault. */
  outside: VaultChat[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const jobs: Job[] = level === "locked" ? ["add", "hide", "unlock"] : ["add", "unhide", "unlock"];
  const icon: Record<Job, typeof Plus> = { add: Plus, hide: EyeOff, unhide: Eye, unlock: LockOpen };
  const candidates = job === "add" ? outside : here;
  const spec = job ? jobFor(job, level) : null;

  function start(next: Job) {
    setMenu(false);
    setPicked(new Set());
    setJob(next);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!spec || picked.size === 0 || busy) return;
    setBusy(true);
    let moved = 0;
    let refusal: string | null = null;
    // One at a time: each is its own decision by the database, and a refusal
    // (the PIN having timed out, say) should stop the rest rather than race them.
    for (const id of picked) {
      const { error } = await supabase.rpc("set_chat_level", { p_conversation_id: id, p_level: spec.to });
      if (error) {
        refusal = error.message || "Couldn't move that chat.";
        break;
      }
      moved += 1;
    }
    setBusy(false);
    setJob(null);
    if (moved > 0) {
      toast(`${moved} ${moved === 1 ? "chat" : "chats"} ${spec.done}`, "success");
      router.refresh();
    }
    if (refusal) toast(refusal, "error");
  }

  return (
    <>
      <PageHeader
        title={level === "locked" ? "Locked chats" : "Vault"}
        showBack
        right={
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="More options"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
          >
            <MoreHorizontal size={22} />
          </button>
        }
      />

      <BottomSheet open={menu} onClose={() => setMenu(false)} title={level === "locked" ? "Locked chats" : "Vault"}>
        <div className="flex flex-col pb-3">
          {jobs.map((j) => {
            const Icon = icon[j];
            const none = (j === "add" ? outside : here).length === 0;
            return (
              <button
                key={j}
                type="button"
                onClick={() => start(j)}
                disabled={none}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 disabled:opacity-40"
              >
                <Icon size={18} className="text-muted" />
                {jobFor(j, level).menu}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={job !== null} onClose={() => !busy && setJob(null)} title={spec?.title ?? ""}>
        <div className="flex max-h-[60dvh] flex-col">
          <div className="no-scrollbar flex-1 overflow-y-auto">
            {candidates.map((c) => {
              const on = picked.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-white/5"
                >
                  {c.isGroup ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-elevated text-muted">
                      <Users size={17} />
                    </span>
                  ) : (
                    <Avatar name={c.name} hue={c.hue} size={40} src={c.avatarUrl ?? undefined} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      on ? "border-accent bg-accent text-accent-ink" : "border-border"
                    }`}
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={picked.size === 0 || busy}
            className="mb-3 mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {picked.size === 0
              ? "Choose chats"
              : `${spec?.verb} ${picked.size} ${picked.size === 1 ? "chat" : "chats"}`}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
