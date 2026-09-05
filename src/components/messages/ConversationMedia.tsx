"use client";

import { useState } from "react";
import { FileText, Images, Mic, Play } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ZoomViewer } from "@/components/ui/ZoomViewer";

export type MediaItem = {
  id: string;
  kind: "image" | "video" | "gif" | "document" | "voice";
  url: string;
  name: string | null;
  mine: boolean;
  at: string;
};

type Tab = "media" | "files" | "voice";

const TABS: { id: Tab; label: string; kinds: MediaItem["kind"][] }[] = [
  { id: "media", label: "Media", kinds: ["image", "video", "gif"] },
  { id: "files", label: "Files", kinds: ["document"] },
  { id: "voice", label: "Voice", kinds: ["voice"] },
];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Media, files and voice notes from one conversation.
 *
 * Split into three tabs rather than one stream because they are looked for
 * differently: you scan for a photo, but you search for a file by name and a
 * voice note by roughly when it was sent.
 */
export function ConversationMedia({ items }: { items: MediaItem[] }) {
  const [tab, setTab] = useState<Tab>("media");
  const [zoom, setZoom] = useState<string | null>(null);

  const kinds = TABS.find((t) => t.id === tab)!.kinds;
  const shown = items.filter((i) => kinds.includes(i.kind));

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex gap-1 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl">
        {TABS.map((t) => {
          const count = items.filter((i) => t.kinds.includes(i.kind)).length;
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
                on ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Nothing here yet"
          text={
            tab === "media"
              ? "Photos and videos you share in this chat collect here."
              : tab === "files"
                ? "Documents you send land here."
                : "Voice notes land here."
          }
          variant="compact"
        />
      ) : tab === "media" ? (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {shown.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => i.kind !== "video" && setZoom(i.url)}
              className="relative aspect-square overflow-hidden bg-surface"
            >
              {i.kind === "video" ? (
                <>
                  <video src={i.url} preload="metadata" className="h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Play size={22} className="text-white drop-shadow" fill="currentColor" />
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50">
          {shown.map((i) => (
            <a
              key={i.id}
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                {i.kind === "voice" ? <Mic size={18} /> : <FileText size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {i.name ?? (i.kind === "voice" ? "Voice note" : "Document")}
                </span>
                <span className="block text-xs text-muted">
                  {i.mine ? "You" : "Them"} · {shortDate(i.at)}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}

      {zoom && <ZoomViewer src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
