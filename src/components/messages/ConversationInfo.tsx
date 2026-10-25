"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Palette,
  Ban,
  Camera,
  Pencil,
  Bell,
  Check,
  ChevronRight,
  BellOff,
  Flag,
  Ghost,
  Loader2,
  LogOut,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldOff,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
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
import { FloatingMenu, MenuItem } from "@/components/ui/FloatingMenu";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { groupPhotoProblem, toSquareJpeg } from "@/lib/group-photo";
import { SHARED_TAB_ICONS, SharedPanel, type SharedPerson } from "@/components/messages/ConversationMedia";
import type { Shared, SharedTab } from "@/lib/chat-shared";

/** The sections under the actions, one on screen at a time. */
export type InfoSection = "members" | "shared" | "privacy";

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

/** One of the actions under the name: an icon, named for a screen reader. */
function QuickAction({
  icon,
  label,
  onClick,
  href,
  on = false,
  wide = false,
}: {
  icon: React.ReactNode;
  /** What it does. Drawn when `wide`; otherwise read out and shown on hover. */
  label: string;
  onClick?: () => void;
  href?: string;
  /** Lit: the thing it names is switched on (muted). */
  on?: boolean;
  /** Full width, with its name beside the icon rather than only in the label. */
  wide?: boolean;
}) {
  const cls = `flex h-12 items-center rounded-2xl transition-colors active:scale-[0.97] ${
    wide ? "w-full gap-2.5 px-4 text-[15px] font-semibold" : "flex-1 justify-center"
  } ${on ? "bg-accent/15 text-accent" : "bg-surface text-foreground hover:bg-elevated"}`;
  const body = wide ? (
    <>
      {icon}
      {label}
    </>
  ) : (
    icon
  );
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={on} className={cls}>
      {body}
    </button>
  );
}

