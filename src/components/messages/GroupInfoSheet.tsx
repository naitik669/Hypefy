"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";

export type GroupMember = {
  id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; role: string;
};

type Found = { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null };

/**
 * Group settings: rename, manage members (add/remove/role), all gated to
 * admins. Backed by the update_conversation / *_conversation_member /
 * set_member_role RPCs. Refreshes the route after each change.
 */
export function GroupInfoSheet({
  conversationId, title, members, myRole, onClose,
}: {
  conversationId: string;
  title: string;
  members: GroupMember[];
  myRole: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const isAdmin = myRole === "admin";

  const [name, setName] = useState(title);
  const [savingName, setSavingName] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  const memberIds = new Set(members.map((m) => m.id));

  async function saveName() {
    const next = name.trim();
    if (!next || next === title) return;
    setSavingName(true);
    const { error } = await supabase.rpc("update_conversation", { p_conversation_id: conversationId, p_title: next, p_avatar_url: null });
    setSavingName(false);
    if (!error) router.refresh();
  }

  async function removeMember(userId: string) {
    setBusyId(userId);
    const { error } = await supabase.rpc("remove_conversation_member", { p_conversation_id: conversationId, p_user_id: userId });
    setBusyId(null);
    if (!error) router.refresh();
  }

  async function setRole(userId: string, role: "admin" | "member") {
    setBusyId(userId);
    const { error } = await supabase.rpc("set_member_role", { p_conversation_id: conversationId, p_user_id: userId, p_role: role });
    setBusyId(null);
    if (!error) router.refresh();
  }

  async function addMember(userId: string) {
    setBusyId(userId);
    const { error } = await supabase.rpc("add_conversation_member", { p_conversation_id: conversationId, p_user_id: userId });
    setBusyId(null);
    if (!error) { setResults((r) => r.filter((x) => x.id !== userId)); router.refresh(); }
  }

  // Debounced people search for "add member"
  useEffect(() => {
    if (!adding) return;
    const term = q.trim();
    if (!term) { setResults([]); return; }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(15);
      if (!active) return;
      setResults(
        (data ?? [])
          .filter((p: any) => !memberIds.has(p.id))
          .map((p: any) => ({ id: p.id, name: p.display_name ?? p.username ?? "User", username: p.username ?? null, hue: p.avatar_hue ?? 280, avatarUrl: p.avatar_url ?? null })),
      );
      setSearching(false);
    }, 300);
    return () => { active = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, adding]);

  return (
    <BottomSheet open onClose={onClose} title="Group info">
      <div className="flex flex-col gap-4 pb-4">
        {/* Name */}
        <div>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">Group name</p>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin || savingName}
              className="h-11 flex-1 rounded-xl bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-70"
            />
            {isAdmin && name.trim() !== title && (
              <button type="button" onClick={saveName} disabled={savingName}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-accent-ink disabled:opacity-60">
                {savingName ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />} Save
              </button>
            )}
          </div>
        </div>

        {/* Members */}
        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-widest text-faint">{members.length} members</p>
            {isAdmin && (
              <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-accent">
                <UserPlus size={14} /> Add
              </button>
            )}
          </div>

          {/* Add-member search */}
          {adding && isAdmin && (
            <div className="mb-2 rounded-xl border border-border bg-surface p-2">
              <div className="flex h-10 items-center gap-2 rounded-pill bg-elevated px-3 focus-within:ring-2 focus-within:ring-accent/30">
                <Search size={15} className="shrink-0 text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
                {searching && <Loader2 size={14} className="animate-spin text-faint" />}
              </div>
              <div className="mt-1 flex flex-col">
                {results.map((r) => (
                  <button key={r.id} type="button" onClick={() => addMember(r.id)} disabled={busyId === r.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5 disabled:opacity-60">
                    <Avatar name={r.name} hue={r.hue} size={36} src={r.avatarUrl ?? undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      {r.username && <p className="truncate text-xs text-muted">@{r.username}</p>}
                    </div>
                    {busyId === r.id ? <Loader2 size={16} className="animate-spin text-accent" /> : <UserPlus size={16} className="text-accent" />}
                  </button>
                ))}
                {q.trim() && !searching && results.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-faint">No one found.</p>
                )}
              </div>
            </div>
          )}

          {/* Member list */}
          <div className="flex flex-col">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-1 py-2">
                <Avatar name={m.name} hue={m.hue} size={40} src={m.avatarUrl ?? undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  {m.username && <p className="truncate text-xs text-muted">@{m.username}</p>}
                </div>
                {m.role === "admin" && (
                  <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                    <ShieldCheck size={11} /> Admin
                  </span>
                )}
                {isAdmin && (
                  <>
                    <button type="button" disabled={busyId === m.id}
                      onClick={() => setRole(m.id, m.role === "admin" ? "member" : "admin")}
                      title={m.role === "admin" ? "Demote to member" : "Make admin"}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-foreground disabled:opacity-50">
                      <ShieldCheck size={16} className={m.role === "admin" ? "text-accent" : ""} />
                    </button>
                    <button type="button" disabled={busyId === m.id} onClick={() => removeMember(m.id)} title="Remove"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-white/5 disabled:opacity-50">
                      {busyId === m.id ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={16} />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
