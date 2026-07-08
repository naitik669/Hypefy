"use client";

import { BANNERS } from "@/lib/profile";

export function BannerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {BANNERS.map((b) => {
        const selected = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(b.id)}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={`h-16 w-28 rounded-xl border-2 transition-all ${
                selected
                  ? "border-accent shadow-[0_0_14px_-2px_rgba(163,230,53,0.6)]"
                  : "border-border"
              }`}
              style={{ background: b.gradient }}
            />
            <span
              className={`text-xs ${selected ? "font-semibold text-foreground" : "text-muted"}`}
            >
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
