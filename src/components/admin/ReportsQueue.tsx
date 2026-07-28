"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Check, XCircle } from "lucide-react";
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
  reason: string | null;
  details: string | null;
  status: string;
  at: string;
  reporter: string;
};

function targetHref(r: ReportRow): string | null {
  switch (r.targetType) {
    case "post": return `/p/${r.targetId}`;
    case "shot": return `/shots/${r.targetId}`;
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

/** The moderation list: open reports first, one-tap resolve/dismiss. */
export function ReportsQueue({ rows }: { rows: ReportRow[] }) {
  const supabase = createClient();
  const toast = useToast();
  const [statusById, setStatusById] = useState<Map<string, string>>(
    () => new Map(rows.map((r) => [r.id, r.status])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(r: ReportRow, status: "resolved" | "dismissed") {
    if (busy) return;
    setBusy(r.id);
    const prev = statusById.get(r.id) ?? r.status;
    setStatusById((m) => new Map(m).set(r.id, status));
    const { error } = await supabase.from(r.table).update({ status }).eq("id", r.id);
    setBusy(null);
    if (error) {
      setStatusById((m) => new Map(m).set(r.id, prev));
      toast("Couldn't update report", "error");
    }
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
        <div className="flex items-center gap-2 pt-1">
          {href && (
            <Link
              href={href}
              className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
            >
              View target
            </Link>
          )}
          <div className="flex-1" />
          {isOpen && (
            <>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => setStatus(r, "dismissed")}
                className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                <XCircle size={13} /> Dismiss
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => setStatus(r, "resolved")}
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
