"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, Eye, FileText, Images } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Plane } from "@/components/ui/Plane";
import { CameraCapture, type Captured } from "@/components/messages/CameraCapture";
import { ALBUM_CAPTION_MAX, ALBUM_MAX_ITEMS, type AlbumItem } from "@/lib/chat-album";
import { cameraLikelyAllowed, cameraSupported, openCamera, stopStream } from "@/lib/camera";
import { BLANK_POSTER } from "@/lib/blank-poster";

/** What the chat can ask of the picker from outside it: the paperclip's
 *  hold menu opens the camera directly, or adds gallery picks. */
export type MediaPickerApi = { addFiles: (files: File[]) => void; openCamera: () => void };

/** Something you can send from the picker: a file from this device, or a
 *  photo already in the chat (which needs no upload). */
export type PickEntry = {
  key: string;
  type: "image" | "video";
  /** What the tile draws. */
  preview: string;
  file?: File;
  url?: string;
};

const MAX_PHOTO_MB = 10;
const MAX_VIDEO_MB = 50;

/**
 * The sheet the paperclip opens: your live camera in the top-left, photos
 * from this chat and ones you've picked, and a Gallery tile for the rest of
 * the phone. The tabs underneath step aside for a caption and a send button
 * as soon as anything is picked.
 *
 * A web page can't list the phone's gallery, which is why the grid is this
 * chat's photos plus your picks rather than the camera roll.
 */
