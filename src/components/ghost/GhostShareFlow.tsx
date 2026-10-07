"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronLeft, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { GhostShareIcon } from "@/components/ui/GhostShareIcon";
import { useToast } from "@/components/ui/ToastProvider";
import { shieldProps, useOverlayShield } from "@/lib/overlay-shield";
import { haptics } from "@/lib/haptics";
import { isNative } from "@/lib/native";
import { timeAgoShort } from "@/lib/time";
import {
  feedName,
  ghostError,
  ghostLeft,
  limitHeadline,
  needsFullExplanation,
  noteExplained,
  resetDay,
  type GhostKind,
  type GhostStatus,
  type GhostTarget,
} from "@/lib/ghost-share";

const noop = () => () => {};

/** "3h ago"; and for the first minute, "just now" rather than "now ago". */
function placedWhen(at: string): string {
  const t = timeAgoShort(at);
  return t === "now" ? "just now" : `${t} ago`;
}

type Sent = { id: string; name: string; hue: number; avatarUrl: string | null; at: string };

/**
 * Ghost Share: choose one person, confirm, placed.
 *
 * Opened from the share sheet. One screen at a time, over everything:
 *
 *   pick     the people you follow who follow you back; choose one
 *   confirm  what will happen, in plain words, before anything is spent
 *   sent     what you have placed lately, and that is all it says
 *   limit    none left this week, and when they come back
 *
 * Nothing here moves: no slide, no bounce. Choosing someone ticks their
 * mark; placing it changes the count and gives a light tap.
 *
 * The person chosen is never told, and the sender is never told whether it
 * was seen. Both are the database's rules (0119); this only shows what it
 * is given.
 */
