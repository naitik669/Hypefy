import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { ReelArt, TvArt } from "@/components/empty/scenes";

const COPY = {
  shot: {
    back: "/shots",
    label: "Shots",
    art: <ReelArt />,
    title: "This Shot's gone",
    text: "It was deleted, or isn't available anymore.",
    cta: "Back to Shots",
    // The words land as the reel does.
    timing: { head: 1.15, sub: 1.5, cta: 1.85 },
  },
  show: {
    back: "/shows",
    label: "Shows",
    art: <TvArt offAir />,
    title: "This Show's off air",
    text: "It was deleted, expired, or isn't available right now.",
    cta: "Back to Shows",
    timing: undefined,
  },
} as const;

/**
 * Opening a Shot or Show from a link, a share or a notification after it was
 * deleted, expired or taken down. Used to fall through to the app-wide 404,
 * which said nothing about what had happened or where to go instead.
 */
export function GoneScreen({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind];
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex items-center gap-1 px-2 pt-[calc(var(--sat)+10px)]">
        <Link
          href={c.back}
          aria-label={`Back to ${c.label}`}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </Link>
        <span className="text-lg font-extrabold tracking-tight">{c.label}</span>
      </div>
      <div className="flex flex-1 items-center justify-center pb-20">
        <EmptyScene
          art={c.art}
          title={c.title}
          text={c.text}
          timing={c.timing}
          cta={
            <Link href={c.back} className={ctaClass}>
              {c.cta}
            </Link>
          }
        />
      </div>
    </div>
  );
}
