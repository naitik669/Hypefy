"use client";

import { Image as ImageIcon, Camera, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

const options = [
  {
    key: "Post",
    icon: ImageIcon,
    title: "New Post",
    text: "Share a photo, video, or moment.",
    from: 265,
    to: 320,
  },
  {
    key: "Shot",
    icon: Camera,
    title: "Add Shot",
    text: "A quick moment — gone in 24 hours.",
    from: 150,
    to: 190,
  },
] as const;

export function CreateSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col gap-3 pb-4 pt-1">
        {options.map(({ key, icon: Icon, title, text, from, to }) => (
          <button
            key={key}
            type="button"
            onClick={onClose}
            className="flex items-center gap-4 rounded-2xl border border-border bg-elevated p-4 text-left transition-transform active:scale-[0.99]"
          >
            {/* Gradient icon tile */}
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${from} 80% 55%), hsl(${to} 70% 35%))`,
              }}
            >
              <Icon size={26} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-bold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>

            <ChevronRight size={20} className="shrink-0 text-faint" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
