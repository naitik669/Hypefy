"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Palette,
  Ban,
  Bell,
  BellOff,
  Flag,
  Ghost,
  Images,
  LayoutGrid,
  Loader2,
  LogOut,
  MoreHorizontal,
  Paperclip,
  Play,
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
import { removeChat } from "@/lib/chat-removal";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { ChatThemePicker } from "@/components/messages/ChatThemePicker";
import { findChatTheme } from "@/lib/chat-themes";
import { FloatingMenu, MenuItem } from "@/components/ui/FloatingMenu";
import { ChatImg, ChatVideo } from "@/components/messages/ChatMedia";
import type { SharedTab } from "@/lib/chat-shared";

/** What the Shared card on this screen is given: how much there is, and the newest few to show. */
export type SharedSummary = {
  counts: Record<SharedTab, number>;
  preview: { id: string; kind: "image" | "video" | "gif"; url: string }[];
};

/** The Shared tabs, as icons. The same three, in the same order, as the Shared screen. */
const SHARED_ICONS: { id: SharedTab; label: string; Icon: typeof Images }[] = [
  { id: "media", label: "Photos and videos", Icon: Images },
  { id: "posts", label: "Posts and Shots", Icon: LayoutGrid },
  { id: "more", label: "Voice notes, files and links", Icon: Paperclip },
];
/** How many of the newest photos the card shows before "+N". */
export const PREVIEW_TILES = 4;

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

/** One of the round actions under the name. */
function QuickAction({
  icon,
  label,
  onClick,
  href,
  on = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  /** Lit: the thing it names is switched on (muted). */
  on?: boolean;
}) {
  const cls = `flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-semibold transition-colors active:scale-[0.97] ${
    on ? "bg-accent/15 text-accent" : "bg-surface text-muted hover:text-foreground"
  }`;
  const body = (
    <>
      <span className={on ? "text-accent" : "text-foreground"}>{icon}</span>
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={on} className={cls}>
      {body}
    </button>
  );
}

