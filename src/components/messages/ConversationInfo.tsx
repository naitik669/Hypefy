"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Flag,
  Images,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  UserCircle,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { useToast } from "@/components/ui/ToastProvider";

export type RosterMember = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  role: string;
};

type Found = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/** The only durations set_auto_delete accepts — it rejects anything else. */
const AUTO_DELETE_OPTIONS: { label: string; value: string | null }[] = [
  { label: "Off", value: null },
  { label: "24 hours", value: "24 hours" },
  { label: "7 days", value: "7 days" },
  { label: "30 days", value: "30 days" },
];

function Row({
  icon,
  label,
  sub,
  onClick,
  href,
  danger,
  right,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  right?: React.ReactNode;
  busy?: boolean;
}) {
  const body = (
    <>
      <span className={`shrink-0 ${danger ? "text-danger" : "text-muted"}`}>
        {busy ? <Loader2 size={20} className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-semibold ${danger ? "text-danger" : ""}`}>
          {label}
        </span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      {right}
    </>
  );
  const cls =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04]";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${cls} disabled:opacity-60`}>
      {body}
    </button>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      {title && (
        <p className="px-4 pb-1.5 text-[11px] font-bold tracking-widest text-faint uppercase">
          {title}
        </p>
      )}
      <div className="divide-y divide-border/50 border-y border-border/50">{children}</div>
    </section>
  );
}

/**
 * Everything about one conversation, on a real route.
 *
 * Replaces GroupInfoSheet and gives DMs the screen they never had. It is also
 * where migration 0032's settings finally surface — vanish mode, disappearing
 * messages and screenshot alerts all had complete RPCs and no way to reach
 * them, while the cron that acts on auto_delete_after ran hourly regardless.
 */
