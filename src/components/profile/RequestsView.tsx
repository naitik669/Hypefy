"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { formatCount } from "@/lib/format";

export type RequestRow = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  at: string;
};

type Tab = "incoming" | "sent";

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Follow requests, both directions.
 *
 * Incoming ones existed only as notification rows, so clearing the
 * notification stranded the request permanently — the row stayed in
 * follow_requests with nothing anywhere able to act on it. Sent ones could not
 * be seen or cancelled at all; the table was read in exactly one place, to
 * label one button on one profile.
 */
export function RequestsView({
  incoming,
  sent,
}: {
  incoming: RequestRow[];
  sent: RequestRow[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? "incoming" : "sent");
  const [inRows, setInRows] = useState(incoming);
  const [sentRows, setSentRows] = useState(sent);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDeny, setConfirmDeny] = useState<RequestRow | null>(null);

  async function resolve(person: RequestRow, approve: boolean) {
    if (busy) return;
    setBusy(person.id);
    haptics.select();
    const { error } = await supabase.rpc(
      approve ? "approve_follow_request" : "deny_follow_request",
      { p_requester: person.id }
    );
    setBusy(null);
    setConfirmDeny(null);
    if (error) {
      toast(approve ? "Couldn't approve that." : "Couldn't decline that.", "error");
      return;
    }
    setInRows((prev) => prev.filter((r) => r.id !== person.id));
    // Say what happened. Approving silently looked identical to the row just
    // disappearing, which is what a failure looks like too.
    toast(approve ? `${person.name} can see your posts now` : "Request declined", "success");
    router.refresh();
  }

  async function cancel(person: RequestRow) {
    if (busy) return;
    setBusy(person.id);
    haptics.select();
    // unfollow_user deletes any pending request as well as any follow, so it
    // is the cancel path too — no second RPC needed.
    const { error } = await supabase.rpc("unfollow_user", { p_target: person.id });
    setBusy(null);
    if (error) {
      toast("Couldn't cancel that request.", "error");
      return;
    }
    setSentRows((prev) => prev.filter((r) => r.id !== person.id));
    toast("Request cancelled", "success");
    router.refresh();
  }

  const rows = tab === "incoming" ? inRows : sentRows;

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex gap-1 border-b border-border/60 chrome-bar px-4 py-2">
        {(["incoming", "sent"] as Tab[]).map((t) => {
          const count = t === "incoming" ? inRows.length : sentRows.length;
          const on = t === tab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
                on ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {t === "incoming" ? "Received" : "Sent"}
              {count > 0 && <span className="ml-1 opacity-70">{formatCount(count)}</span>}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={tab === "incoming" ? "No requests waiting" : "No requests out"}
          text={
            tab === "incoming"
              ? "When someone asks to follow your private account, they wait here."
              : "Requests you send to private accounts wait here until they answer."
          }
          variant="compact"
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/50">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={r.username ? `/u/${r.username}` : "#"}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar name={r.name} hue={r.hue} src={r.avatarUrl ?? undefined} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.username ? `@${r.username} · ` : ""}
                    {ago(r.at)}
                  </span>
                </span>
              </Link>

              {tab === "incoming" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void resolve(r, true)}
                    disabled={busy === r.id}
                    className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3.5 text-xs font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-60"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeny(r)}
                    disabled={busy === r.id}
                    aria-label={`Decline ${r.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-pill border border-border text-muted transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void cancel(r)}
                  disabled={busy === r.id}
                  className="h-9 shrink-0 rounded-pill border border-border px-3.5 text-xs font-bold text-muted transition-colors hover:text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Declining is quiet and unrecoverable from this side — they are not
          told, and the row is gone — so it asks first. Approving does not. */}
      <ConfirmDialog
        open={confirmDeny !== null}
        onClose={() => setConfirmDeny(null)}
        onConfirm={() => {
          if (confirmDeny) void resolve(confirmDeny, false);
        }}
        icon={X}
        title={`Decline ${confirmDeny?.name ?? "this request"}`}
        body="The request goes away and they aren't told. They can ask again later."
        confirmLabel="Decline"
      />
    </div>
  );
}
