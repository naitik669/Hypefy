"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Television } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { MAX_SHOW_MB } from "@/lib/video-poster";
import { BLANK_POSTER } from "@/lib/blank-poster";

type Show = { id: string; media_url: string; caption: string | null };
type Shot = {
  id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

/** What the board will contain, in the order it was chosen. */
type Pick =
  | { kind: "show"; id: string; thumb: string; isVideo: boolean }
  | { kind: "shot"; id: string; thumb: string; isVideo: boolean }
  | { kind: "upload"; id: string; thumb: string; isVideo: boolean; file: File };

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"];

/**
 * Making a board: name it, fill it, done.
 *
 * Order is the order you tapped things in, not the order they were posted.
 * A board is a sequence someone is arranging — that is the whole difference
 * between it and the flat rail it replaces — so the choosing IS the ordering,
 * and there is no separate reordering step to discover.
 */
export function ShowcaseEditor({
  userId,
  shows,
  shots,
}: {
  userId: string;
  shows: Show[];
  shots: Shot[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);

  const indexOf = (kind: string, id: string) =>
    picks.findIndex((p) => p.kind === kind && p.id === id);

  function toggle(next: Pick) {
    haptics.select();
    setPicks((prev) => {
      const at = prev.findIndex((p) => p.kind === next.kind && p.id === next.id);
      return at === -1 ? [...prev, next] : prev.filter((_, i) => i !== at);
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Pick[] = [];
    for (const file of Array.from(list)) {
      if (!ALLOWED.includes(file.type)) {
        toast(`${file.name} isn't a supported format`, "error");
        continue;
      }
      if (file.size > MAX_SHOW_MB * 1024 * 1024) {
        // The real numbers, not "too large": the whole reason the upload
        // helper exists is that people cannot act on a vague size error.
        toast(
          `${file.name} is ${Math.round(file.size / 1024 / 1024)}MB — the limit is ${MAX_SHOW_MB}MB`,
          "error",
        );
        continue;
      }
      next.push({
        kind: "upload",
        id: `${file.name}-${file.size}-${file.lastModified}`,
        thumb: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
        file,
      });
    }
    if (next.length > 0) setPicks((prev) => [...prev, ...next]);
  }

  async function create() {
    const name = title.trim();
    if (!name) {
      toast("Give it a name", "error");
      return;
    }
    if (picks.length === 0) {
      toast("Add at least one thing", "error");
      return;
    }
    setBusy(true);

    // Uploads first: a board that exists with half its contents missing is
    // worse than one that was never created, and an upload is the only step
    // here that can fail slowly.
    const uploaded = new Map<string, string>();
    for (const p of picks) {
      if (p.kind !== "upload") continue;
      const ext = (p.file.type.split("/")[1] ?? "bin").replace("quicktime", "mov");
      const path = `${userId}/showcase-${Date.now()}-${uploaded.size}.${ext}`;
      const { error } = await supabase.storage
        .from("show-media")
        .upload(path, p.file, { contentType: p.file.type });
      if (error) {
        setBusy(false);
        toast("An upload failed — nothing was created", "error");
        return;
      }
      uploaded.set(
        p.id,
        supabase.storage.from("show-media").getPublicUrl(path).data.publicUrl,
      );
    }

    const { data: board, error: boardErr } = await supabase
      .from("showcases")
      .insert({ user_id: userId, title: name })
      .select("id")
      .single();
    if (boardErr || !board) {
      setBusy(false);
      toast("Couldn't create that Showcase", "error");
      return;
    }

    const rows = picks.map((p, i) => ({
      showcase_id: board.id,
      kind: p.kind,
      position: i,
      show_id: p.kind === "show" ? p.id : null,
      shot_id: p.kind === "shot" ? p.id : null,
      media_url: p.kind === "upload" ? (uploaded.get(p.id) ?? null) : null,
    }));
    const { error: itemsErr } = await supabase
      .from("showcase_items")
      .insert(rows);

    setBusy(false);
    if (itemsErr) {
      // Leaving a named but empty board behind would be a puzzle on the
      // profile with no explanation, so it goes with the failure.
      await supabase.from("showcases").delete().eq("id", board.id);
      toast("Couldn't add those items", "error");
      return;
    }

    haptics.success();
    router.replace(`/showcase/${board.id}`);
  }

  const tiles = [
    ...shots.map((s) => ({
      kind: "shot" as const,
      id: s.id,
      thumb: s.poster_url ?? s.media_url,
      isVideo: !s.poster_url,
      label: s.caption,
    })),
    ...shows.map((s) => ({
      kind: "show" as const,
      id: s.id,
      thumb: s.media_url,
      isVideo: true,
      label: s.caption,
    })),
  ];

  return (
    <div className="flex flex-col gap-5 px-4 pb-24 pt-4">
      <div>
        <label htmlFor="sc-title" className="text-xs font-semibold text-muted">
          Name
        </label>
        <input
          id="sc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 40))}
          placeholder="Trips, Late nights, 2026…"
          className="mt-1.5 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-white/25"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-faint">
            {picks.length > 0 ? `${picks.length} chosen` : "Add anything"}
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-bold transition-colors active:bg-elevated"
          >
            <Upload size={13} /> Upload
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED.join(",")}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {tiles.length === 0 && picks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-elevated px-4 py-10 text-center">
            <Television size={26} weight="fill" className="text-faint" />
            <p className="text-sm font-semibold">Nothing to add yet</p>
            <p className="text-xs text-muted">
              Post a Shot or a Show, or upload something straight into this
              board.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* Uploads first — they are the things you just chose, and
                hunting for them at the bottom of your whole history is the
                kind of small cruelty nobody reports. */}
            {picks
              .filter((p) => p.kind === "upload")
              .map((p) => (
                <Tile
                  key={p.id}
                  thumb={p.thumb}
                  isVideo={p.isVideo}
                  order={indexOf(p.kind, p.id) + 1}
                  onClick={() => toggle(p)}
                />
              ))}
            {tiles.map((t) => {
              const order = indexOf(t.kind, t.id) + 1;
              return (
                <Tile
                  key={`${t.kind}-${t.id}`}
                  thumb={t.thumb}
                  isVideo={t.isVideo}
                  order={order}
                  onClick={() =>
                    toggle({
                      kind: t.kind,
                      id: t.id,
                      thumb: t.thumb,
                      isVideo: t.isVideo,
                    } as Pick)
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Sits on the bottom nav (72px, which already clears the phone's own
          bar), not at the screen's bottom edge, where the nav covered it. */}
      <div className="fixed inset-x-0 bottom-[72px] z-20 mx-auto max-w-[480px] border-t border-border bg-background/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={create}
          disabled={busy || !title.trim() || picks.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Creating…" : "Create Showcase"}
        </button>
      </div>
    </div>
  );
}

function Tile({
  thumb,
  isVideo,
  order,
  onClick,
}: {
  thumb: string;
  isVideo: boolean;
  /** 1-based position in the board, or 0 when not chosen. */
  order: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={order > 0}
      className={`relative aspect-square overflow-hidden rounded-xl bg-surface transition-transform active:scale-95 ${
        order > 0 ? "ring-2 ring-accent" : ""
      }`}
    >
      {isVideo ? (
        // #t=0.1 forces a decoded frame — preload="metadata" is not obliged
        // to produce one, and Safari does not.
        <video poster={BLANK_POSTER}
          src={`${thumb}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}

      {/* The NUMBER, not a tick: the order things play in is the point of a
          board, and a tick would hide it. */}
      {order > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-black text-accent-ink">
          {order}
        </span>
      )}
    </button>
  );
}
