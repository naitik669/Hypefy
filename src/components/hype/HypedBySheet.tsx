"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { createClient } from "@/lib/supabase/client";
import { formatCount } from "@/lib/format";
import type { HypeTarget } from "@/lib/hype-proof";

/**
 * Everyone who hyped a thing, your people first.
 *
 * One list with one divider rather than two tabs. A tab would tidy it up and
 * bury the strangers behind a decision nobody makes; in one list you pass
 * them on the way out, which is the only reason anyone ever follows one.
 *
 * Each row names the relationship the database actually knows about, so the
 * ordering is visible to the reader instead of staying an implementation
 * detail.
 */

type Row = {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  hue: number | null;
  relation: "you" | "close" | "talk" | "mutual" | "following" | "other";
  is_verified: boolean | null;
};

const PAGE = 30;

const RELATION: Record<Row["relation"], string | null> = {
  you: "you",
  close: "close friend",
  talk: "you talk",
  mutual: "mutual",
  following: "you follow",
  other: null,
};

/**
 * Plain data in, plain data out, with no React in it — which is what lets the
 * first page be fetched from an effect without writing state inside the
 * effect body.
 */
async function fetchPage(
  targetType: HypeTarget,
  targetId: string,
  offset: number,
): Promise<{ page: Row[]; failed: boolean }> {
  const { data, error } = await createClient().rpc("hyped_by", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_limit: PAGE,
    p_offset: offset,
  });
  return { page: (Array.isArray(data) ? data : []) as Row[], failed: !!error };
}

export function HypedBySheet({
  open,
  onClose,
  targetType,
  targetId,
  total,
  friendCount,
}: {
  open: boolean;
  onClose: () => void;
  targetType: HypeTarget;
  targetId: string;
  /** The card's own count. Exact, and this is where a creator's real number lives. */
  total: number;
  friendCount: number;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Hyped by" size="tall">
      <p className="px-1 pb-2 text-xs text-muted">
        {formatCount(total)} {total === 1 ? "person" : "people"}
        {friendCount > 0 && ` · ${formatCount(friendCount)} you follow`}
      </p>
      {/* Mounted only while the sheet is up, and keyed by the target, so it
          starts empty by construction rather than being emptied on the way in
          — a reset costs a render and a flash of the last post's list. */}
      {open && (
        <HypedByList
          key={`${targetType}:${targetId}`}
          targetType={targetType}
          targetId={targetId}
          onLeave={onClose}
        />
      )}
    </BottomSheet>
  );
}

function HypedByList({
  targetType,
  targetId,
  onLeave,
}: {
  targetType: HypeTarget;
  targetId: string;
  onLeave: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // Guards a second page firing from the sentinel while the first is still in
  // flight; state alone lags a frame behind and double-loads. It starts true
  // because the first page is already on its way.
  const busy = useRef(true);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const take = useCallback((page: Row[], didFail: boolean, offset: number) => {
    if (didFail) setFailed(true);
    else {
      setFailed(false);
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
      if (page.length < PAGE) setDone(true);
    }
    setLoading(false);
    busy.current = false;
  }, []);

  // The first page. Nothing is written until the request comes back.
  useEffect(() => {
    let alive = true;
    void fetchPage(targetType, targetId, 0).then(({ page, failed: bad }) => {
      if (alive) take(page, bad, 0);
    });
    return () => {
      alive = false;
    };
  }, [targetType, targetId, take]);

  // More arrives by scrolling rather than by a button: the strangers are the
  // point of the lower half, so nothing should stand between you and them.
  useEffect(() => {
    const el = sentinel.current;
    if (done || !el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || busy.current) return;
        busy.current = true;
        setLoading(true);
        void fetchPage(targetType, targetId, rows.length).then(({ page, failed: bad }) => {
          if (alive) take(page, bad, rows.length);
        });
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [done, rows.length, targetType, targetId, take]);

  // Where your people end and everyone else begins.
  const firstStranger = rows.findIndex((r) => r.relation === "other");

  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <div key={r.id}>
          {i === firstStranger && i > 0 && (
            <>
              <div className="mx-1 my-2 h-px bg-border" />
              <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-faint">
                Everyone else
              </p>
            </>
          )}
          <Link
            href={r.username ? `/u/${r.username}` : "#"}
            onClick={onLeave}
            className="flex items-center gap-3 rounded-xl px-1 py-2 transition-colors active:bg-elevated"
          >
            <Avatar
              name={r.name ?? r.username ?? "?"}
              hue={r.hue ?? 200}
              size={38}
              src={r.avatar_url ?? undefined}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                <span className="truncate">{r.name ?? r.username}</span>
                {r.is_verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" userId={r.id} />}
              </span>
              <span className="block truncate text-xs text-muted">
                @{r.username}
                {RELATION[r.relation] && ` · ${RELATION[r.relation]}`}
              </span>
            </span>
          </Link>
        </div>
      ))}

      {loading && (
        <div className="flex justify-center py-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      )}
      {failed && !loading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">Couldn&rsquo;t load this list.</p>
      )}
      {!done && !loading && <div ref={sentinel} className="h-px" />}
    </div>
  );
}
