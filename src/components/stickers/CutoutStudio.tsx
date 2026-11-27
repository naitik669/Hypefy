"use client";

/**
 * The cutout sticker studio (DM sticker plan T2; design canvas Final board 3,
 * shape D from board 6 — see src/lib/cutout/studio-layout.ts).
 *
 * Pick a photo → the background is removed by itself → the cut fills the
 * screen → Edit corrects it by painting with a finger (Keep / Erase / Undo /
 * Start again, brush size) → Stroke or Clean → Send or Save.
 *
 * Every control is a round button or pill floating on the picture with a
 * blur behind it; nothing is docked below the photo, so the photo keeps the
 * whole screen. A sticker has no name: there is no field for one.
 *
 * Web only for now: the cut is done by the server (/api/stickers/cutout), with
 * an on-device WebAssembly model as the fallback. The Expo app could call the
 * same route, but has no studio screen yet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X, ChevronLeft, Check, Paintbrush, Eraser, Undo2, RotateCcw, Eye, Camera, Image as ImageIcon, Loader2, Square } from "lucide-react";
import { CutoutEngine, decodePhoto, exportSticker, serverCut, type Photo } from "@/lib/cutout/engine";
import { cutWithFallback } from "@/lib/cutout/cut";
import { applyMaskAlpha, keptBounds, paintSegment, MaskHistory, type Rect } from "@/lib/cutout/mask";
import { MODEL_BYTES, type Progress } from "@/lib/cutout/model-loader";
import { STUDIO_LAYOUT, stageAfterCut, type StudioLayout } from "@/lib/cutout/studio-layout";
import type { EncodedSticker } from "@/lib/cutout/encode";

export type StickerEdge = "stroke" | "clean";

export type StudioResult = EncodedSticker & { edge: StickerEdge };

type Stage = "pick" | "cutting" | "cut" | "edit" | "failed";
type Tool = "keep" | "erase";

/** The white sticker outline, the same filter the thread draws it with. */
const STROKE_FILTER =
  "drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff)";

const BRUSH_MIN = 8;
const BRUSH_MAX = 64;
const BRUSH_DEFAULT = 24;

const glass = "bg-[rgba(10,10,10,0.6)] backdrop-blur-[10px] text-white";
const roundBtn = `flex h-[46px] w-[46px] items-center justify-center rounded-full ${glass} transition-colors disabled:opacity-40`;
const pill = `inline-flex h-[34px] items-center gap-2 rounded-full px-[13px] text-[12px] font-bold ${glass}`;

function mb(n: number) {
  return Math.round(n / (1024 * 1024));
}

