"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, X } from "lucide-react";
import {
  PACK_MAX,
  PACK_MIN,
  checkPackName,
  pickedLabel,
  pickerSources,
  togglePick,
  type PackAudience,
  type PackSource,
  type StickerPack,
} from "@hypefy/core/sticker-packs";
import type { Sticker } from "@hypefy/core/stickers";
import { createClient } from "@/lib/supabase/client";
import { addToPack, createPack, listReceivedStickers } from "@/lib/sticker-pack-store";
import { StickerImage } from "@/components/stickers/StickerImage";
import { PackCover } from "@/components/stickers/PackCover";

const SOURCE_LABEL: Record<PackSource, string> = { yours: "Yours", saved: "Saved", inPacks: "In packs" };

const AUDIENCE_LABEL: Record<PackAudience, string> = {
  link: "Anyone with the link",
  people: "Only people I send it to",
};

/**
 * Making a pack, or adding to one (27 Nov, "Packs & the drawer rail",
 * boards 2 and 3).
 *
 * Only from stickers that already exist: Yours, Saved (sent to you in
 * chats, and your favourites) and In packs. There is no "new sticker" step
 * here. Making one is pick → name and cover → made; adding is the same
 * picker, with what is already in the pack left out.
 *
 * Full screen on the phone, a centred sheet on desktop.
 */
