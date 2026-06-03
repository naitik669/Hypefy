import { ImageIcon, Camera, Star, MessageCircle } from "lucide-react";

type Feature = {
  icon: React.ElementType;
  title: string;
  text: string;
  /** tailwind classes for the icon chip tint */
  chip: string;
  glow: string;
};

const FEATURES: Feature[] = [
  {
    icon: ImageIcon,
    title: "Post your world",
    text: "Share photos and moments, your way.",
    chip: "bg-accent/15 text-accent",
    glow: "bg-accent/20",
  },
  {
    icon: Camera,
    title: "Drop a Shot",
    text: "Quick, in-the-moment captures.",
    chip: "bg-violet-500/15 text-violet-300",
    glow: "bg-violet-500/20",
  },
  {
    icon: Star,
    title: "Hype what you love",
    text: "Double-tap to Hype the best posts.",
    chip: "bg-hype/15 text-hype",
    glow: "bg-hype/20",
  },
  {
    icon: MessageCircle,
    title: "Vibe with your people",
    text: "Message your crew in real time.",
    chip: "bg-verified/15 text-verified",
    glow: "bg-verified/20",
  },
];

/**
 * Horizontally scrollable "what Hypefy does" cards shown above the
 * auth form to add personality. Snap-scrolls, peeks the next card.
 */
export function FeatureCarousel() {
  return (
    <div className="-mx-1 mb-5 w-[calc(100%+0.5rem)]">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="relative flex min-w-[68%] snap-center flex-col gap-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl"
            >
              {/* soft corner glow */}
              <div
                aria-hidden
                className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${f.glow}`}
              />
              <span
                className={`relative flex h-11 w-11 items-center justify-center rounded-2xl ${f.chip}`}
              >
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <div className="relative">
                <p className="text-sm font-bold tracking-tight text-foreground">
                  {f.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">{f.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
