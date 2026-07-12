"use client";

import { useState } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * "Download your data" — bundles the viewer's own rows into a JSON file,
 * fetched client-side under RLS so it can only ever contain what the user
 * can already read about themselves.
 */
export function DataExport() {
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function exportData() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");
      const uid = user.id;

      const [profile, posts, shots, shows, comments, following, followers, saved, notes, hashtags] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
          supabase.from("posts").select("*").eq("user_id", uid).order("created_at"),
          supabase.from("shots").select("*").eq("user_id", uid).order("created_at"),
          supabase.from("shows").select("*").eq("user_id", uid).order("created_at"),
          supabase.from("comments").select("*").eq("user_id", uid).order("created_at"),
          supabase.from("follows").select("following_id, created_at").eq("follower_id", uid),
          supabase.from("follows").select("follower_id, created_at").eq("following_id", uid),
          supabase.from("saved_posts").select("post_id, created_at").eq("user_id", uid),
          supabase.from("notes").select("*").eq("user_id", uid),
          supabase.from("hashtag_follows").select("tag, created_at").eq("user_id", uid),
        ]);

      const bundle = {
        exportedAt: new Date().toISOString(),
        app: "Hypefy",
        account: { id: uid, email: user.email },
        profile: profile.data ?? null,
        posts: posts.data ?? [],
        shots: shots.data ?? [],
        shows: shows.data ?? [],
        comments: comments.data ?? [],
        following: following.data ?? [],
        followers: followers.data ?? [],
        savedPosts: saved.data ?? [],
        notes: notes.data ?? [],
        followedHashtags: hashtags.data ?? [],
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hypefy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      toast("Couldn't export your data", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">Your data</p>
      <button
        type="button"
        onClick={exportData}
        disabled={busy}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-elevated disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-foreground">
          {busy ? <Loader2 size={17} className="animate-spin" /> : done ? <Check size={17} className="text-accent" /> : <Download size={17} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Download your data</span>
          <span className="block truncate text-xs text-muted">
            Profile, posts, comments, follows and more — as JSON
          </span>
        </span>
      </button>
    </section>
  );
}
