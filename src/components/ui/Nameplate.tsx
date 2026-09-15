import { Avatar } from "@/components/ui/Avatar";

/**
 * A pretend Messages row wearing a nameplate: how it looks in someone's
 * list. Used by the Marketplace and Your style.
 */
export function NameplateRow({
  id,
  name,
  avatarUrl,
  hue,
  preview = "sent a photo",
  small = false,
}: {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  hue: number;
  preview?: string;
  small?: boolean;
}) {
  const size = small ? 30 : 44;
  return (
    <span className={`relative flex w-full items-center overflow-hidden rounded-2xl bg-white/[0.03] ${small ? "gap-2 px-2 py-1.5" : "gap-3 px-3 py-2.5"}`}>
      <Nameplate id={id} className="inset-0" />
      <Avatar name={name} hue={hue} size={size} src={avatarUrl ?? undefined} className="relative rounded-xl" />
      <span className="relative min-w-0 flex-1 text-left">
        <span className={`block truncate font-semibold text-foreground ${small ? "text-[11px]" : "text-sm"}`}>{name}</span>
        <span className={`block truncate text-muted ${small ? "text-[10px]" : "text-[13px]"}`}>{preview}</span>
      </span>
    </span>
  );
}

/**
 * A nameplate's artwork, filling its (positioned) parent: a wash of colour
 * and a motif at the right that fade out towards the left, so the name and
 * message preview over it stay readable. Decorative only.
 */
export function Nameplate({ id, className = "" }: { id: string | null | undefined; className?: string }) {
  const art = id ? PLATES[id] : undefined;
  if (!art) return null;
  return (
    <span aria-hidden className={`pointer-events-none absolute overflow-hidden ${className}`}>
      <span className="absolute inset-0" style={{ background: art.wash }} />
      <svg
        viewBox="0 0 200 60"
        preserveAspectRatio="xMaxYMid meet"
        className="absolute inset-y-0 right-0 h-full w-full"
        style={{
          WebkitMaskImage: "linear-gradient(90deg, transparent 40%, #000 88%)",
          maskImage: "linear-gradient(90deg, transparent 40%, #000 88%)",
        }}
      >
        {art.motif}
      </svg>
    </span>
  );
}

/** The wash fades from nothing at the left edge to its colour at the right. */
const wash = (rgb: string, strength = 0.42) =>
  `linear-gradient(90deg, rgba(${rgb},0) 0%, rgba(${rgb},${strength * 0.35}) 45%, rgba(${rgb},${strength}) 100%)`;