export function ConversationInfo({
  conversationId,
  currentUserId,
  isGroup,
  title,
  avatarUrl,
  peer,
  members,
  myRole,
  muted,
  vanishMode,
  autoDeleteAfter,
  screenshotAlert,
  mediaCount,
}: {
  conversationId: string;
  currentUserId: string;
  isGroup: boolean;
  title: string;
  avatarUrl: string | null;
  peer: { id: string; username: string | null; hue: number } | null;
  members: RosterMember[];
  myRole: string;
  muted: boolean;
  vanishMode: boolean;
  autoDeleteAfter: string | null;
  screenshotAlert: boolean;
  mediaCount: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const showToast = useToast();
  const isAdmin = myRole === "admin";

  const [name, setName] = useState(title);
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [vanish, setVanish] = useState(vanishMode);
  const [shot, setShot] = useState(screenshotAlert);
  const [autoDelete, setAutoDelete] = useState<string | null>(
    // Postgres hands back "24:00:00" / "7 days"; match it to a known option.
    AUTO_DELETE_OPTIONS.find((o) => o.value && autoDeleteAfter?.includes(o.value.split(" ")[0]))
      ?.value ?? null
  );

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmAutoDelete, setConfirmAutoDelete] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RosterMember | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  // Add-member search, groups only.
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const memberIds = new Set(members.map((m) => m.id));

  useEffect(() => {
    if (!adding) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      // Scoped to people you actually know, matching ForwardSheet — adding a
      // stranger to a private group by browsing a global directory is the
      // wrong default.
      const [followingRes, followerRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", currentUserId).limit(200),
        supabase.from("follows").select("follower_id").eq("following_id", currentUserId).limit(200),
      ]);
      if (!active) return;
      const known = new Set<string>();
      (followingRes.data ?? []).forEach((r: { following_id: string }) => known.add(r.following_id));
      (followerRes.data ?? []).forEach((r: { follower_id: string }) => known.add(r.follower_id));
      known.delete(currentUserId);
      if (known.size === 0) {
        setResults([]);
        setSearching(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", [...known])
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(15);
      if (!active) return;
      setResults(
        (data ?? [])
          .filter((p: { id: string }) => !memberIds.has(p.id))
          .map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: (p.display_name as string) ?? (p.username as string) ?? "User",
            username: (p.username as string) ?? null,
            hue: (p.avatar_hue as number) ?? 280,
            avatarUrl: (p.avatar_url as string) ?? null,
          }))
      );
      setSearching(false);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, adding]);

  /** Every write here says something. All four of these used to fail silently. */
  async function run(key: string, fn: () => Promise<{ error: unknown }>, ok: string, fail: string) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      showToast((error as { message?: string })?.message ?? fail);
      return false;
    }
    showToast(ok);
    router.refresh();
    return true;
  }

  async function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    // .select() because this is an RLS-scoped update: a policy mismatch
    // returns zero rows and no error, which reads as success.
    const { data, error } = await supabase
      .from("conversation_members")
      .update({ muted_at: next ? new Date().toISOString() : null })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId)
      .select("conversation_id");
    if (error || !data || data.length === 0) {
      setIsMuted(!next);
      showToast("Couldn't update notifications for this chat.");
      return;
    }
    showToast(next ? "Muted" : "Unmuted");
  }

  async function saveName() {
    const next = name.trim();
    if (!next || next === title) return;
    setSavingName(true);
    const { error } = await supabase.rpc("update_conversation", {
      p_conversation_id: conversationId,
      p_title: next,
      p_avatar_url: undefined,
    });
    setSavingName(false);
    if (error) {
      showToast(error.message ?? "Couldn't rename this group.");
      return;
    }
    showToast("Group renamed");
    router.refresh();
  }

  async function chooseAutoDelete(value: string | null) {
    const prev = autoDelete;
    setAutoDelete(value);
    const okd = await run(
      "autodelete",
      () =>
        // null is the documented "off" value for p_after, but the generated
        // types declare it as a plain string, so the cast is about the codegen
        // rather than about the RPC.
        supabase.rpc("set_auto_delete", {
          p_conversation_id: conversationId,
          p_after: value,
        } as unknown as { p_conversation_id: string; p_after: string }) as unknown as Promise<{
          error: unknown;
        }>,
      value ? `Messages delete after ${value}` : "Auto-delete off",
      "Couldn't change auto-delete."
    );
    if (!okd) setAutoDelete(prev);
  }

  return (
    <>
      <PageHeader title={isGroup ? "Group info" : "Chat info"} showBack />

      {/* Identity */}
      <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-2 text-center">
        <Avatar name={title} hue={peer?.hue ?? 280} src={avatarUrl ?? undefined} size={88} />
        <h2 className="mt-1 text-lg font-extrabold">{title}</h2>
        {!isGroup && peer?.username && (
          <p className="text-sm text-muted">@{peer.username}</p>
        )}
        {isGroup && (
          <p className="text-sm text-muted">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        )}
      </div>

      <Section>
        {!isGroup && peer?.username && (
          <Row
            icon={<UserCircle size={20} />}
            label="View profile"
            href={`/u/${peer.username}`}
            right={<ChevronRight size={16} className="text-faint" />}
          />
        )}
        <Row
          icon={<Images size={20} />}
          label="Media and files"
          sub={mediaCount > 0 ? `${mediaCount} shared` : "Nothing shared yet"}
          href={`/messages/${conversationId}/media`}
          right={<ChevronRight size={16} className="text-faint" />}
        />
        <Row
          icon={isMuted ? <BellOff size={20} /> : <Bell size={20} />}
          label={isMuted ? "Unmute notifications" : "Mute notifications"}
          sub={isMuted ? "You get no pings from this chat" : undefined}
          onClick={toggleMute}
        />
      </Section>

      {/* Migration 0032, finally reachable. */}
      <Section title="Privacy">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Timer size={20} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Disappearing messages</p>
              <p className="text-xs text-muted">
                Deletes for everyone, and applies to messages you have already
                sent.
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 pl-8">
            {AUTO_DELETE_OPTIONS.map((o) => {
              const on = autoDelete === o.value;
              return (
                <button
                  key={o.label}
                  type="button"
                  disabled={busy === "autodelete"}
                  // Turning it ON is destructive to history that already
                  // exists, not just to messages sent from now on — the cron
                  // sweeps anything older than the window on its next hourly
                  // run. Measured against real data: one 30-day window in this
                  // app would remove 74 existing messages immediately. Off
                  // needs no confirmation; on does.
                  onClick={() =>
                    o.value ? setConfirmAutoDelete(o.value) : chooseAutoDelete(null)
                  }
                  className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    on
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <Row
          icon={<Trash2 size={20} />}
          label="Vanish mode"
          sub={vanish ? "New messages disappear once seen" : "Off"}
          busy={busy === "vanish"}
          onClick={async () => {
            const next = !vanish;
            setVanish(next);
            const okd = await run(
              "vanish",
              () =>
                supabase.rpc("toggle_vanish_mode", {
                  p_conversation_id: conversationId,
                }) as unknown as Promise<{ error: unknown }>,
              next ? "Vanish mode on" : "Vanish mode off",
              "Couldn't change vanish mode."
            );
            if (!okd) setVanish(!next);
          }}
          right={
            vanish ? <Check size={16} className="text-accent" /> : undefined
          }
        />
        <Row
          icon={<ShieldCheck size={20} />}
          label="Screenshot alerts"
          sub={shot ? "Everyone is told when a screenshot is taken" : "Off"}
          busy={busy === "shot"}
          onClick={async () => {
            const next = !shot;
            setShot(next);
            const okd = await run(
              "shot",
              () =>
                supabase.rpc("toggle_screenshot_alert", {
                  p_conversation_id: conversationId,
                }) as unknown as Promise<{ error: unknown }>,
              next ? "Screenshot alerts on" : "Screenshot alerts off",
              "Couldn't change screenshot alerts."
            );
            if (!okd) setShot(!next);
          }}
          right={shot ? <Check size={16} className="text-accent" /> : undefined}
        />
      </Section>

      {/* Group management */}
      {isGroup && (
        <>
          <Section title="Group name">
            <div className="flex items-center gap-2 px-4 py-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                disabled={!isAdmin}
                placeholder="Group name"
                className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-sm outline-none disabled:opacity-60"
              />
              {isAdmin && name.trim() !== title && (
                <button
                  type="button"
                  onClick={saveName}
                  disabled={savingName}
                  className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-60"
                >
                  {savingName ? <Loader2 size={15} className="animate-spin" /> : "Save"}
                </button>
              )}
            </div>
            {!isAdmin && (
              <p className="px-4 pb-3 text-xs text-faint">Only admins can rename this group.</p>
            )}
          </Section>

          <Section title={`${members.length} members`}>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <UserPlus size={20} className="text-accent" />
                <span className="flex-1 text-sm font-semibold text-accent">Add people</span>
                {adding && <X size={16} className="text-faint" />}
              </button>
            )}

            {adding && (
              <div className="px-4 py-3">
                <div className="flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3">
                  <Search size={15} className="shrink-0 text-faint" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search people you know…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                  />
                  {searching && <Loader2 size={14} className="animate-spin text-faint" />}
                </div>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy === r.id}
                    onClick={() =>
                      run(
                        r.id,
                        () =>
                          supabase.rpc("add_conversation_member", {
                            p_conversation_id: conversationId,
                            p_user_id: r.id,
                          }) as unknown as Promise<{ error: unknown }>,
                        `Added ${r.name}`,
                        "Couldn't add them."
                      ).then((okd) => {
                        if (okd) setResults((x) => x.filter((y) => y.id !== r.id));
                      }) as unknown as void
                    }
                    className="mt-2 flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-white/[0.04] disabled:opacity-60"
                  >
                    <Avatar name={r.name} hue={r.hue} src={r.avatarUrl ?? undefined} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.name}</span>
                      {r.username && (
                        <span className="block truncate text-xs text-muted">@{r.username}</span>
                      )}
                    </span>
                    {busy === r.id ? (
                      <Loader2 size={16} className="animate-spin text-muted" />
                    ) : (
                      <UserPlus size={16} className="text-accent" />
                    )}
                  </button>
                ))}
                {!searching && q.trim() && results.length === 0 && (
                  <p className="mt-3 text-center text-xs text-faint">No one found.</p>
                )}
              </div>
            )}

            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={m.username ? `/u/${m.username}` : "#"} className="shrink-0">
                  <Avatar name={m.name} hue={m.hue} src={m.avatarUrl ?? undefined} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.name}
                    {m.id === currentUserId && (
                      <span className="ml-1 text-xs font-normal text-faint">(you)</span>
                    )}
                  </p>
                  {m.role === "admin" && (
                    <p className="text-xs font-semibold text-accent">Admin</p>
                  )}
                </div>
                {isAdmin && m.id !== currentUserId && (
                  <>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      aria-label={m.role === "admin" ? "Demote to member" : "Make admin"}
                      onClick={() =>
                        run(
                          m.id,
                          () =>
                            supabase.rpc("set_member_role", {
                              p_conversation_id: conversationId,
                              p_user_id: m.id,
                              p_role: m.role === "admin" ? "member" : "admin",
                            }) as unknown as Promise<{ error: unknown }>,
                          m.role === "admin" ? `${m.name} is now a member` : `${m.name} is now an admin`,
                          "Couldn't change their role."
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60"
                    >
                      <ShieldCheck size={17} />
                    </button>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      aria-label={`Remove ${m.name}`}
                      onClick={() => setConfirmRemove(m)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
                    >
                      <UserMinus size={17} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </Section>
        </>
      )}

      <Section>
        {!isGroup && (
          <Row
            icon={<Ban size={20} />}
            label={peer?.username ? `Block @${peer.username}` : "Block"}
            danger
            onClick={() => setConfirmBlock(true)}
          />
        )}
        <Row
          icon={<Flag size={20} />}
          label={isGroup ? "Report group" : "Report"}
          danger
          onClick={() => setReportOpen(true)}
        />
        <Row
          icon={isGroup ? <LogOut size={20} /> : <Trash2 size={20} />}
          label={isGroup ? "Leave group" : "Delete chat"}
          danger
          onClick={() => setConfirmLeave(true)}
        />
      </Section>

      <div className="h-8" />

      <ConfirmDialog
        open={confirmAutoDelete !== null}
        onClose={() => setConfirmAutoDelete(null)}
        onConfirm={() => {
          const v = confirmAutoDelete;
          setConfirmAutoDelete(null);
          if (v) void chooseAutoDelete(v);
        }}
        icon={Timer}
        title={`Delete messages after ${confirmAutoDelete}?`}
        body="This applies to messages already in this chat, not just new ones. Anything older than that window is removed for everyone the next time the timer runs."
        confirmLabel="Turn on"
      />

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={async () => {
          setConfirmLeave(false);
          const okd = await run(
            "leave",
            () =>
              supabase.rpc("leave_conversation", {
                p_conversation_id: conversationId,
              }) as unknown as Promise<{ error: unknown }>,
            isGroup ? "Left group" : "Chat removed",
            "Couldn't do that."
          );
          if (okd) router.replace("/messages");
        }}
        icon={isGroup ? LogOut : Trash2}
        title={isGroup ? "Leave this group" : "Delete this chat"}
        body="The conversation disappears from your inbox. The other person keeps their copy."
        confirmLabel={isGroup ? "Leave" : "Delete"}
      />

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={async () => {
          setConfirmBlock(false);
          if (!peer) return;
          const okd = await run(
            "block",
            () =>
              supabase.rpc("block_user", { p_blocked: peer.id }) as unknown as Promise<{
                error: unknown;
              }>,
            "Blocked",
            "Couldn't block, try again."
          );
          if (okd) router.replace("/messages");
        }}
        icon={Ban}
        title={peer?.username ? `Block @${peer.username}` : "Block"}
        body="They can't message or call you, and you stop seeing each other. They aren't told."
        confirmLabel="Block"
      />

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          const m = confirmRemove;
          setConfirmRemove(null);
          if (!m) return;
          void run(
            m.id,
            () =>
              supabase.rpc("remove_conversation_member", {
                p_conversation_id: conversationId,
                p_user_id: m.id,
              }) as unknown as Promise<{ error: unknown }>,
            `Removed ${m.name}`,
            "Couldn't remove them."
          );
        }}
        icon={UserMinus}
        title={confirmRemove ? `Remove ${confirmRemove.name}` : "Remove member"}
        body="They lose access to this group and its history from here on."
        confirmLabel="Remove"
      />

      {reportOpen && (
        <ReportSheet
          open
          onClose={() => setReportOpen(false)}
          targetType={isGroup ? "conversation" : "profile"}
          targetId={isGroup ? conversationId : (peer?.id ?? conversationId)}
          currentUserId={currentUserId}
          onReported={() => showToast("Thanks — we'll take a look.")}
        />
      )}
    </>
  );
}