/** A setting that is on or off: said as a switch, not as a row that reads "Off". */
function SwitchRow({
  icon,
  label,
  sub,
  on,
  busy,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  on: boolean;
  busy?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onChange}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
    >
      <span className="shrink-0 text-muted">{busy ? <Loader2 size={20} className="animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
            on ? "translate-x-[18px] bg-accent-ink" : "translate-x-0.5 bg-foreground"
          }`}
        />
      </span>
    </button>
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
  shared,
  theme = null,
  isPremium = false,
  ownedThemes = [],
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
  shared: SharedSummary;
  /** The chat's theme id, or null for the default look. */
  theme?: string | null;
  isPremium?: boolean;
  /** Shop themes this person has bought. */
  ownedThemes?: string[];
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
  const [chatTheme, setChatTheme] = useState<string | null>(theme);
  const [themeOpen, setThemeOpen] = useState(false);
  const [shot, setShot] = useState(screenshotAlert);
  const [autoDelete, setAutoDelete] = useState<string | null>(
    // Postgres hands back "24:00:00" / "7 days"; match it to a known option.
    AUTO_DELETE_OPTIONS.find((o) => o.value && autoDeleteAfter?.includes(o.value.split(" ")[0]))
      ?.value ?? null
  );

  const [confirmAutoDelete, setConfirmAutoDelete] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RosterMember | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* Identity. The things you do to a chat rather than in it (block,
          report, delete) are behind the dots beside the name, out of the way
          of a thumb scrolling the settings below. */}
      <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-1 text-center">
        <Avatar name={title} hue={peer?.hue ?? 280} src={avatarUrl ?? undefined} size={88} />
        <div className="relative mt-1 flex max-w-full items-center gap-1 pl-9">
          <h2 className="min-w-0 truncate text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <MoreHorizontal size={20} />
          </button>
          <FloatingMenu open={menuOpen} onClose={() => setMenuOpen(false)} className="absolute right-0 top-9 min-w-[210px] text-left">
            {!isGroup && (
              <MenuItem
                icon={Ban}
                label={peer?.username ? `Block @${peer.username}` : "Block"}
                danger
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmBlock(true);
                }}
              />
            )}
            <MenuItem
              icon={Flag}
              label={isGroup ? "Report group" : "Report"}
              danger
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            />
            <MenuItem
              icon={isGroup ? LogOut : Trash2}
              label={isGroup ? "Leave group" : "Delete chat"}
              danger
              onClick={() => {
                setMenuOpen(false);
                removeChat({
                  id: conversationId,
                  isGroup,
                  name: title,
                  thumb: { src: avatarUrl, name: title, hue: peer?.hue ?? null },
                  leave: () => supabase.rpc("leave_conversation", { p_conversation_id: conversationId }),
                  toast: showToast,
                  onDone: () => router.refresh(),
                });
                router.replace("/messages");
              }}
            />
          </FloatingMenu>
        </div>
        {!isGroup && peer?.username && (
          <p className="text-sm text-muted">@{peer.username}</p>
        )}
        {isGroup && (
          <p className="text-sm text-muted">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        )}
      </div>

      {/* What you reach for most, one tap each. */}
      <div className="mt-4 flex gap-2 px-4">
        {!isGroup && peer?.username && (
          <QuickAction icon={<UserCircle size={22} />} label="Profile" href={`/u/${peer.username}`} />
        )}
        <QuickAction
          icon={isMuted ? <BellOff size={22} /> : <Bell size={22} />}
          label={isMuted ? "Muted" : "Mute"}
          on={isMuted}
          onClick={toggleMute}
        />
        <QuickAction
          icon={<Palette size={22} />}
          label={findChatTheme(chatTheme)?.label ?? "Theme"}
          onClick={() => setThemeOpen(true)}
        />
      </div>

      {/* Shared in this chat: the three kinds, how many of each, and the
          newest photos, so it is clear what is in there before it is opened. */}
      <section className="mt-5 px-4" data-shared-card>
        <div className="rounded-2xl bg-surface p-2.5">
          <div className="flex gap-1.5">
            {SHARED_ICONS.map(({ id, label, Icon }) => (
              <Link
                key={id}
                href={`/messages/${conversationId}/media?tab=${id}`}
                aria-label={`${label}, ${shared.counts[id]}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-background/60 py-2.5 text-xs font-bold tabular-nums text-muted transition-colors hover:text-foreground"
              >
                <Icon size={18} strokeWidth={2.2} className="text-foreground" aria-hidden />
                <span>{shared.counts[id]}</span>
              </Link>
            ))}
          </div>
          {shared.preview.length > 0 ? (
            <Link
              href={`/messages/${conversationId}/media?tab=media`}
              aria-label="Open photos and videos"
              className="mt-2 grid grid-cols-4 gap-1"
            >
              {shared.preview.slice(0, PREVIEW_TILES).map((m, i) => {
                const rest = shared.counts.media - PREVIEW_TILES;
                const last = i === PREVIEW_TILES - 1 && rest > 0;
                return (
                  <span key={m.id} className="relative block aspect-square overflow-hidden rounded-lg bg-background">
                    {m.kind === "video" ? (
                      <>
                        <ChatVideo url={m.url} fragment="#t=0.1" preload="metadata" muted playsInline className="h-full w-full object-cover" />
                        {!last && (
                          <Play size={16} className="absolute inset-0 m-auto text-white drop-shadow" fill="currentColor" aria-hidden />
                        )}
                      </>
                    ) : (
                      <ChatImg url={m.url} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    )}
                    {last && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold tabular-nums text-white">
                        +{rest}
                      </span>
                    )}
                  </span>
                );
              })}
            </Link>
          ) : (
            <p className="px-1.5 pb-1 pt-2.5 text-xs text-muted">
              Photos, posts, Shots, voice notes and links sent here collect in these three.
            </p>
          )}
        </div>
      </section>

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

        <SwitchRow
          icon={<Ghost size={20} />}
          label="Vanish mode"
          sub="New messages disappear once seen"
          on={vanish}
          busy={busy === "vanish"}
          onChange={async () => {
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
        />
        <SwitchRow
          icon={<ShieldCheck size={20} />}
          label="Screenshot alerts"
          sub="Everyone is told when a screenshot is taken"
          on={shot}
          busy={busy === "shot"}
          onChange={async () => {
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

      <div className="h-8" />

      <ChatThemePicker
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        conversationId={conversationId}
        current={chatTheme}
        isPremium={isPremium}
        owned={ownedThemes}
        onChanged={(id) => {
          setChatTheme(id);
          router.refresh();
        }}
      />

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