export function GhostShareFlow({
  kind,
  contentId,
  status,
  onClose,
  onPlaced,
}: {
  kind: GhostKind;
  contentId: string;
  status: GhostStatus;
  onClose: () => void;
  /** One was placed: the caller's count is now one lower. */
  onPlaced: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);
  const left = ghostLeft(status);

  const [step, setStep] = useState<"pick" | "confirm" | "sent" | "limit">(left > 0 ? "pick" : "limit");
  const [people, setPeople] = useState<GhostTarget[] | null>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<GhostTarget | null>(null);
  const [placing, setPlacing] = useState(false);
  const [sent, setSent] = useState<Sent[] | null>(null);
  // Decided once, when the flow opens: it should not shorten itself between
  // choosing someone and confirming.
  const [explain] = useState(needsFullExplanation);

  function back() {
    if (step === "confirm" || step === "sent") return setStep(left > 0 ? "pick" : "limit");
    onClose();
  }
  useOverlayShield(true, back);

  useEffect(() => {
    if (left <= 0) return;
    let live = true;
    void supabase.rpc("ghost_share_targets", { p_kind: kind, p_content_id: contentId }).then(({ data }) => {
      if (!live) return;
      setPeople(
        (data ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? p.username ?? "User",
          username: p.username,
          hue: p.avatar_hue ?? 280,
          avatarUrl: p.avatar_url,
          alreadyThisWeek: p.already_this_week,
        })),
      );
    });
    return () => {
      live = false;
    };
  }, [supabase, kind, contentId, left]);

  function openSent() {
    setStep("sent");
    if (sent) return;
    void supabase.rpc("my_ghost_shares").then(({ data }) => {
      setSent(
        (data ?? []).map((g) => ({
          id: g.id,
          name: g.recipient_name ?? g.recipient_username ?? "User",
          hue: g.recipient_hue ?? 280,
          avatarUrl: g.recipient_avatar,
          at: g.created_at,
        })),
      );
    });
  }

  async function place() {
    if (!chosen || placing) return;
    setPlacing(true);
    const { error } = await supabase.rpc("send_ghost_share", {
      p_kind: kind,
      p_content_id: contentId,
      p_recipient: chosen.id,
    });
    setPlacing(false);
    if (error) {
      // Nothing was spent. Say why, in the database's own words where it has them.
      toast(ghostError(error.message), "error");
      return;
    }
    noteExplained();
    haptics.success();
    toast(`Placed in ${chosen.name}'s feed`, "success");
    onPlaced();
    onClose();
  }

  const q = query.trim().toLowerCase();
  const shown = (people ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.username ?? "").toLowerCase().includes(q),
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      {...shieldProps}
      role="dialog"
      aria-modal="true"
      aria-label="Ghost Share"
      data-ghost-step={step}
      className="fixed inset-0 z-[240] mx-auto flex max-w-[480px] flex-col bg-background"
    >
      <header className="flex h-[calc(3.5rem+var(--sat))] items-center gap-1 border-b border-border/60 px-2 pt-[var(--sat)]">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex flex-1 items-center gap-2 px-1 text-[17px] font-extrabold tracking-tight">
          <GhostShareIcon size={18} className="text-accent" />
          {step === "sent" ? "Ghost Shares" : "Ghost Share"}
        </h1>
        {step === "pick" && (
          <button type="button" onClick={openSent} className="px-3 text-xs font-bold text-muted">
            Sent
          </button>
        )}
        {step !== "limit" && (
          <span data-ghost-left className="mr-2 rounded-lg border border-accent/30 px-2 py-0.5 text-[11px] font-bold text-accent">
            {left} left this week
          </span>
        )}
      </header>

      {step === "pick" && (
        <>
          <div className="px-4 pt-3">
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5">
              <Search size={17} className="shrink-0 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people you follow back"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              />
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pt-2">
            {people === null ? (
              <div className="flex justify-center py-12">
                <Loader2 size={22} className="animate-spin text-muted" />
              </div>
            ) : people.length === 0 ? (
              <p className="px-8 py-14 text-center text-sm text-muted">
                Nobody to place this for yet. Ghost Share works with people you follow who follow you back.
              </p>
            ) : shown.length === 0 ? (
              <p className="px-8 py-14 text-center text-sm text-faint">Nobody by that name.</p>
            ) : (
              shown.map((p) => {
                const on = chosen?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={p.alreadyThisWeek}
                    onClick={() => {
                      haptics.select();
                      setChosen(on ? null : p);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-white/5 disabled:opacity-40"
                  >
                    <Avatar name={p.name} hue={p.hue} size={44} src={p.avatarUrl ?? undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {p.alreadyThisWeek ? "Already this week" : p.username ? `@${p.username}` : ""}
                      </span>
                    </span>
                    {!p.alreadyThisWeek && (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          on ? "border-accent bg-accent text-accent-ink" : "border-border"
                        }`}
                      >
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="px-4 pb-[max(1rem,var(--sab))] pt-3">
            <button
              type="button"
              disabled={!chosen}
              onClick={() => setStep("confirm")}
              className="h-12 w-full rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
            >
              {chosen ? `Place in ${chosen.name}'s feed` : "Choose one person"}
            </button>
          </div>
        </>
      )}

      {step === "confirm" && chosen && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <Avatar name={chosen.name} hue={chosen.hue} size={72} src={chosen.avatarUrl ?? undefined} />
            <p className="mt-5 text-lg font-extrabold">Place this in {chosen.name}&rsquo;s feed?</p>
            {explain ? (
              <>
                <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-muted">
                  It will appear near the top the next time they open {feedName(kind)}. They won&rsquo;t be told it
                  was you, or that anyone placed it.
                </p>
                <p className="mt-3 max-w-[32ch] text-xs leading-relaxed text-faint">
                  {`Uses 1 of your ${left} this week. It waits up to 7 days. You’ll see “Placed”, and nothing after that.`}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">They won&rsquo;t be told. Uses 1 of your {left}.</p>
            )}
          </div>
          <div className="flex flex-col gap-2 px-4 pb-[max(1rem,var(--sab))]">
            <button
              type="button"
              onClick={place}
              disabled={placing}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {placing && <Loader2 size={16} className="animate-spin" />}
              Place it
            </button>
            <button type="button" onClick={back} disabled={placing} className="h-11 rounded-2xl text-sm font-bold text-muted">
              Cancel
            </button>
          </div>
        </>
      )}

      {step === "sent" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="no-scrollbar flex-1 overflow-y-auto px-2 pt-2">
            {sent === null ? (
              <div className="flex justify-center py-12">
                <Loader2 size={22} className="animate-spin text-muted" />
              </div>
            ) : sent.length === 0 ? (
              <p className="px-8 py-14 text-center text-sm text-muted">Nothing placed in the last 7 days.</p>
            ) : (
              sent.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-2 py-2.5">
                  <Avatar name={g.name} hue={g.hue} size={44} src={g.avatarUrl ?? undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">To {g.name}</span>
                    <span className="block text-xs text-muted">Placed · {placedWhen(g.at)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="px-8 pb-[max(1.25rem,var(--sab))] pt-3 text-center text-xs leading-relaxed text-faint">
            You&rsquo;ll only ever see &ldquo;Placed&rdquo;. Whether they watched it stays theirs.
          </p>
        </div>
      )}

      {step === "limit" && (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
            <GhostShareIcon size={26} />
          </span>
          <p className="mt-5 text-lg font-extrabold">{limitHeadline(status.allowed)}</p>
          <p className="mt-2 max-w-[30ch] text-sm leading-relaxed text-muted">
            You get {status.allowed} Ghost Shares a week. They come back on {resetDay(status.resetsAt)}.
          </p>
          {/* Premium cannot be bought inside the app, so the app does not
              mention it here: it would be an offer with no way to take it. */}
          {!native && status.allowed === 2 && (
            <>
              <p className="mt-2 text-sm text-muted">Premium members get 5.</p>
              <Link
                href="/premium"
                onClick={onClose}
                className="mt-5 flex h-12 w-full max-w-[280px] items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
              >
                See Premium
              </Link>
            </>
          )}
          <button type="button" onClick={openSent} className="mt-4 text-xs font-bold text-muted underline-offset-2 hover:underline">
            See what you&rsquo;ve placed
          </button>
          <button type="button" onClick={onClose} className="mt-3 h-11 px-6 text-sm font-bold text-muted">
            Not now
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