export function CutoutStudio({
  onClose,
  onSend,
  onSave,
  sendLabel = "Send",
  layout = STUDIO_LAYOUT,
}: {
  onClose: () => void;
  /** Absent when the studio was opened outside a chat: then only Save shows. */
  onSend?: (r: StudioResult) => Promise<void>;
  onSave: (r: StudioResult) => Promise<void>;
  sendLabel?: string;
  layout?: StudioLayout;
}) {
  const engineRef = useRef<CutoutEngine | null>(null);
  const [download, setDownload] = useState<Progress | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [cutMs, setCutMs] = useState<number | null>(null);
  const [empty, setEmpty] = useState(false);
  const [edge, setEdge] = useState<StickerEdge>("stroke");
  const [tool, setTool] = useState<Tool>("keep");
  const [brush, setBrush] = useState(BRUSH_DEFAULT);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState<"send" | "save" | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  /** What the cut kept, so the cut view can fill the screen with it. */
  const [subject, setSubject] = useState<Rect | null>(null);

  const photoRef = useRef<Photo | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const autoMaskRef = useRef<Uint8ClampedArray | null>(null);
  const displayRef = useRef<ImageData | null>(null);
  const historyRef = useRef(new MaskHistory());
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const cutCanvasRef = useRef<HTMLCanvasElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // The device model is only the fallback now (the server cuts first), so
  // nothing is downloaded up front; it is made, and its 46 MB fetched, only
  // if a cut has to fall back to it.
  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /** Redraw the cutout canvas, all of it or just the rectangle a stroke touched. */
  const redraw = useCallback((rect?: Rect) => {
    const photo = photoRef.current;
    const mask = maskRef.current;
    const display = displayRef.current;
    const ctx = cutCanvasRef.current?.getContext("2d");
    if (!photo || !mask || !display || !ctx) return;
    const r = rect ?? { x: 0, y: 0, w: photo.w, h: photo.h };
    applyMaskAlpha(display.data, mask, photo.w, r);
    ctx.putImageData(display, 0, 0, r.x, r.y, r.w, r.h);
  }, []);

  const runCut = useCallback(
    async (file: File) => {
      setError(null);
      setEmpty(false);
      setCutMs(null);
      setView({ scale: 1, tx: 0, ty: 0 });
      historyRef.current.clear();
      setUndoCount(0);
      let photo: Photo;
      try {
        photo = await decodePhoto(file);
      } catch {
        setError("That file isn't a photo this browser can open.");
        setStage("failed");
        return;
      }
      photoRef.current = photo;
      setDims({ w: photo.w, h: photo.h });
      setStage("cutting");
      // Draw the photo straight away so the wait has something to look at.
      requestAnimationFrame(() => {
        for (const c of [photoCanvasRef.current, cutCanvasRef.current]) {
          if (!c) continue;
          c.width = photo.w;
          c.height = photo.h;
        }
        photoCanvasRef.current
          ?.getContext("2d")
          ?.putImageData(new ImageData(new Uint8ClampedArray(photo.rgba), photo.w, photo.h), 0, 0);
      });
      try {
        const t0 = performance.now();
        const { mask } = await cutWithFallback(photo, {
          server: serverCut,
          device: () => (engineRef.current ??= new CutoutEngine()),
          onProgress: (p) => setDownload(p),
        });
        setEngineReady(true);
        setCutMs(performance.now() - t0);
        maskRef.current = mask;
        autoMaskRef.current = mask.slice();
        displayRef.current = new ImageData(new Uint8ClampedArray(photo.rgba), photo.w, photo.h);
        redraw();
        const kept = keptBounds(mask, photo.w, photo.h);
        const nothing = kept === null;
        setSubject(kept);
        setEmpty(nothing);
        // An empty cut goes straight to the brush: there is nothing to admire.
        setStage(nothing ? "edit" : stageAfterCut(layout));
      } catch {
        setError("The cutter couldn't start. Check your connection and try again.");
        setStage("failed");
      }
    },
    [layout, redraw],
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void runCut(file);
  };

  // ---- painting and pinching ------------------------------------------------

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stroke = useRef<{ last: { x: number; y: number } } | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; view: typeof view } | null>(null);

  /** A screen point → a pixel position in the photo, through any zoom. */
  const toImage = (clientX: number, clientY: number) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const photo = photoRef.current;
    if (!frame || !photo || frame.width === 0) return null;
    const k = photo.w / frame.width;
    return { x: (clientX - frame.left) * k, y: (clientY - frame.top) * k, k };
  };

  const paintTo = (clientX: number, clientY: number) => {
    const p = toImage(clientX, clientY);
    const mask = maskRef.current;
    const photo = photoRef.current;
    if (!p || !mask || !photo || !stroke.current) return;
    const rect = paintSegment(mask, photo.w, photo.h, stroke.current.last, p, (brush / 2) * p.k, tool === "keep" ? 255 : 0);
    stroke.current.last = { x: p.x, y: p.y };
    if (rect) redraw(rect);
  };

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage === "cut") {
      // Shape D: holding the picture shows the original under the cut.
      setComparing(true);
      return;
    }
    if (stage !== "edit") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (a synthetic one, an old WebView);
      // painting still follows the finger while it stays on the picture.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const p = toImage(e.clientX, e.clientY);
      const mask = maskRef.current;
      if (!p || !mask) return;
      historyRef.current.push(mask);
      setUndoCount(historyRef.current.size);
      stroke.current = { last: { x: p.x, y: p.y } };
      paintTo(e.clientX, e.clientY);
      setCursor({ x: e.clientX, y: e.clientY });
    } else if (pointers.current.size === 2) {
      // A second finger means pinch, not paint: take back the dab the first
      // finger made before the second one landed.
      if (stroke.current) {
        const before = historyRef.current.pop();
        if (before) maskRef.current = before;
        setUndoCount(historyRef.current.size);
        stroke.current = null;
        redraw();
      }
      setCursor(null);
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view };
    }
  };

  const onStageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== "edit" || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (stroke.current && pointers.current.size === 1) {
      paintTo(e.clientX, e.clientY);
      setCursor({ x: e.clientX, y: e.clientY });
    } else if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const start = pinch.current;
      const scale = Math.min(6, Math.max(1, start.view.scale * (d / Math.max(start.d, 1))));
      setView({
        scale,
        tx: start.view.tx + ((a.x + b.x) / 2 - start.mx),
        ty: start.view.ty + ((a.y + b.y) / 2 - start.my),
      });
    }
  };

  const onStageUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    setComparing(false);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      stroke.current = null;
      setCursor(null);
      const photo = photoRef.current;
      if (photo && maskRef.current) {
        const kept = keptBounds(maskRef.current, photo.w, photo.h);
        setSubject(kept);
        setEmpty(kept === null);
      }
    }
  };

  const undo = () => {
    const before = historyRef.current.pop();
    if (!before) return;
    maskRef.current = before;
    setUndoCount(historyRef.current.size);
    redraw();
    const photo = photoRef.current;
    if (photo) {
        const kept = keptBounds(before, photo.w, photo.h);
        setSubject(kept);
        setEmpty(kept === null);
      }
  };

  const startAgain = () => {
    const auto = autoMaskRef.current;
    const mask = maskRef.current;
    const photo = photoRef.current;
    if (!auto || !mask || !photo) return;
    historyRef.current.push(mask);
    setUndoCount(historyRef.current.size);
    maskRef.current = auto.slice();
    setView({ scale: 1, tx: 0, ty: 0 });
    redraw();
    {
        const kept = keptBounds(auto, photo.w, photo.h);
        setSubject(kept);
        setEmpty(kept === null);
      }
  };

  const finish = async (action: "send" | "save") => {
    const photo = photoRef.current;
    const mask = maskRef.current;
    if (!photo || !mask || busy) return;
    setBusy(action);
    setError(null);
    try {
      const sticker = await exportSticker(photo, mask);
      if (!sticker) {
        setEmpty(true);
        return;
      }
      const result = { ...sticker, edge };
      if (action === "send" && onSend) await onSend(result);
      else await onSave(result);
    } catch {
      setError(action === "send" ? "Couldn't send that sticker. Try again." : "Couldn't save that sticker. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // ---- layout ---------------------------------------------------------------

  const editing = stage === "edit";
  // The picture is fitted to the whole screen while editing, and kept clear
  // of the top bar and the bottom buttons when it is being looked at.
  const inset = editing ? { top: 0, bottom: 0, side: 0 } : { top: 72, bottom: stage === "cut" ? 176 : 96, side: 10 };
  const frame = useMemo(() => {
    if (!dims || box.w === 0) return null;
    const aw = box.w - inset.side * 2;
    const ah = box.h - inset.top - inset.bottom;
    // Looking at the cut, the kept part fills the space rather than the
    // whole photo, so a subject in one corner of a wide shot is still big.
    // Capped at 3x so a tiny subject is not blown up into mush.
    const focus = stage === "cut" && subject ? subject : { x: 0, y: 0, w: dims.w, h: dims.h };
    const s = Math.min(aw / focus.w, ah / focus.h, (Math.min(aw / dims.w, ah / dims.h)) * 3);
    return {
      left: inset.side + (aw - focus.w * s) / 2 - focus.x * s,
      top: inset.top + (ah - focus.h * s) / 2 - focus.y * s,
      w: dims.w * s,
      h: dims.h * s,
    };
  }, [dims, box.w, box.h, inset.side, inset.top, inset.bottom, stage, subject]);

  const progress = download && !engineReady ? `${mb(download.loaded)} of ${mb(download.total || MODEL_BYTES)} MB` : null;
  const canSend = !empty && busy === null;
  const sendBtnLabel = onSend ? sendLabel : "Save to my stickers";
  const primary: "send" | "save" = onSend ? "send" : "save";

  return (
    <div className="fixed inset-0 z-[70] select-none overflow-hidden bg-background text-white" style={{ touchAction: "none" }}>
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {/* The picture: edge to edge, under the bar and behind every control. */}
      <div
        ref={stageRef}
        className="absolute inset-0 overflow-hidden"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageUp}
        onPointerLeave={(e) => stage === "cut" && onStageUp(e)}
      >
        {stage !== "pick" && (
          <div className="sticker-checker absolute inset-0" aria-hidden="true" />
        )}
        <div
          ref={frameRef}
          className="absolute"
          style={
            frame
              ? {
                  left: frame.left,
                  top: frame.top,
                  width: frame.w,
                  height: frame.h,
                  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                  transformOrigin: "center",
                  transition: "left .25s, top .25s, width .25s, height .25s",
                }
              : { display: "none" }
          }
        >
          <canvas
            ref={photoCanvasRef}
            className="absolute inset-0 h-full w-full transition-opacity"
            style={{
              opacity: stage === "cutting" ? 0.9 : comparing ? 1 : editing ? 0.2 : 0,
            }}
            aria-hidden="true"
          />
          <canvas
            ref={cutCanvasRef}
            className="absolute inset-0 h-full w-full transition-opacity"
            style={{
              opacity: stage === "cut" || stage === "edit" ? (comparing ? 0 : 1) : 0,
              filter: stage === "cut" && edge === "stroke" ? STROKE_FILTER : undefined,
            }}
            role="img"
            aria-label="Your sticker"
          />
          {/* While the model works: a scan line sweeping the photo, instead
              of a spinner (Naitik, 27 Nov). Inside the frame, so it covers
              the picture and nothing else. */}
          {stage === "cutting" && (
            <div className="sticker-scan pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <span className="sticker-scan-grid" />
              <span className="sticker-scan-beam" />
            </div>
          )}
        </div>
        {cursor && editing && (
          <span
            className="pointer-events-none absolute rounded-full border-2 border-accent bg-accent/15"
            style={{ left: cursor.x - brush / 2, top: cursor.y - brush / 2, width: brush, height: brush }}
            aria-hidden="true"
          />
        )}
        {stage !== "pick" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] bg-gradient-to-b from-transparent to-[rgba(10,10,10,0.82)]" />
        )}
      </div>

      {/* Top bar, floating. */}
      <div
        className="absolute inset-x-0 z-10 flex h-14 items-center gap-2.5 px-3.5"
        style={{ top: "calc(var(--sat, 0px) + 8px)" }}
      >
        {editing && layout === "D" && !empty ? (
          <button className={`${roundBtn} !h-[38px] !w-[38px] !rounded-[14px]`} aria-label="Back" onClick={() => { setStage("cut"); setView({ scale: 1, tx: 0, ty: 0 }); }}>
            <ChevronLeft size={20} />
          </button>
        ) : (
          <button className={`${roundBtn} !h-[38px] !w-[38px] !rounded-[14px]`} aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        )}
        {stage === "cutting" && !progress && <span className="sr-only" aria-live="polite">Cutting it out</span>}
        <span className={stage === "cutting" && !progress ? "hidden" : pill} aria-live="polite">
          {stage === "pick" && "New sticker"}
          {stage === "cutting" && progress && `Getting the cutter ready · ${progress}`}
          {stage === "cut" && (
            <>
              <Check size={14} className="text-accent" />
              {cutMs !== null ? `Cut in ${(cutMs / 1000).toFixed(1)} s` : "Cut"}
            </>
          )}
          {stage === "edit" && (empty ? "Nothing stood out · paint what to keep" : `Drag to paint · ${tool === "keep" ? "Keep" : "Erase"}`)}
          {stage === "failed" && "Something went wrong"}
        </span>
        {editing && (
          <button
            className="ml-auto h-[38px] rounded-[14px] bg-accent px-4 text-[13.5px] font-extrabold text-accent-ink disabled:opacity-40"
            disabled={layout === "E" ? !canSend : empty}
            onClick={() => (layout === "E" ? void finish(primary) : setStage("cut"))}
          >
            {layout === "E" ? (busy ? "…" : onSend ? "Send" : "Save") : "Done"}
          </button>
        )}
      </div>

      {/* Pick: the web can only receive the one file chosen, so there is no
          grid of recent photos here (board 1 draws one): a page cannot list
          the photo library. The two tiles open the system picker and camera. */}
      {stage === "pick" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <div className="grid w-full max-w-[360px] grid-cols-2 gap-2">
            <button
              className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border border-[#2f2f2f] bg-[#242424] text-[13px] font-extrabold text-[#d8d8d8]"
              onClick={() => pickRef.current?.click()}
            >
              <ImageIcon size={26} />
              Photos
            </button>
            <button
              className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border border-[#2f2f2f] bg-[#242424] text-[13px] font-extrabold text-[#d8d8d8]"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={26} />
              Camera
            </button>
          </div>
          <p className="max-w-[320px] text-center text-[12px] leading-relaxed text-muted">
            The background comes off on this device. Nothing is uploaded until you send or save.
            {progress && <><br />Getting the cutter ready · {progress} (first time only)</>}
          </p>
        </div>
      )}

      {stage === "failed" && (
        <div className="absolute inset-x-4 bottom-0 z-10 flex flex-col gap-3" style={{ paddingBottom: "calc(var(--sab, 0px) + 24px)" }}>
          <p className="text-center text-[13px] font-semibold text-white/85" role="alert">{error}</p>
          <button className="h-[50px] rounded-2xl bg-accent text-[14.5px] font-extrabold text-accent-ink" onClick={() => setStage("pick")}>
            Choose a photo again
          </button>
        </div>
      )}

      {/* Shape D, looking at the cut: Edit and hold-to-compare on the right. */}
      {stage === "cut" && (
        <>
          <div className="absolute right-3.5 z-10 flex flex-col gap-[9px]" style={{ top: "calc(var(--sat, 0px) + 80px)" }}>
            <button className={roundBtn} aria-label="Edit the cut" onClick={() => setStage("edit")}>
              <Paintbrush size={20} />
            </button>
            <button
              className={roundBtn}
              aria-label="Hold to see the photo"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
            >
              <Eye size={20} />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 px-4" style={{ paddingBottom: "calc(var(--sab, 0px) + 24px)" }}>
            <EdgeSwitch edge={edge} onChange={setEdge} />
            {error && <p className="text-center text-[12.5px] font-semibold text-white/85" role="alert">{error}</p>}
            <button
              className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-accent text-[14.5px] font-extrabold text-accent-ink disabled:opacity-50"
              disabled={!canSend}
              onClick={() => void finish(primary)}
            >
              {busy === primary && <Loader2 size={16} className="animate-spin" />}
              {sendBtnLabel}
            </button>
            {onSend && (
              <button
                className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-white/[0.14] text-[14.5px] font-extrabold text-white backdrop-blur-[10px] disabled:opacity-50"
                disabled={!canSend}
                onClick={() => void finish("save")}
              >
                {busy === "save" && <Loader2 size={16} className="animate-spin" />}
                Save to my stickers
              </button>
            )}
          </div>
        </>
      )}

      {/* Editing: the brush tools as round buttons floating on the picture. */}
      {editing && (
        <>
          <div className="absolute right-3.5 z-10 flex flex-col gap-[9px]" style={{ top: "calc(var(--sat, 0px) + 80px)" }}>
            <RailButton label="Keep" on={tool === "keep"} onClick={() => setTool("keep")}>
              <Paintbrush size={20} />
            </RailButton>
            <RailButton label="Erase" on={tool === "erase"} onClick={() => setTool("erase")}>
              <Eraser size={20} />
            </RailButton>
            <RailButton label="Undo" disabled={undoCount === 0} onClick={undo}>
              <Undo2 size={20} />
            </RailButton>
            <RailButton label="Start again" onClick={startAgain}>
              <RotateCcw size={20} />
            </RailButton>
            {layout === "E" && (
              <RailButton label={edge === "stroke" ? "Edge: stroke" : "Edge: clean"} on={edge === "stroke"} onClick={() => setEdge(edge === "stroke" ? "clean" : "stroke")}>
                <Square size={20} />
              </RailButton>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 px-4" style={{ paddingBottom: "calc(var(--sab, 0px) + 24px)" }}>
            {error && <p className="mb-2 text-center text-[12.5px] font-semibold text-white/85" role="alert">{error}</p>}
            <label className="flex items-center gap-2.5 text-[11px] font-bold text-white/75">
              Brush
              <input
                type="range"
                min={BRUSH_MIN}
                max={BRUSH_MAX}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
                className="sticker-brush flex-1"
                aria-label="Brush size"
              />
              <span className="w-6 text-right tabular-nums">{brush}</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function RailButton({
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`${roundBtn} ${on ? "!bg-accent !text-accent-ink" : ""}`}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EdgeSwitch({ edge, onChange }: { edge: StickerEdge; onChange: (e: StickerEdge) => void }) {
  return (
    <div className={`flex gap-1 self-center rounded-full p-1 ${glass}`} role="radiogroup" aria-label="Sticker edge">
      {(["stroke", "clean"] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={edge === v}
          className={`h-[34px] rounded-full px-5 text-[12.5px] font-extrabold ${edge === v ? "bg-white text-[#0a0a0a]" : "text-white/70"}`}
          onClick={() => onChange(v)}
        >
          {v === "stroke" ? "Stroke" : "Clean"}
        </button>
      ))}
    </div>
  );
}
