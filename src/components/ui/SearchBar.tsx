"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * Search field. Pass `href` to render a read-only pill that links somewhere
 * (e.g. Discover → /search); otherwise it's a live input.
 */
export function SearchBar({
  placeholder = "Search",
  autoFocus = false,
  defaultValue,
  value,
  onChange,
  onSubmit,
  href,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  defaultValue?: string;
  /**
   * Controlled mode. Pass it when something OTHER than typing can change the
   * query — tapping a topic or a category on the search screen does exactly
   * that, and against an uncontrolled input the search ran while the box sat
   * there empty, which reads as the tap having done nothing.
   */
  value?: string;
  onChange?: (value: string) => void;
  /** Fires on Enter — the deliberate "run this search" moment (vs. onChange, which fires every keystroke). */
  onSubmit?: () => void;
  href?: string;
}) {
  if (href) {
    return (
      <Link
        href={href}
        className="flex h-11 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm text-faint"
      >
        <Search size={18} className="text-muted" />
        {placeholder}
      </Link>
    );
  }

  return (
    <div className="flex h-11 items-center gap-2 rounded-pill border border-border bg-surface px-4 focus-within:border-white/25">
      <Search size={18} className="text-muted" />
      <input
        autoFocus={autoFocus}
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit?.();
        }}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
      />
      {/* Getting back out. Only in controlled mode, where the parent can
          actually be returned to a blank state — and worth having now that
          clearing the box reveals something to browse rather than a hint. */}
      {value !== undefined && value.length > 0 && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange?.("")}
          className="-mr-1 shrink-0 rounded-full p-1 text-faint transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
