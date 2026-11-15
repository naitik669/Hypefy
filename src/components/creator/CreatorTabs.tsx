"use client";

import Link from "next/link";
import { BarChart3, LayoutGrid, Users } from "lucide-react";
import { underHeaderStyle, useHideOnScroll } from "@/lib/use-hide-on-scroll";
import { CREATOR_TABS, type CreatorTab } from "@/lib/creator-content";

const LABELS: Record<CreatorTab, { label: string; Icon: typeof BarChart3 }> = {
  overview: { label: "Overview", Icon: BarChart3 },
  content: { label: "Content", Icon: LayoutGrid },
  audience: { label: "Audience", Icon: Users },
};

/**
 * The three tabs, named in the address.
 *
 * Links rather than state, like /activity: one tab's data is fetched at a
 * time on the server, a link can point at a particular tab, and the back
 * button does what it looks like it does.
 *
 * It rides the hiding header through underHeaderStyle, so scrolling a long
 * content list does not leave a strip of chrome pinned over it.
 */
export function CreatorTabs({ tab }: { tab: CreatorTab }) {
  const hidden = useHideOnScroll();

  return (
    <div
      style={underHeaderStyle(hidden)}
      className="sticky z-10 chrome-bar border-b border-border/60 px-4 pb-2.5 pt-2"
    >
      {/* nav, not role="tablist": these are links that load a page, and
          the tab pattern would promise arrow-key navigation that cannot
          exist here. See aria-current below. */}
      <nav aria-label="Creator tools" className="flex gap-1 rounded-pill bg-surface p-1">
        {CREATOR_TABS.map((id) => {
          const { label, Icon } = LABELS[id];
          const on = id === tab;
          return (
            <Link
              key={id}
              href={id === "overview" ? "/creator" : `/creator?tab=${id}`}
              aria-current={on ? "page" : undefined}
              data-creator-tab={id}
              prefetch={false}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-pill px-1.5 py-2 text-xs font-bold transition-colors ${
                on ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} strokeWidth={2.2} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
