"use client";

import { INTERESTS } from "@/lib/profile";

export function InterestPills({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(interest: string) {
    onChange(
      value.includes(interest)
        ? value.filter((i) => i !== interest)
        : [...value, interest],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {INTERESTS.map((interest) => {
        const selected = value.includes(interest);
        return (
          <button
            key={interest}
            type="button"
            onClick={() => toggle(interest)}
            className={`rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "border-accent bg-accent text-accent-ink"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {interest}
          </button>
        );
      })}
    </div>
  );
}
