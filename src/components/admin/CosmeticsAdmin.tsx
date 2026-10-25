"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FramePlacer, LIMITS, type Placement } from "@/components/admin/FramePlacer";
import { FramePlacement, PreviewRow, Slider } from "@/components/admin/FramePlacement";

export type ProductRow = {
  id: string;
  kind: string;
  tier: string;
  name: string;
  price_paise: number | null;
  active: boolean;
  sort: number;
  asset_path: string | null;
  scale: number;
  offset_x: number;
  offset_y: number;
  rotation: number;
};

/**
 * What each kind is called, in words.
 *
 * The list said "avatar_decoration" and "bubble_style", which are column
 * values, not names of things. Nobody could tell what most of the
 * catalogue was.
 */
const KIND_LABEL: Record<string, string> = {
  avatar_decoration: "Frame",
  bubble_style: "Chat bubble",
  chat_theme: "Chat theme",
  name_font: "Name font",
  name_glow: "Name glow",
  nameplate: "Nameplate",
};

/**
 * Three shelves, as asked. Everything that is not a frame or a bubble goes
 * in Others, sorted so its kinds cluster rather than interleave.
 */
const SECTIONS: { id: string; label: string; holds: (kind: string) => boolean }[] = [
  { id: "frames", label: "Frames", holds: (k) => k === "avatar_decoration" },
  { id: "bubbles", label: "Chat bubbles", holds: (k) => k === "bubble_style" },
  { id: "others", label: "Others", holds: (k) => k !== "avatar_decoration" && k !== "bubble_style" },
];

const TIERS = ["free", "premium", "shop"] as const;

/**
 * The cap on an uploaded frame.
 *
 * 256KB turned out to be tight for real artwork — a frame with gradients
 * and a few hundred paths passes it easily. The browser caches one copy
 * per frame however many avatars wear it, so the cost is a single download
 * a session rather than one per avatar, which is what makes half a
 * megabyte reasonable here and would not make it reasonable per post.
 */
const MAX_BYTES = 512 * 1024;

/**
 * The widest a frame is ever drawn.
 *
 * The largest avatar in the app is the profile's 84px, and the art spans
 * twice the avatar before scale. Times three for a phone's pixel ratio,
 * and a PNG wants about 500px square at scale 1 — so 1024 covers being
 * scaled up later, which is the whole point of the placer.
 */
const PNG_IDEAL = 1024;
/** Below this a PNG will visibly soften on a profile. */
const PNG_MIN = 512;

/**
 * The cosmetics desk.
 *
 * Two jobs. Upload a frame and say where it sits over an avatar — which is
 * the whole reason this page exists, because a design exported a few
 * percent off should be nudged here rather than in Figma. And edit anything
 * already in the catalogue, so changing a name or retiring an item stops
 * being a database migration.
 *
 * The 24px preview is the one that matters. A frame that only works large
 * is the usual failure, and a comment row is where most people will meet it.
 */