const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y} Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r} Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y} Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r}Z`;

/** A 7x6 pixel heart, as [column, row] cells. */
const HEART: [number, number][] = [
  [1, 0], [2, 0], [4, 0], [5, 0],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
  [2, 4], [3, 4], [4, 4],
  [3, 5],
];

const PLATES: Record<string, { wash: string; motif: React.ReactNode }> = {
  "plate-lime": {
    wash: wash("163,230,53", 0.3),
    motif: (
      <g stroke="#a3e635" strokeLinecap="round">
        {[
          [110, 14, 190, 6, 3], [128, 26, 200, 18, 1.5], [96, 38, 186, 30, 4], [140, 48, 204, 42, 1.5], [150, 8, 176, 4, 1],
        ].map(([x1, y1, x2, y2, w], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} strokeOpacity={0.35 + (i % 3) * 0.2} />
        ))}
        <path d="M170 24 L160 36 L168 36 L162 48 L180 32 L171 32 L178 24 Z" fill="#d9f99d" stroke="none" />
      </g>
    ),
  },
  "plate-petals": {
    wash: wash("190,24,93", 0.34),
    motif: (
      <g>
        {[
          [120, 16, 7, -30, "#fda4af"], [146, 40, 9, 20, "#fb7185"], [168, 14, 6, 60, "#fecdd3"], [186, 44, 8, -50, "#fda4af"],
          [104, 44, 5, 10, "#fecdd3"], [196, 20, 5, 35, "#fb7185"],
        ].map(([x, y, r, rot, c], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={(r as number) * 0.5} transform={`rotate(${rot} ${x} ${y})`} fill={c as string} />
        ))}
        {[[132, 30], [178, 30], [158, 52]].map(([x, y], i) => (
          <path key={i} d={spark(x, y, 3)} fill="#fff1f2" />
        ))}
      </g>
    ),
  },
  "plate-starfall": {
    wash: wash("67,56,202", 0.45),
    motif: (
      <g>
        {[[150, 10, 110, 34], [196, 18, 158, 42]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#sf)" strokeWidth="2" strokeLinecap="round" />
        ))}
        <defs>
          <linearGradient id="sf" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[[150, 10, 3.5], [196, 18, 3], [124, 50, 2.5], [176, 50, 4], [100, 14, 2]].map(([x, y, r], i) => (
          <path key={i} d={spark(x, y, r)} fill="#e0e7ff" />
        ))}
        {[[138, 26], [186, 36], [112, 28], [164, 30]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1" fill="#c7d2fe" />
        ))}
      </g>
    ),
  },
  "plate-aurora": {
    wash: wash("16,185,129", 0.3),
    motif: (
      <g fill="none" strokeLinecap="round">
        <path d="M80 44 C110 20 140 50 170 26 S200 20 210 14" stroke="#34d399" strokeWidth="10" strokeOpacity="0.45" />
        <path d="M90 52 C120 30 150 58 180 36 S205 30 215 26" stroke="#a78bfa" strokeWidth="8" strokeOpacity="0.45" />
        <path d="M100 30 C130 10 150 34 180 14 S205 10 215 6" stroke="#67e8f9" strokeWidth="5" strokeOpacity="0.5" />
      </g>
    ),
  },
  "plate-wisp": {
    wash: wash("20,83,45", 0.5),
    motif: (
      <g>
        <defs>
          <radialGradient id="wp">
            <stop offset="0" stopColor="#ecfccb" />
            <stop offset="0.35" stopColor="#86efac" stopOpacity="0.8" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>
        </defs>
        {[[176, 24, 14], [140, 40, 9], [112, 20, 6], [196, 46, 7]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="url(#wp)" />
        ))}
        {[[160, 12], [128, 52], [188, 8]].map(([x, y], i) => (
          <path key={i} d={spark(x, y, 2.5)} fill="#f7fee7" />
        ))}
      </g>
    ),
  },
  "plate-ember": {
    wash: wash("194,65,12", 0.45),
    motif: (
      <g>
        {[
          [118, 50, 2], [132, 36, 1.5], [148, 46, 2.5], [160, 22, 1.5], [172, 40, 3], [186, 16, 2], [196, 32, 1.5], [140, 14, 1.2], [108, 30, 1.2],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? "#fdba74" : "#fde047"} />
        ))}
        <path d="M150 60 C150 46 162 44 160 30 C170 40 176 48 172 60 Z" fill="#f97316" fillOpacity="0.5" />
        <path d="M180 60 C180 50 188 46 188 36 C196 46 200 52 196 60 Z" fill="#ef4444" fillOpacity="0.45" />
      </g>
    ),
  },
  "plate-sakura": {
    wash: wash("131,24,67", 0.3),
    motif: (
      <g>
        <path d="M210 6 C180 14 160 28 120 30 M170 20 C160 34 150 44 138 50" stroke="#3f1d2b" strokeWidth="3" fill="none" strokeLinecap="round" />
        {[[182, 14], [150, 28], [124, 30], [160 , 38], [140, 50], [196, 26]].map(([x, y], i) => (
          <g key={i}>
            {[0, 72, 144, 216, 288].map((a) => (
              <circle
                key={a}
                cx={x + 4 * Math.cos((a * Math.PI) / 180)}
                cy={y + 4 * Math.sin((a * Math.PI) / 180)}
                r="3.2"
                fill="#fbcfe8"
              />
            ))}
            <circle cx={x} cy={y} r="1.6" fill="#f472b6" />
          </g>
        ))}
      </g>
    ),
  },
  "plate-city": {
    wash: wash("134,25,143", 0.45),
    motif: (
      <g>
        {[
          [110, 38, 12], [124, 26, 10], [136, 44, 8], [146, 18, 12], [160, 34, 9], [171, 22, 11], [184, 40, 8], [194, 28, 12],
        ].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={60 - (y as number)} fill="#1e0b2b" stroke={i % 2 ? "#f0abfc" : "#67e8f9"} strokeOpacity="0.7" strokeWidth="0.8" />
        ))}
        {[[149, 24], [153, 30], [174, 28], [127, 32], [197, 34], [163, 40]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="2" height="2" fill={i % 2 ? "#67e8f9" : "#f0abfc"} />
        ))}
      </g>
    ),
  },
  "plate-hearts": {
    wash: wash("219,39,119", 0.3),
    motif: (
      <g shapeRendering="crispEdges">
        {[[160, 18, 3, "#fb7185"], [122, 34, 2, "#f9a8d4"], [184, 38, 2.5, "#f472b6"], [140, 10, 1.5, "#fecdd3"]].map(([x, y, s, c], i) => (
          <g key={i} fill={c as string}>
            {HEART.map(([hx, hy]) => (
              <rect key={`${hx}-${hy}`} x={(x as number) + hx * (s as number)} y={(y as number) + hy * (s as number)} width={s as number} height={s as number} />
            ))}
          </g>
        ))}
      </g>
    ),
  },
  "plate-ocean": {
    wash: wash("3,105,161", 0.45),
    motif: (
      <g>
        <path d="M80 48 C100 40 120 56 140 48 S180 40 200 48 L210 60 L80 60 Z" fill="#0ea5e9" fillOpacity="0.35" />
        <path d="M90 54 C110 48 130 60 150 54 S190 48 210 54 L210 60 L90 60 Z" fill="#38bdf8" fillOpacity="0.35" />
        {[[168, 16, 4], [184, 30, 2.5], [150, 28, 2], [194, 10, 2], [132, 18, 1.5]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="#bae6fd" strokeWidth="1" />
        ))}
      </g>
    ),
  },
};

export const NAMEPLATE_ART_IDS = Object.keys(PLATES);