/** The face and the name, as a way to their profile — or plain, in a group. */
function MaybeProfileLink({
  username,
  label,
  className = "",
  children,
}: {
  username: string | null | undefined;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!username) return <>{children}</>;
  return (
    <Link
      href={`/u/${username}`}
      aria-label={label}
      className={`transition-opacity active:opacity-70 ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * One row of the privacy list. Its icon is lit while the setting is on, so
 * the three read at a glance; the right side is a switch, or for the timer
 * its current value and a chevron.
 */
function PrivacyRow({
  icon,
  label,
  sub,
  on,
  busy,
  onClick,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  on: boolean;
  busy?: boolean;
  onClick: () => void;
  /** Given for a row that opens a picker rather than flipping: what it is set to. */
  value?: string;
}) {
  const isSwitch = value === undefined;
  return (
    <button
      type="button"
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? on : undefined}
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          on ? "bg-accent text-accent-ink" : "bg-background/70 text-muted"
        }`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      {isSwitch ? (
        <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
              on ? "translate-x-[18px] bg-accent-ink" : "translate-x-0.5 bg-foreground"
            }`}
          />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
          <span className={on ? "text-accent" : ""}>{value}</span>
          <ChevronRight size={16} className="text-faint" />
        </span>
      )}
    </button>
  );
}

/**
 * The switcher under the actions. One section is on screen at a time and each
 * says how much is in it, so the page stays one screen tall whatever the size
 * of the group, and what is behind a tab is never a guess. Arrow keys move
 * along it, as they do in any tab list.
 */
function SectionTabs({
  sections,
  current,
  onChange,
}: {
  sections: { id: InfoSection; label: string; count: string }[];
  current: InfoSection;
  onChange: (id: InfoSection) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Chat details"
      data-section-tabs
      className="flex gap-1 rounded-2xl bg-surface p-1"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = sections.findIndex((t) => t.id === current);
        const next = sections[(i + (e.key === "ArrowRight" ? 1 : sections.length - 1)) % sections.length];
        onChange(next.id);
        document.getElementById(`info-tab-${next.id}`)?.focus();
      }}
    >
      {sections.map(({ id, label, count }) => {
        const on = id === current;
        return (
          <button
            key={id}
            id={`info-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`info-panel-${id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(id)}
            // The count sits under the name rather than beside it, so all
            // three still fit a 320px phone without cutting a word short.
            className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 leading-tight transition-colors ${
              on ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
            }`}
          >
            <span className="max-w-full truncate text-[13px] font-bold">{label}</span>
            <span className={`text-[11px] font-semibold tabular-nums ${on ? "opacity-70" : "text-faint"}`}>{count}</span>
          </button>
        );
      })}
    </div>
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
  people,
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
  /** Everything shared in this chat, sorted, for the tabs that open in place. */
  shared: Shared;
  /** Everyone in the chat by id, for the lists and the photo viewer. */
  people: Record<string, SharedPerson>;
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
  /** Which section is on screen: a group opens on its people, a DM on what was shared. */
  const [section, setSection] = useState<InfoSection>(isGroup ? "members" : "shared");
  /** Which kind of shared thing the Shared section shows. */
  const [sharedTab, setSharedTab] = useState<SharedTab>("media");
  const [timerOpen, setTimerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  /** The group picture as it is now: what the page gave, or the one just set. */
  const [photo, setPhoto] = useState<string | null>(avatarUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** The member whose menu (make admin, remove) is open. */
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  /** How many of the three privacy settings are on, for the Privacy tab. */
  const privacyOn = [!!autoDelete, vanish, shot].filter(Boolean).length;

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
    setEditingName(false);
    router.refresh();
  }

  /** A new group picture: cut square, put in this admin's own folder, then set on the group. */
  async function changePhoto(file: File | undefined) {
    if (!file || photoBusy) return;
    const problem = groupPhotoProblem(file);
    if (problem) {
      showToast(problem);
      return;
    }
    setPhotoBusy(true);
    try {
      const square = await toSquareJpeg(file);
      const path = `${currentUserId}/group-${conversationId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, square, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.rpc("update_conversation", {
        p_conversation_id: conversationId,
        p_title: undefined,
        p_avatar_url: url,
      });
      if (error) {
        // Not left behind: the group never pointed at it.
        await supabase.storage.from("avatars").remove([path]);
        throw error;
      }
      setPhoto(url);
      showToast("Group photo changed");
      router.refresh();
    } catch {
      showToast("Couldn't change the group photo. Try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Straight to adding someone: Members, with the search open at its head. */
  function startAdding() {
    setSection("members");
    setAdding(true);
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
        {isGroup && isAdmin ? (
          <label className="relative cursor-pointer" data-group-photo>
            <Avatar name={title} hue={peer?.hue ?? 280} src={photo ?? undefined} size={88} />
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-background bg-accent text-accent-ink">
              {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={15} strokeWidth={2.4} />}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Change group photo"
              disabled={photoBusy}
              onChange={(e) => {
                void changePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          // A DM's face and name are the way to their profile. There used
          // to be a View profile button under them saying so, which is a
          // button for something the picture of a person already promises.
          <MaybeProfileLink username={!isGroup ? peer?.username : null} label={`${title}'s profile`}>
            <Avatar name={title} hue={peer?.hue ?? 280} src={(isGroup ? photo : avatarUrl) ?? undefined} size={88} />
          </MaybeProfileLink>
        )}
        {editingName ? (
          <form
            className="mt-1 flex w-full max-w-xs items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() === title) setEditingName(false);
              else void saveName();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              aria-label="Group name"
              placeholder="Group name"
              className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-center text-base font-bold outline-none"
            />
            <button
              type="submit"
              disabled={savingName || !name.trim()}
              aria-label="Save group name"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink disabled:opacity-60"
            >
              {savingName ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} strokeWidth={2.6} />}
            </button>
            <button
              type="button"
              aria-label="Cancel"
              onClick={() => {
                setName(title);
                setEditingName(false);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted"
            >
              <X size={18} />
            </button>
          </form>
        ) : (
        <div className={`relative mt-1 flex max-w-full items-center gap-1 ${isGroup && isAdmin ? "pl-[4.5rem]" : "pl-9"}`}>
          <MaybeProfileLink username={!isGroup ? peer?.username : null} label={`${title}'s profile`} className="min-w-0">
            <h2 className="min-w-0 truncate text-lg font-extrabold">{title}</h2>
          </MaybeProfileLink>
          {isGroup && isAdmin && (
            <button
              type="button"
              aria-label="Rename group"
              onClick={() => setEditingName(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Pencil size={16} />
            </button>
          )}
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
            <MenuItem
              icon={isMuted ? BellOff : Bell}
              label={isMuted ? "Unmute notifications" : "Mute notifications"}
              onClick={() => {
                setMenuOpen(false);
                void toggleMute();
              }}
            />
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
        )}
        {!isGroup && peer?.username && (
          <Link href={`/u/${peer.username}`} className="text-sm text-muted transition-colors hover:text-foreground">
            @{peer.username}
          </Link>
        )}
        {isGroup && (
          <p className="text-sm text-muted">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        )}
      </div>

      {/* One thing you do to a chat from here, and it says so.
          Three icon-only squares sat here before: a profile, a bell and a
          palette. The profile is the face above, the bell belongs with the
          other things done TO a chat behind the dots, and a lone unlabelled
          palette is a guess. The same height, the full width, with a word
          on it. */}
      <div className="mt-4 flex flex-col gap-2 px-4" data-quick-actions>
        <QuickAction icon={<Palette size={20} />} label="Chat theme" onClick={() => setThemeOpen(true)} wide />
        {isGroup && isAdmin && (
          <QuickAction icon={<UserPlus size={20} />} label="Add people" onClick={startAdding} wide />
        )}
      </div>

      {/* Below the actions, one section at a time: a group's people, what
          was shared, and privacy. The switcher stays under the header while
          a long list or a year of photos scrolls beneath it. */}
      <div className="sticky top-[calc(3.5rem+var(--sat))] z-10 mt-5 bg-background px-4 pb-3 pt-2">
        <SectionTabs
          current={section}
          onChange={(id) => {
            setSection(id);
            setMemberMenu(null);
          }}
          sections={[
            ...(isGroup ? [{ id: "members" as const, label: "Members", count: String(members.length) }] : []),
            {
              id: "shared" as const,
              label: "Shared",
              count: String(shared.media.length + shared.posts.length + shared.more.length),
            },
            {
              id: "privacy" as const,
              label: "Privacy",
              count: privacyOn ? `${privacyOn} on` : "Off",
            },
          ]}
        />
      </div>

      {/* Who is in the group: everyone, with their handle, and for an admin
          the way to add people and each member's menu. */}
      {isGroup && section === "members" && (
        <section
          role="tabpanel"
          id="info-panel-members"
          aria-labelledby="info-tab-members"
          className="animate-rise px-4"
          data-group-members
        >
          <div className="divide-y divide-border/50 rounded-2xl bg-surface">
            {isAdmin && (
              <div>
                <button
                  type="button"
                  aria-expanded={adding}
                  onClick={() => setAdding((v) => !v)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <UserPlus size={18} />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-accent">Add people</span>
                  {adding && <X size={16} className="text-faint" />}
                </button>

                {adding && (
                  <div className="px-3.5 pb-3">
                    <div className="flex h-10 items-center gap-2 rounded-xl bg-background/70 px-3">
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
              </div>
            )}

            {members.map((m, i) => (
              <div key={m.id} data-member={m.id} className="relative flex items-center gap-3 px-3.5 py-2.5">
                <Link href={m.username ? `/u/${m.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.name} hue={m.hue} src={m.avatarUrl ?? undefined} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {m.name}
                      {m.id === currentUserId && <span className="ml-1 text-xs font-normal text-faint">(you)</span>}
                    </span>
                    {m.username && <span className="block truncate text-xs text-muted">@{m.username}</span>}
                  </span>
                </Link>
                {m.role === "admin" && (
                  <span className="shrink-0 rounded-pill bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">Admin</span>
                )}
                {isAdmin && m.id !== currentUserId && (
                  <>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      aria-label={`Options for ${m.name}`}
                      aria-haspopup="menu"
                      aria-expanded={memberMenu === m.id}
                      onClick={() => setMemberMenu(m.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60"
                    >
                      {busy === m.id ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} />}
                    </button>
                    <FloatingMenu
                      open={memberMenu === m.id}
                      onClose={() => setMemberMenu(null)}
                      // The last rows open upward, so the menu is not cut
                      // off by the foot of the page.
                      origin={i >= members.length - 2 ? "bottom-right" : "top-right"}
                      className={`absolute right-3 min-w-[200px] ${i >= members.length - 2 ? "bottom-11" : "top-11"}`}
                    >
                      <MenuItem
                        icon={m.role === "admin" ? ShieldOff : ShieldCheck}
                        label={m.role === "admin" ? "Make a member" : "Make admin"}
                        onClick={() => {
                          setMemberMenu(null);
                          void run(
                            m.id,
                            () =>
                              supabase.rpc("set_member_role", {
                                p_conversation_id: conversationId,
                                p_user_id: m.id,
                                p_role: m.role === "admin" ? "member" : "admin",
                              }) as unknown as Promise<{ error: unknown }>,
                            m.role === "admin" ? `${m.name} is now a member` : `${m.name} is now an admin`,
                            "Couldn't change their role."
                          );
                        }}
                      />
                      <MenuItem
                        icon={UserMinus}
                        label="Remove from group"
                        danger
                        onClick={() => {
                          setMemberMenu(null);
                          setConfirmRemove(m);
                        }}
                      />
                    </FloatingMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shared in this chat: the three kinds, one always chosen, and that
          kind filling the rest of the screen. */}
      {section === "shared" && (
        <section
          role="tabpanel"
          id="info-panel-shared"
          aria-labelledby="info-tab-shared"
          className="animate-rise"
          data-shared-card
          data-open={sharedTab}
        >
          <div role="tablist" aria-label="Shared in this chat" className="mx-4 flex gap-1.5 rounded-2xl bg-surface p-1.5">
            {SHARED_TAB_ICONS.map(({ id, label, Icon }) => {
              const on = sharedTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`${label}, ${shared[id].length}`}
                  data-shared-tab={id}
                  onClick={() => setSharedTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold tabular-nums transition-colors ${
                    on ? "bg-accent text-accent-ink" : "bg-background/60 text-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={18} strokeWidth={2.2} className={on ? "" : "text-foreground"} aria-hidden />
                  <span>{shared[id].length}</span>
                </button>
              );
            })}
          </div>
          <div className="pt-1">
            <SharedPanel shared={shared} me={currentUserId} people={people} isGroup={isGroup} tab={sharedTab} />
          </div>
        </section>
      )}

      {/* Privacy (migration 0032): one list. Two switches, and the timer,
          which shows what it is set to and opens its four choices. */}
      {section === "privacy" && (
        <section
          role="tabpanel"
          id="info-panel-privacy"
          aria-labelledby="info-tab-privacy"
          className="animate-rise px-4"
          data-privacy
        >
          <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-surface">
          <PrivacyRow
            icon={<Timer size={18} />}
            label="Disappearing messages"
            sub={autoDelete ? "Deleted for everyone after a while" : "Messages stay until deleted"}
            on={!!autoDelete}
            busy={busy === "autodelete"}
            value={AUTO_DELETE_OPTIONS.find((o) => o.value === autoDelete)?.label ?? "Off"}
            onClick={() => setTimerOpen(true)}
          />
          <PrivacyRow
            icon={<Ghost size={18} />}
            label="Vanish mode"
            sub="New messages disappear once seen"
            on={vanish}
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
          />
          <PrivacyRow
            icon={<ShieldCheck size={18} />}
            label="Screenshot alerts"
            sub="Everyone is told when one is taken"
            on={shot}
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
          />
          </div>
          <p className="px-1 pt-2 text-xs text-faint">These apply to everyone in this chat.</p>
        </section>
      )}

      <div className="h-8" />

      <BottomSheet open={timerOpen} onClose={() => setTimerOpen(false)} title="Disappearing messages">
        <p className="pb-2 text-xs text-muted">
          Deletes for everyone, and applies to messages already in this chat.
        </p>
        <div role="radiogroup" aria-label="Delete messages after" className="-mx-3 pb-4">
          {AUTO_DELETE_OPTIONS.map((o) => {
            const on = autoDelete === o.value;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={on}
                // Turning it ON is destructive to history that already
                // exists, not just to messages sent from now on — the cron
                // sweeps anything older than the window on its next hourly
                // run. Off needs no confirmation; on does.
                onClick={() => {
                  setTimerOpen(false);
                  if (on) return;
                  if (o.value) setConfirmAutoDelete(o.value);
                  else void chooseAutoDelete(null);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-white/[0.05]"
              >
                {o.label}
                {on && <Check size={18} className="text-accent" />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

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
