import { Bookmark } from "lucide-react";
import { folderFill, type Folder, type FolderCover } from "@/lib/folders";

/**
 * One saved thing as a picture: its image, or for a Shot with no poster a
 * frame of the video itself (#t=0.1 makes the browser decode one — Safari
 * paints nothing for preload="metadata" alone).
 */
export function SavedThumb({ thumb, video, alt = "" }: { thumb: string | null; video: string | null; alt?: string }) {
  if (thumb)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumb} alt={alt} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />;
  if (video)
    return <video src={`${video}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  return <span className="block h-full w-full bg-black/25" />;
}

/**
 * What the mosaic shows: a chosen cover first, then the newest things, four
 * at most.
 */
function cells(folder: Pick<Folder, "coverUrl" | "covers">): FolderCover[] {
  const newest = folder.covers.filter((c) => c.thumb || c.video);
  if (!folder.coverUrl) return newest.slice(0, 4);
  return [{ kind: "post" as const, thumb: folder.coverUrl, video: null }, ...newest.filter((c) => c.thumb !== folder.coverUrl)].slice(0, 4);
}

/** One to four pictures: one fills, two split, three is one tall and two
 *  stacked, four is two by two. */
const LAYOUT: Record<number, { cols: string; rows: string; span?: boolean }> = {
  1: { cols: "1fr", rows: "1fr" },
  2: { cols: "1fr 1fr", rows: "1fr" },
  3: { cols: "1fr 1fr", rows: "1fr 1fr", span: true },
  4: { cols: "1fr 1fr", rows: "1fr 1fr" },
};

const SIZES = {
  chip: { outer: "rounded-[14px]", inner: "rounded-[8px]", inset: "11%", icon: 18, emoji: "text-xl" },
  tile: { outer: "rounded-[22px]", inner: "rounded-[14px]", inset: "7.5%", icon: 26, emoji: "text-4xl" },
  hero: { outer: "rounded-[34px]", inner: "rounded-[24px]", inset: "6.5%", icon: 40, emoji: "text-7xl" },
} as const;

/**
 * A folder, drawn: a tile in the folder's colour with its newest things set
 * into it as a mosaic. Its name and emoji go beside it, not on it — the
 * pictures are what you recognise a folder by. An empty folder shows its
 * emoji in the middle instead.
 */
export function FolderArt({
  folder,
  variant = "tile",
  className = "",
}: {
  folder: Pick<Folder, "id" | "emoji" | "color" | "coverUrl" | "covers">;
  variant?: keyof typeof SIZES;
  className?: string;
}) {
  const fill = folderFill(folder.color, folder.id);
  const pics = cells(folder);
  const grid = LAYOUT[pics.length];
  const s = SIZES[variant];

  return (
    <span
      className={`relative block aspect-square overflow-hidden ${s.outer} ${className}`}
      style={{ background: fill.background, boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.16), 0 14px 28px -20px rgb(0 0 0 / 0.9)" }}
    >
      {pics.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: fill.ink }}>
          {folder.emoji ? (
            <span className={`${s.emoji} leading-none`}>{folder.emoji}</span>
          ) : (
            <Bookmark size={s.icon} strokeWidth={2.2} className="opacity-75" />
          )}
        </span>
      ) : (
        <span
          className={`absolute grid gap-[2px] overflow-hidden bg-black/25 ${s.inner}`}
          style={{
            inset: s.inset,
            gridTemplateColumns: grid.cols,
            gridTemplateRows: grid.rows,
            boxShadow: "0 8px 18px -10px rgb(0 0 0 / 0.7)",
          }}
        >
          {pics.map((c, i) => (
            <span key={i} className="relative min-h-0 overflow-hidden" style={grid.span && i === 0 ? { gridRow: "span 2" } : undefined}>
              <SavedThumb thumb={c.thumb} video={c.video} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
