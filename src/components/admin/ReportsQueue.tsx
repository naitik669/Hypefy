"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Check, XCircle, Trash2, Ban, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

export type ReportRow = {
  id: string;
  table: "reports" | "message_reports";
  targetType: string;
  targetId: string;
  targetUsername?: string | null;
  conversationId?: string;
  /** For comment reports: the post the comment lives on, resolved server-side. */
  commentPostId?: string | null;
  /** The author of the reported thing — who a suspension would apply to. */
  authorId?: string | null;
  authorUsername?: string | null;
  authorSuspended?: boolean;
  removed?: boolean;
  reason: string | null;
  details: string | null;
  status: string;
  at: string;
  reporter: string;
};

/** Target types admin_remove_content knows how to take down. */
const REMOVABLE = new Set(["post", "shot", "show", "comment", "message"]);

function targetHref(r: ReportRow): string | null {
  switch (r.targetType) {
    case "post": return `/p/${r.targetId}`;
    case "shot": return `/shots/${r.targetId}`;
    // The route exists; this case simply was not written, so every reported
    // Show had a dead "View target".
    case "show": return `/shows/${r.targetId}`;
    // A comment is not a route. The post carrying it is, and ?comment= opens
    // the thread on that exact row.
    case "comment": return r.commentPostId ? `/p/${r.commentPostId}?comment=${r.targetId}` : null;
    case "profile": return r.targetUsername ? `/u/${r.targetUsername}` : null;
    case "message":
    case "conversation": return r.conversationId ? `/messages/${r.conversationId}` : null;
    default: return null;
  }
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * The moderation queue.
 *
 * It used to do exactly one thing: PATCH a status string straight onto the
 * report row. So a report could be marked "resolved" while the content it
 * reported was still up, nothing recorded who resolved it, and there was no
 * way to act on a repeat offender at all.
 *
 * Every action now goes through a SECURITY DEFINER RPC that checks is_admin()
 * and writes to moderation_actions, so the queue cannot do anything the
 * database has not agreed to and every decision leaves a trail.
 */
export function ReportsQueue({ rows }: { rows: ReportRow[] }) {
  const supabase = createClient();
  const toast = useToast();
  const [statusById, setStatusById] = useState<Map<string, string>>(
    () => new Map(rows.map((r) => [r.id, r.status])),
  );
  const [removedById, setRemovedById] = useState<Map<string, boolean>>(
    () => new Map(rows.map((r) => [r.id, !!r.removed])),
  );
  const [suspendedByAuthor, setSuspendedByAuthor] = useState<Map<string, boolean>>(
    () => new Map(rows.flatMap((r) => (r.authorId ? [[r.authorId, !!r.authorSuspended] as const] : []))),
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(r: ReportRow, status: "resolved" | "dismissed") {
    if (busy) return;
    setBusy(r.id);
    const prev = statusById.get(r.id) ?? r.status;
    setStatusById((m) => new Map(m).set(r.id, status));
    const { error } = await supabase.rpc("admin_resolve_report", {
      p_table: r.table,
      p_id: r.id,
      p_status: status,
    });
    setBusy(null);
    if (error) {
      setStatusById((m) => new Map(m).set(r.id, prev));
      toast(error.message, "error");
    }
  }

  async function removeContent(r: ReportRow) {
    if (busy) return;
    setBusy(r.id);
    const { error } = await supabase.rpc("admin_remove_content", {
      p_target_type: r.targetType,
      p_target_id: r.targetId,
      // The generated types mark arguments without a default as non-null;
      // both of these are nullable in SQL.
      p_reason: r.reason as string,
      p_report_id: (r.table === "reports" ? r.id : null) as string,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setRemovedById((m) => new Map(m).set(r.id, true));
    // The RPC resolves the linked report itself, so reflect that here rather
    // than leaving the row looking untouched.
    if (r.table === "reports") setStatusById((m) => new Map(m).set(r.id, "resolved"));
    toast("Content removed, author notified", "success");
  }

  async function restoreContent(r: ReportRow) {
    if (busy) return;
    setBusy(r.id);
    const { error } = await supabase.rpc("admin_restore_content", {
      p_target_type: r.targetType,
      p_target_id: r.targetId,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setRemovedById((m) => new Map(m).set(r.id, false));
    toast("Content restored", "success");
  }

  async function suspend(r: ReportRow) {
    if (!r.authorId || busy) return;
    // Indefinite by default. A reason is required, because it is what the
    // suspended person is shown.
    const reason = window.prompt(
      `Suspend @${r.authorUsername ?? "this account"}?\n\nThey'll see this reason, and can't post, comment, message or follow until it's lifted.`,
      r.reason ?? "Breaking the community guidelines",
    );
    if (reason === null) return;
    setBusy(r.id);
    const { error } = await supabase.rpc("admin_suspend_user", {
      p_user_id: r.authorId,
      p_reason: (reason.trim() || null) as string,
      // null = indefinite, which is what the RPC expects.
      p_days: null as unknown as number,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setSuspendedByAuthor((m) => new Map(m).set(r.authorId!, true));
    toast("Account suspended", "success");
  }

  async function unsuspend(r: ReportRow) {
    if (!r.authorId || busy) return;
    setBusy(r.id);
    const { error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: r.authorId });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setSuspendedByAuthor((m) => new Map(m).set(r.authorId!, false));
    toast("Suspension lifted", "success");
  }

  const open = rows.filter((r) => (statusById.get(r.id) ?? r.status) === "open");
  const closed = rows.filter((r) => (statusById.get(r.id) ?? r.status) !== "open");

  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck} title="Queue is clear" text="No reports yet. Good sign." />;
  }

  const Row = ({ r }: { r: ReportRow }) => {
    const status = statusById.get(r.id) ?? r.status;
    const href = targetHref(r);
    const isOpen = status === "open";
    const isRemoved = removedById.get(r.id) ?? false;
    const authorSuspended = r.authorId ? (suspendedByAuthor.get(r.authorId) ?? false) : false;
    const canRemove = REMOVABLE.has(r.targetType);

    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            {r.targetType}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            by @{r.reporter} · {timeAgo(r.at)}
          </span>
          <span
            className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              isOpen ? "bg-danger/15 text-danger" : "bg-elevated text-faint"
            }`}
          >
            {status}
          </span>
        </div>

        <p className="text-sm font-semibold">{r.reason ?? "No reason given"}</p>
        {r.details && <p className="text-xs leading-snug text-muted">{r.details}</p>}

        {(isRemoved || authorSuspended) && (
          <div className="flex flex-wrap gap-1.5">
            {isRemoved && (
              <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-danger">
                Content removed
              </span>
            )}
            {authorSuspended && (
              <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-danger">
                Author suspended
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {href && (
            <Link
              href={href}
              className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
            >
              View target
            </Link>
          )}
          {r.authorUsername && (
            <Link
              href={`/u/${r.authorUsername}`}
              className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
            >
              @{r.authorUsername}
            </Link>
          )}

          <div className="flex-1" />

          {canRemove &&
            (isRemoved ? (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void restoreContent(r)}
                className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <Undo2 size={13} /> Restore
              </button>
            ) : (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void removeContent(r)}
                className="flex items-center gap-1 rounded-pill bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger transition-transform active:scale-95 disabled:opacity-50"
              >
                <Trash2 size={13} /> Remove
              </button>
            ))}

          {r.authorId &&
            (authorSuspended ? (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void unsuspend(r)}
                className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <Undo2 size={13} /> Unsuspend
              </button>
            ) : (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void suspend(r)}
                className="flex items-center gap-1 rounded-pill bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger transition-transform active:scale-95 disabled:opacity-50"
              >
                <Ban size={13} /> Suspend
              </button>
            ))}

          {isOpen && (
            <>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void setStatus(r, "dismissed")}
                className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <XCircle size={13} /> Dismiss
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void setStatus(r, "resolved")}
                className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-50"
              >
                <Check size={13} /> Resolve
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-10">
      {open.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-xs font-bold uppercase tracking-widest text-faint">Open · {open.length}</p>
          {open.map((r) => <Row key={r.id} r={r} />)}
        </section>
      )}
      {closed.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-xs font-bold uppercase tracking-widest text-faint">Handled</p>
          {closed.map((r) => <Row key={r.id} r={r} />)}
        </section>
      )}
    </div>
  );
}
