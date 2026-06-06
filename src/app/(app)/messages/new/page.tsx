"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Check, Loader2, Users , X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";

type Person = { id: string; display_name: string | null; username: string | null; avatar_hue: number | null };

export default function NewChatPage() {
  const router = useRouter();
  const supabase = createClient();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [followingRes, followerRes, notifRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(200),
        supabase.from("follows").select("follower_id").eq("following_id", user.id).limit(200),
        supabase.from("notifications").select("actor_id").eq("user_id", user.id).not("actor_id", "is", null).limit(50),
      ]);
      const ids = new Set<string>();
      followingRes.data?.forEach((r: any) => ids.add(r.following_id));
      followerRes.data?.forEach((r: any) => ids.add(r.follower_id));
      notifRes.data?.forEach((r: any) => r.actor_id && ids.add(r.actor_id));
      ids.delete(user.id);
      if (ids.size === 0) { setPeople([]); setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", [...ids])
        .eq("profile_completed", true)
        .limit(120);
      setPeople((data ?? []) as Person[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const query = q.trim().toLowerCase();
  const filtered = people.filter(
    (p) =>
      !query ||
      (p.display_name ?? "").toLowerCase().includes(query) ||
      (p.username ?? "").toLowerCase().includes(query),
  );
  const selectedPeople = people.filter((p) => selected.has(p.id));
  const isGroup = selected.size >= 2;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function start() {
    if (creating || selected.size === 0) return;
    setCreating(true);
    const ids = [...selected];
    try {
      if (ids.length === 1) {
        const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: ids[0] });
        if (!error && convId) { router.push(`/messages/${convId}`); return; }
      } else {
        const { data: convId, error } = await supabase.rpc("create_group", {
          p_title: groupName.trim() || null,
          p_member_ids: ids,
        });
        if (!error && convId) { router.push(`/messages/${convId}`); return; }
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader title="New message" showBack />

      <div className="px-4 pb-28 pt-3">
        {/* Search */}
        <div className="flex h-11 items-center gap-2 rounded-pill border border-border bg-surface px-3.5 focus-within:border-accent/40">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>

        {/* Selected chips */}
        {selected.size > 0 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {selectedPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-pill bg-surface py-1 pl-1 pr-2.5"
              >
                <Avatar name={p.display_name ?? p.username ?? "U"} hue={p.avatar_hue ?? 280} size={24} className="rounded-full" />
                <span className="text-xs font-semibold">{p.display_name ?? p.username}</span>
                <X size={12} />
              </button>
            ))}
          </div>
        )}

        {/* Group name (2+) */}
        {isGroup && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value.slice(0, 40))}
            placeholder="Group name (optional)"
            className="input mt-3"
          />
        )}

        {/* People list */}
        <div className="mt-3 flex flex-col">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-muted" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">
              {people.length === 0 ? "Follow people to start a chat." : "No results"}
            </p>
          ) : (
            filtered.map((p) => {
              const name = p.display_name ?? p.username ?? "User";
              const on = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors ${on ? "bg-accent/10" : "hover:bg-white/[0.03]"}`}
                >
                  <Avatar name={name} hue={p.avatar_hue ?? 280} size={46} />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    {p.username && <p className="truncate text-xs text-muted">@{p.username}</p>}
                  </div>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold ${on ? "border-accent bg-accent text-accent-ink" : "border-border text-transparent"}`}>
                    <Check size={13} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom action */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-20 mx-auto max-w-[480px] bg-gradient-to-t from-background via-background to-transparent px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={start}
            disabled={creating}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-base font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {creating ? (
              <><Loader2 size={18} className="animate-spin" /> Starting...</>
            ) : isGroup ? (
              <><Users size={18} /> Create group · {selected.size}</>
            ) : (
              "Message"
            )}
          </button>
        </div>
      )}
    </>
  );
}
