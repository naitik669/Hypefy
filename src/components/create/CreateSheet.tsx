"use client";

import { useRouter } from "next/navigation";
import { ImageIcon, Film, Hourglass, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

/**
 * Each action uses a distinct Hypefy design-token color so the icons
 * feel intentional, not like random gradient blobs:
 *
 *  Post  → accent (electric lime)  — the primary "create" action
 *  Shot  → verified (blue)         — video / cinematic
 *  Show  → hype (gold)             — ephemeral / moment
 */
const ACTIONS = [
  {
    key: "post",
    icon: ImageIcon,
    label: "New Post",
    desc: "Share a photo and your thoughts",
    iconBg: "bg-accent",
    iconColor: "text-accent-ink",
    chevronColor: "text-accent/70",
    href: "/create/post",
  },
  {
    key: "shot",
    icon: Film,
    label: "Add Shot",
    desc: "Short video reel for the Shots feed",
    iconBg: "bg-verified/15",
    iconColor: "text-verified",
    chevronColor: "text-verified/50",
    href: "/create/shot",
  },
  {
    key: "show",
    icon: Hourglass,
    label: "Add Show",
    desc: "A moment that disappears in 24 hours",
    iconBg: "bg-hype/15",
    iconColor: "text-hype",
    chevronColor: "text-hype/50",
    href: "/shows/add",
  },
] as const;

export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-4 pt-1">

        {/* ── Sheet header ─────────────────────────────────────── */}
        <div className="mb-4 flex items-center gap-2.5">
          {/* Hypefy accent stripe — same design element used across the app */}
          <span className="h-[3px] w-5 rounded-full bg-accent" />
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">
            Create
          </p>
        </div>

        {/* ── Action cards ─────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          {ACTIONS.map(({ key, icon: Icon, label, desc, iconBg, iconColor, chevronColor, href }) => (
            <button
              key={key}
              type="button"
              onClick={() => go(href)}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-surface px-4 py-3.5 text-left transition-all active:scale-[0.98] active:bg-elevated"
            >
              {/* Icon chip — Hypefy design-token color, not random gradient */}
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}
              >
                <Icon size={23} strokeWidth={1.75} />
              </span>

              {/* Labels */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug tracking-tight">{label}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{desc}</p>
              </div>

              {/* Arrow — tinted to match the icon accent color */}
              <ChevronRight
                size={17}
                className={`shrink-0 transition-transform ${chevronColor} group-active:translate-x-0.5`}
              />
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