export function CosmeticsAdmin({
  products,
  bucketBase,
  preview,
}: {
  products: ProductRow[];
  bucketBase: string;
  preview: { avatarUrl: string | null; hue: number; name: string };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(products);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The frame being made or edited.
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [tier, setTier] = useState<"free" | "premium">("premium");
  const [place, setPlace] = useState<Placement>({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 });
  const set = (patch: Partial<Placement>) => setPlace((p) => ({ ...p, ...patch }));
  /** A local object URL while placing, so there is nothing to undo if you give up. */
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const taken = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const idClash = id.length > 0 && taken.has(id) && savedPath === null;

  /**
   * SVG or PNG.
   *
   * A PNG does not become an SVG by being uploaded — it stays pixels, and
   * the placer can scale it up past what it has. That is the only real
   * difference between the two here, so the form measures a PNG and says
   * so rather than letting a soft frame reach a profile unnoticed.
   */
  function choose(file: File | undefined) {
    setNote(null);
    if (!file) return;
    const png = file.type === "image/png" || /\.png$/i.test(file.name);
    const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!png && !svg) {
      return setNote("Frames have to be SVG or PNG.");
    }
    if (file.size > MAX_BYTES) {
      return setNote(`That is ${Math.round(file.size / 1024)}KB. The cap is ${MAX_BYTES / 1024}KB.`);
    }
    const url = URL.createObjectURL(file);
    setDraftFile(file);
    setDraftUrl(url);
    setSavedPath(null);
    if (!id) {
      setId(`deco-${file.name.replace(/\.(svg|png)$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`);
    }
    if (png) measure(url);
  }

  /**
   * How big the pixels actually are.
   *
   * Only a warning: a small PNG still publishes, because a frame meant
   * for comment rows may genuinely not need more, and that is a judgement
   * about the artwork rather than a rule the form should enforce.
   */
  function measure(url: string) {
    const img = new Image();
    img.onload = () => {
      const dims = `${img.naturalWidth}×${img.naturalHeight}`;
      // Shape first: the art box is square, so a wider-than-tall PNG is
      // stretched into it, which looks worse than softness does.
      if (img.naturalWidth !== img.naturalHeight) {
        setNote(`That PNG is ${dims}. It will be stretched to a square — crop it square first.`);
      } else if (img.naturalWidth < PNG_MIN) {
        setNote(
          `That PNG is ${dims}. It will soften on a profile — ${PNG_IDEAL}px square is the ` +
            `comfortable size. An SVG has no such limit.`,
        );
      }
    };
    img.src = url;
  }

  async function publish() {
    setNote(null);
    if (!draftFile) return setNote("Pick a file first.");
    if (!/^[a-z0-9-]{3,40}$/.test(id)) return setNote("The id has to be 3–40 characters of a–z, 0–9 and dashes.");
    if (idClash) return setNote(`${id} already exists. Pick another id, or edit it below.`);
    if (!label.trim()) return setNote("Give it a name.");

    setBusy(true);
    // A new path each time, so a replaced frame is not served from a cache
    // that has the old one.
    // The file's own type, not a hardcoded one: the bucket's allowlist
    // checks what is declared, so a PNG sent as image/svg+xml is refused
    // — and would render as a broken image even if it were not.
    const png = draftFile.type === "image/png" || /\.png$/i.test(draftFile.name);
    const path = `frames/${id}-${Date.now()}.${png ? "png" : "svg"}`;
    const up = await supabase.storage.from("cosmetics").upload(path, draftFile, {
      contentType: png ? "image/png" : "image/svg+xml",
      cacheControl: "31536000",
    });
    if (up.error) {
      setBusy(false);
      return setNote(`Upload refused: ${up.error.message}`);
    }
    const { error } = await supabase.rpc("admin_save_frame", {
      p_id: id,
      p_name: label.trim(),
      p_tier: tier,
      p_asset_path: path,
      p_scale: place.scale,
      p_offset_x: place.offsetX,
      p_offset_y: place.offsetY,
      p_rotation: place.rotation,
    });
    setBusy(false);
    if (error) return setNote(`Could not save: ${error.message}`);
    setSavedPath(path);
    setNote(`${label} is live. It is in the Marketplace now.`);
    setRows((prev) => {
      const row: ProductRow = {
        id, kind: "avatar_decoration", tier, name: label.trim(), price_paise: null,
        active: true, sort: 999, asset_path: path, scale: place.scale,
        offset_x: place.offsetX, offset_y: place.offsetY, rotation: place.rotation,
      };
      return prev.some((r) => r.id === id) ? prev.map((r) => (r.id === id ? row : r)) : [...prev, row];
    });
  }

  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  /**
   * Move one place within its own kind.
   *
   * Sort is per-kind, so moving is a swap with the neighbour above or
   * below rather than a renumber of the whole catalogue — which would be
   * sixty-five writes to move one item one place.
   */
  async function move(row: ProductRow, dir: -1 | 1) {
    const siblings = rows.filter((x) => x.kind === row.kind).sort((a, b) => a.sort - b.sort);
    const i = siblings.findIndex((x) => x.id === row.id);
    const swap = siblings[i + dir];
    if (!swap) return;
    setRows((prev) =>
      prev.map((x) =>
        x.id === row.id ? { ...x, sort: swap.sort } : x.id === swap.id ? { ...x, sort: row.sort } : x,
      ),
    );
    const a = await supabase.rpc("admin_update_product", { p_id: row.id, p_sort: swap.sort });
    const b = await supabase.rpc("admin_update_product", { p_id: swap.id, p_sort: row.sort });
    if (a.error || b.error) setNote("Could not reorder.");
  }

  async function update(row: ProductRow, patch: Partial<ProductRow>) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await supabase.rpc("admin_update_product", {
      p_id: row.id,
      // Omitted arguments default to NULL, which the function reads as "unchanged".
      p_name: patch.name ?? undefined,
      p_tier: patch.tier ?? undefined,
      p_sort: patch.sort ?? undefined,
      p_active: patch.active ?? undefined,
    });
    if (error) {
      setNote(`Could not save: ${error.message}`);
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    }
  }

  /**
   * Move a frame that is already published.
   *
   * Its own RPC rather than admin_save_frame. That one is an upsert, so
   * going through it would re-send the name and the tier — overwriting a
   * rename made meanwhile, and failing outright on a frame somebody had
   * moved to the Shop tier, which placing has no business caring about.
   */
  async function savePlacement(row: ProductRow, next: Placement): Promise<boolean> {
    setNote(null);
    const { error } = await supabase.rpc("admin_place_frame", {
      p_id: row.id,
      p_scale: next.scale,
      p_offset_x: next.offsetX,
      p_offset_y: next.offsetY,
      p_rotation: next.rotation,
    });
    if (error) {
      setNote(`Could not move ${row.name}: ${error.message}`);
      return false;
    }
    setRows((prev) =>
      prev.map((x) =>
        x.id === row.id
          ? { ...x, scale: next.scale, offset_x: next.offsetX, offset_y: next.offsetY, rotation: next.rotation }
          : x,
      ),
    );
    setNote(`${row.name} sits where you put it. Everyone wearing it sees the change.`);
    return true;
  }

  const shown = draftUrl ?? (savedPath ? `${bucketBase}${savedPath}` : null);

  return (
    <div className="flex flex-col gap-6 px-4 pb-24 pt-3 lg:px-6">
      {note && (
        <p role="status" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          {note}
        </p>
      )}

      {/* ── Upload and place ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-extrabold">New frame</h2>
        <p className="-mt-1 text-xs text-muted">
          A square SVG, or a PNG of at least {PNG_IDEAL}px. The avatar sits in the middle third;
          your art can use the whole square and will reach half an avatar past it on every side.
          Colours have to be in the file — an uploaded frame cannot read the theme. A PNG stays
          pixels, so it softens if you scale it up past what it has; an SVG never does.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept=".svg,.png,image/svg+xml,image/png"
          onChange={(e) => choose(e.target.files?.[0])}
          className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-bold file:text-accent-ink"
        />

        {shown && (
          // Two columns once there is room: the thing you are dragging and
          // the thing you are judging it by, side by side rather than one
          // scrolled off the top of the other.
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 lg:grid-cols-[440px_minmax(260px,360px)] lg:justify-start">
            <div className="flex flex-col gap-3">
              <FramePlacer
                src={shown}
                value={place}
                onChange={setPlace}
                avatar={{ url: preview.avatarUrl, hue: preview.hue, name: preview.name }}
                stage={420}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Slider label="Size" value={place.scale} min={LIMITS.scale[0]} max={LIMITS.scale[1]} step={0.01} onChange={(v) => set({ scale: v })} />
                <Slider label="Turn" value={place.rotation} min={LIMITS.rotation[0]} max={LIMITS.rotation[1]} step={1} onChange={(v) => set({ rotation: v })} />
                <Slider label="Left / right" value={place.offsetX} min={LIMITS.offset[0]} max={LIMITS.offset[1]} step={0.005} onChange={(v) => set({ offsetX: v })} />
                <Slider label="Up / down" value={place.offsetY} min={LIMITS.offset[0]} max={LIMITS.offset[1]} step={0.005} onChange={(v) => set({ offsetY: v })} />
              </div>
              <button
                type="button"
                onClick={() => setPlace({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })}
                className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted"
              >
                Reset placement
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Id" value={id} onChange={setId} mono placeholder="deco-something" />
                <Field label="Name" value={label} onChange={setLabel} placeholder="Something" />
              </div>
              {idClash && <p className="text-xs text-danger">{id} is taken. Edit it below instead.</p>}

              <div className="flex flex-wrap items-center gap-2">
                {(["free", "premium"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    aria-pressed={tier === t}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      tier === t ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <span className="text-[11px] text-faint">Paid frames wait for payments to go live.</span>
              </div>

              <button
                type="button"
                onClick={publish}
                disabled={busy}
                className="h-11 rounded-xl bg-accent text-sm font-extrabold text-accent-ink transition active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
              </div>
            </div>

              {/* The answer to "will this do?", which is never the stage —
                  the stage is big and a comment row is 24 pixels. */}
              <div className="rounded-xl border border-border bg-elevated p-4 lg:w-fit">
                <p className="pb-3 text-xs font-bold tracking-widest text-faint uppercase">As people see it</p>
                <PreviewRow src={shown} place={place} preview={preview} />
              </div>
          </div>
        )}
      </section>

      {/* ── Everything in the catalogue, on three shelves ────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-extrabold">Catalogue</h2>
          <span className="text-xs text-faint">{rows.length} items</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find…"
            className="ml-auto h-8 w-32 rounded-lg border border-white/5 bg-white/[0.06] px-2.5 text-xs outline-none placeholder:text-faint focus:border-white/25"
          />
        </div>

        {SECTIONS.map((section) => {
          const inSection = rows
            .filter((x) => section.holds(x.kind))
            .filter(
              (x) =>
                !q.trim() ||
                `${x.name} ${x.id} ${KIND_LABEL[x.kind] ?? x.kind}`.toLowerCase().includes(q.trim().toLowerCase()),
            )
            // Kinds cluster, then each kind keeps its own order.
            .sort((a, b) => a.kind.localeCompare(b.kind) || a.sort - b.sort);
          if (inSection.length === 0) return null;
          return (
            <div key={section.id} className="flex flex-col gap-1.5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-x-4">
              <p className="flex items-baseline gap-2 pt-1 text-xs font-bold tracking-widest text-faint uppercase lg:sticky lg:top-3">
                {section.label}
                <span className="font-mono text-[10px] normal-case tracking-normal">
                  {inSection.filter((x) => x.active).length}/{inSection.length} live
                </span>
              </p>

              <div className="flex flex-col gap-1.5">
              {inSection.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-xl border border-border bg-surface ${row.active ? "" : "opacity-55"}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(open === row.id ? null : row.id)}
                    aria-expanded={open === row.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.name}</span>
                      <span className="block truncate font-mono text-[10px] text-faint">
                        {KIND_LABEL[row.kind] ?? row.kind} · {row.tier}
                        {row.asset_path ? " · uploaded" : " · drawn"}
                        {row.active ? "" : " · retired"}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-xs text-faint">
                      {open === row.id ? "−" : "Edit"}
                    </span>
                  </button>

                  {open === row.id && (
                    <div className="flex flex-col gap-2.5 border-t border-border px-3 py-3">
                      <CommitField label="Name" value={row.name} onCommit={(v) => update(row, { name: v })} />

                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted">Tier</span>
                        <div className="flex gap-1.5">
                          {TIERS.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => update(row, { tier: t })}
                              aria-pressed={row.tier === t}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                                row.tier === t
                                  ? "border-accent bg-accent text-accent-ink"
                                  : "border-border bg-surface text-foreground"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        {row.tier === "shop" && (
                          <span className="text-[11px] text-faint">
                            Nobody can buy a Shop item until payments go live.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="mr-auto text-xs text-muted">Order in {KIND_LABEL[row.kind] ?? row.kind}s</span>
                        <button
                          type="button"
                          onClick={() => move(row, -1)}
                          aria-label="Move up"
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(row, 1)}
                          aria-label="Move down"
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => update(row, { active: !row.active })}
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold"
                        >
                          {row.active ? "Retire" : "Restore"}
                        </button>
                      </div>

                      {row.asset_path ? (
                        // Keyed on the row, so opening a different frame
                        // mounts a fresh draft from that row's numbers
                        // rather than carrying the last one over.
                        <FramePlacement
                          key={row.id}
                          url={`${bucketBase}${row.asset_path}`}
                          saved={{
                            scale: row.scale,
                            offsetX: row.offset_x,
                            offsetY: row.offset_y,
                            rotation: row.rotation,
                          }}
                          preview={preview}
                          onSave={(next) => savePlacement(row, next)}
                        />
                      ) : (
                        <p className="text-[11px] text-faint">
                          Drawn in code, so there is no artwork to move. Its shape lives in
                          AvatarFrame.
                        </p>
                      )}

                      <p className="font-mono text-[10px] text-faint">{row.id}</p>
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/**
 * A field that saves when you leave it, not as you type.
 *
 * The upload form's Field reports every keystroke, which is right there —
 * nothing is written until Publish. Here each change is a database write,
 * so reporting per keystroke would be one write per letter of a rename.
 */
function CommitField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (s: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // The row can change under us — another edit, a reorder — so follow it
  // whenever this field is not the thing being edited.
  const [focused, setFocused] = useState(false);
  if (!focused && draft !== value) setDraft(value);

  const commit = () => {
    setFocused(false);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className="h-10 w-full rounded-xl border border-white/5 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-faint focus:border-white/25"
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        className={`h-10 w-full rounded-xl border border-white/5 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-faint focus:border-white/25 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