export function MediaPicker({
  open,
  onClose,
  recents,
  onSend,
  onFile,
  onGif,
  onViewOnce,
  onRejected,
  apiRef,
}: {
  open: boolean;
  onClose: () => void;
  /** Photos and videos already in this chat, newest first. */
  recents: AlbumItem[];
  onSend: (entries: PickEntry[], caption: string) => void;
  onFile: () => void;
  onGif: () => void;
  onViewOnce: () => void;
  /** Some picked files couldn't be added; says why. */
  onRejected: (message: string) => void;
  apiRef?: React.Ref<MediaPickerApi>;
}) {
  const [picked, setPicked] = useState<PickEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [camera, setCamera] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);

  const fromChat: PickEntry[] = recents.map((r) => ({ key: r.url, type: r.type, preview: r.url, url: r.url }));
  const entries = [...picked, ...fromChat.filter((c) => !picked.some((p) => p.key === c.key))];
  const byKey = new Map(entries.map((e) => [e.key, e]));

  function toggle(key: string) {
    setSelected((s) => {
      if (s.includes(key)) return s.filter((k) => k !== key);
      if (s.length >= ALBUM_MAX_ITEMS) {
        onRejected(`Up to ${ALBUM_MAX_ITEMS} at a time.`);
        return s;
      }
      return [...s, key];
    });
  }

  function addFiles(files: File[]) {
    const added: PickEntry[] = [];
    let skipped = 0;
    for (const file of files) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if ((!isVideo && !isImage) || file.size > (isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB) * 1024 * 1024) {
        skipped++;
        continue;
      }
      added.push({
        key: `file-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        type: isVideo ? "video" : "image",
        preview: URL.createObjectURL(file),
        file,
      });
    }
    if (skipped) onRejected(`Photos up to ${MAX_PHOTO_MB}MB and videos up to ${MAX_VIDEO_MB}MB can be sent.`);
    if (!added.length) return;
    setPicked((p) => [...added, ...p]);
    setSelected((s) => [...added.map((a) => a.key), ...s].slice(0, ALBUM_MAX_ITEMS));
  }

  function finish(chosen: PickEntry[], text: string) {
    onSend(chosen, text.slice(0, ALBUM_CAPTION_MAX));
    // What was sent from this device now belongs to the message on screen.
    const sentKeys = new Set(chosen.map((c) => c.key));
    setPicked((p) => p.filter((e) => !sentKeys.has(e.key)));
    setSelected([]);
    setCaption("");
    onClose();
  }

  function sendSelected() {
    const chosen = selected.map((k) => byKey.get(k)).filter((e): e is PickEntry => !!e);
    if (chosen.length) finish(chosen, caption);
  }

  function sendCaptured(shot: Captured, text: string) {
    setCamera(false);
    finish([{ key: `cam-${Date.now()}`, type: shot.type, preview: shot.preview, file: shot.file }], text);
  }

  useImperativeHandle(apiRef, () => ({ addFiles, openCamera: () => setCamera(true) }));

  const count = selected.length;

  const tabs = (
    <div className="flex h-[58px] items-center justify-around" data-picker-tabs>
      {[
        { label: "Photos", icon: <Images size={19} />, on: true, run: () => {} },
        { label: "File", icon: <FileText size={19} />, run: () => { onClose(); onFile(); } },
        { label: "GIF", icon: <span className="text-[10px] font-black tracking-wider">GIF</span>, run: () => { onClose(); onGif(); } },
        { label: "View once", icon: <Eye size={19} />, run: () => { onClose(); onViewOnce(); } },
      ].map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={t.run}
          aria-current={t.on ? "true" : undefined}
          className={`flex flex-col items-center gap-1 text-[10.5px] font-semibold ${t.on ? "text-foreground" : "text-muted"}`}
        >
          <span className={`grid h-8 w-11 place-items-center rounded-xl ${t.on ? "bg-accent/15 text-accent" : ""}`}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );

  const sendBar = (
    <div className="flex h-[58px] items-center gap-2">
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, ALBUM_CAPTION_MAX))}
        onKeyDown={(e) => e.key === "Enter" && sendSelected()}
        placeholder="Add a caption…"
        aria-label="Caption"
        maxLength={ALBUM_CAPTION_MAX}
        className="h-11 min-w-0 flex-1 rounded-2xl bg-surface px-4 text-sm outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={sendSelected}
        aria-label={`Send ${count}`}
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink active:scale-90"
      >
        <Plane size={18} weight="fill" />
        <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white px-1 text-[10px] font-extrabold text-black">
          {count}
        </span>
      </button>
    </div>
  );

  return (
    <>
      <BottomSheet open={open && !camera} onClose={onClose} size="half" footer={count ? sendBar : tabs}>
        <div className="-mx-5 grid grid-cols-3 gap-[2px]" style={{ gridAutoRows: "calc((min(100vw, 480px) - 4px) / 3)" }} data-picker-grid>
          <LiveTile active={open && !camera} onOpen={() => setCamera(true)} />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 bg-surface text-[12px] font-semibold text-foreground active:bg-border"
          >
            <Images size={24} className="text-accent" />
            Gallery
          </button>
          {entries.length === 0 && (
            <p className="col-span-2 flex items-center px-4 text-[13px] leading-snug text-muted" data-picker-empty>
              Photos and videos shared in this chat show up here. Tap Gallery for the rest of your phone.
            </p>
          )}
          {entries.map((e) => {
            const at = selected.indexOf(e.key);
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => toggle(e.key)}
                aria-pressed={at >= 0}
                aria-label={e.type === "video" ? "Video" : "Photo"}
                className="relative overflow-hidden bg-surface"
              >
                {e.type === "video" ? (
                  <video poster={BLANK_POSTER} src={`${e.preview}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.preview} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                )}
                {at >= 0 && <span className="pointer-events-none absolute inset-0 bg-black/20 ring-2 ring-inset ring-accent" />}
                <span
                  className={`absolute right-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-[11px] font-extrabold ${
                    at >= 0 ? "border-accent bg-accent text-accent-ink" : "border-white/90 bg-black/15"
                  }`}
                >
                  {at >= 0 ? at + 1 : ""}
                </span>
                {e.type === "video" && (
                  <svg className="absolute bottom-1.5 left-1.5" width="12" height="12" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                    <path d="M7 4v16l13-8z" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          data-gallery-input
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </BottomSheet>

      {camera && <CameraCapture onClose={() => setCamera(false)} onSend={sendCaptured} />}
    </>
  );
}

/**
 * The top-left tile. Live once the camera has been allowed (see
 * cameraLikelyAllowed); before that a plain camera, so opening the sheet
 * never pops a permission prompt on its own.
 */
function LiveTile({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!active || !cameraSupported()) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!(await cameraLikelyAllowed()) || cancelled) return;
      try {
        stream = await openCamera("environment", false);
        if (cancelled) return stopStream(stream);
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setLive(true);
      } catch {
        /* stays a plain camera tile */
      }
    })();
    return () => {
      cancelled = true;
      stopStream(stream);
      setLive(false);
    };
  }, [active]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Camera"
      data-camera-tile
      className="relative row-span-2 overflow-hidden bg-black"
    >
      <video poster={BLANK_POSTER} ref={videoRef} muted playsInline autoPlay className={`h-full w-full object-cover ${live ? "" : "hidden"}`} />
      {!live && (
        <span className="absolute inset-0 grid place-content-center justify-items-center gap-2 text-[12px] font-semibold text-white/80">
          <Camera size={28} />
          Camera
        </span>
      )}
      {live && (
        <>
          <span className="pointer-events-none absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white">
            <Camera size={16} />
          </span>
          <span className="pointer-events-none absolute bottom-3 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border-[3px] border-white" />
        </>
      )}
    </button>
  );
}