export function PackMaker({
  currentUserId,
  yours,
  favourites,
  packs,
  addTo,
  onMade,
  onClose,
}: {
  currentUserId: string;
  yours: readonly Sticker[];
  favourites: readonly Sticker[];
  /** The packs on your rail: the In packs source. */
  packs: readonly StickerPack[];
  /** Add to this pack instead of making a new one. */
  addTo?: StickerPack;
  /** The pack as the server now has it. */
  onMade: (pack: StickerPack) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [received, setReceived] = useState<Sticker[] | null>(null);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const [source, setSource] = useState<PackSource>("yours");
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "name" | "made">("pick");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<PackAudience>("link");
  const [front, setFront] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<StickerPack | null>(null);

  useEffect(() => {
    let live = true;
    void listReceivedStickers(supabase, currentUserId).then((r) => {
      if (!live) return;
      if (r.ok) setReceived(r.value);
      else setReceivedError(r.error);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the client is recreated each render; the user is what matters
  }, [currentUserId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sources = useMemo(
    () => pickerSources({ yours, favourites, received: received ?? [], packs: packs.filter((p) => p.id !== addTo?.id) }),
    [yours, favourites, received, packs, addTo],
  );
  const already = useMemo(() => new Set(addTo?.stickers.map((s) => s.id) ?? []), [addTo]);
  const room = PACK_MAX - already.size;
  const shown = sources[source].filter((s) => !already.has(s.id));
  const byId = useMemo(() => {
    const m = new Map<string, Sticker>();
    for (const list of Object.values(sources)) for (const s of list) m.set(s.id, s);
    return m;
  }, [sources]);
  const pickedStickers = picked.map((id) => byId.get(id)).filter((s): s is Sticker => !!s);
  const enough = addTo ? picked.length >= 1 : picked.length >= PACK_MIN;

  async function next() {
    setError(null);
    if (!addTo) {
      setStep("name");
      return;
    }
    setBusy(true);
    const res = await addToPack(supabase, addTo.id, picked);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onMade(res.value);
    onClose();
  }

  async function create() {
    const n = checkPackName(name);
    if (!n.ok) return setError(n.error);
    setBusy(true);
    setError(null);
    const res = await createPack(supabase, { name: n.name, audience, stickerIds: picked, coverStickerId: front });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMade(res.value);
    onMade(res.value);
    setStep("made");
  }

  const title = addTo ? `Add to ${addTo.name}` : "New pack";

  const body = (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-background sm:h-[min(720px,90vh)] sm:w-[460px] sm:rounded-3xl sm:border sm:border-border sm:bg-elevated"
      >
        {step === "pick" && (
          <>
            <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
              <button type="button" onClick={onClose} aria-label="Cancel" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-foreground">
                <X size={20} />
              </button>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[15px] font-extrabold">{title}</span>
                <span className="text-[11.5px] font-semibold text-muted">
                  {addTo ? `${picked.length} picked · room for ${room}` : pickedLabel(picked.length)}
                </span>
              </span>
            </header>

            <div role="tablist" aria-label="Where the stickers come from" className="mx-4 mb-2.5 mt-1.5 flex shrink-0 gap-0.5 rounded-[14px] bg-surface p-[3px]">
              {(["yours", "saved", "inPacks"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={source === s}
                  onClick={() => setSource(s)}
                  className={`h-[30px] flex-1 rounded-[11px] text-xs font-bold transition ${source === s ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {source === "saved" && receivedError ? (
                <p className="pt-6 text-center text-sm text-muted">Couldn&apos;t load what people sent you.</p>
              ) : source === "saved" && received === null ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 6 }, (_, i) => <span key={i} className="aspect-square animate-pulse rounded-[14px] bg-white/[0.025]" />)}
                </div>
              ) : shown.length === 0 ? (
                <p className="pt-6 text-center text-xs text-faint">
                  {source === "yours" ? "Stickers you make show up here." : source === "saved" ? "Stickers people send you, and your favourites, show up here." : "Stickers in your packs show up here."}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {shown.map((s) => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        aria-label={on ? "Picked sticker" : "Sticker"}
                        onClick={() => setPicked((p) => togglePick(p, s.id, room))}
                        className={`relative flex aspect-square items-center justify-center rounded-[14px] border-[1.5px] p-1.5 transition ${on ? "border-[#a3e635] bg-[#a3e635]/[0.08]" : "border-transparent bg-white/[0.03]"}`}
                      >
                        <StickerImage sticker={s} box={{ width: 84, height: 84 }} />
                        <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] ${on ? "border-[#a3e635] bg-[#a3e635] text-black" : "border-white/30 bg-black/50"}`}>
                          {on && <Check size={12} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="mx-5 mt-2.5 shrink-0 text-center text-[12px] leading-snug text-muted">
              A sticker can sit in more than one pack. Putting it in a pack never moves it out of Yours.
            </p>
            {error && <p role="alert" className="mx-5 mt-2 shrink-0 text-center text-[12px] text-danger">{error}</p>}
            <div className="shrink-0 px-4 pb-5 pt-3.5">
              <button
                type="button"
                disabled={!enough || busy}
                onClick={() => void next()}
                className="h-12 w-full rounded-2xl bg-foreground text-[14px] font-extrabold text-background transition disabled:opacity-40"
              >
                {addTo ? `Add ${picked.length} sticker${picked.length === 1 ? "" : "s"}` : `Next · ${picked.length} sticker${picked.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {step === "name" && (
          <>
            <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
              <button type="button" onClick={() => { setStep("pick"); setError(null); }} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-foreground">
                <ChevronLeft size={22} />
              </button>
              <span className="text-[15px] font-extrabold">New pack</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex items-center gap-3 px-4 pt-3">
                <PackCover stickers={pickedStickers} coverId={front} size={92} />
                <span className="text-[12px] leading-snug text-muted">The cover is made from the pack. Tap a sticker below to put it in front.</span>
              </div>
              <label htmlFor="pack-name" className="block px-[18px] pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Name</label>
              <input
                id="pack-name"
                value={name}
                maxLength={40}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Soft hours"
                className="mx-4 block h-12 w-[calc(100%-2rem)] rounded-[14px] border border-border bg-surface px-3.5 text-[14.5px] text-foreground outline-none placeholder:text-faint focus:border-white/25"
              />
              <p className="px-[18px] pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Who can add it</p>
              <div role="radiogroup" aria-label="Who can add it" className="mx-4 flex gap-0.5 rounded-[14px] bg-surface p-[3px]">
                {(["link", "people"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={audience === a}
                    onClick={() => setAudience(a)}
                    className={`h-[30px] flex-1 rounded-[11px] text-[11.5px] font-bold transition ${audience === a ? "bg-elevated text-foreground" : "text-muted hover:text-foreground"}`}
                  >
                    {AUDIENCE_LABEL[a]}
                  </button>
                ))}
              </div>
              <p className="px-[18px] pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">In this pack · {pickedStickers.length}</p>
              <div className="grid grid-cols-4 gap-1.5 px-4 pb-2">
                {pickedStickers.map((s) => {
                  const isFront = (front ?? pickedStickers[0]?.id) === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={isFront}
                      aria-label={isFront ? "On the front of the cover" : "Put on the front of the cover"}
                      onClick={() => setFront(s.id)}
                      className={`flex aspect-square items-center justify-center rounded-[14px] p-1.5 transition ${isFront ? "bg-white/[0.10] ring-1 ring-white/25" : "bg-white/[0.03]"}`}
                    >
                      <StickerImage sticker={s} box={{ width: 64, height: 64 }} />
                    </button>
                  );
                })}
              </div>
            </div>
            {error && <p role="alert" className="mx-5 mt-2 shrink-0 text-center text-[12px] text-danger">{error}</p>}
            <div className="shrink-0 px-4 pb-5 pt-3.5">
              <button
                type="button"
                disabled={busy || !checkPackName(name).ok}
                onClick={() => void create()}
                className="h-12 w-full rounded-2xl bg-foreground text-[14px] font-extrabold text-background transition disabled:opacity-40"
              >
                Create pack
              </button>
            </div>
          </>
        )}

        {step === "made" && made && (
          <>
            <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-foreground">
                <X size={20} />
              </button>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[15px] font-extrabold">{made.name}</span>
                <span className="text-[11.5px] font-semibold text-muted">{made.stickers.length} stickers · by you</span>
              </span>
            </header>
            <div className="flex flex-1 flex-col items-center gap-2 px-4 pt-6">
              <PackCover stickers={made.stickers} coverId={made.coverStickerId} size={128} />
              <p className="mt-1.5 text-[20px] font-extrabold">{made.name}</p>
              <span className="text-[12.5px] font-semibold text-muted">It is in your stickers already</span>
            </div>
            <div className="shrink-0 px-4 pb-5 pt-3.5">
              <button type="button" onClick={onClose} className="h-12 w-full rounded-2xl bg-surface text-[14px] font-extrabold text-foreground">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
