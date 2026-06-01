"use client";

import { useState } from "react";

/** Horizontal scrollable filter pills with a single active selection. */
export function FilterPills({
  options,
  onChange,
}: {
  options: string[];
  onChange?: (value: string) => void;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          onClick={() => {
            setActive(i);
            onChange?.(opt);
          }}
          className={`shrink-0 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
            i === active
              ? "bg-accent text-accent-ink"
              : "bg-surface text-muted hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
