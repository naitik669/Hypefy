"use client";

import Link from "next/link";
import { Search } from "lucide-react";

/**
 * Search field. Pass `href` to render a read-only pill that links somewhere
 * (e.g. Discover → /search); otherwise it's a live input.
 */
export function SearchBar({
  placeholder = "Search",
  autoFocus = false,
  defaultValue,
  onChange,
  onSubmit,
  href,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
      />
    </div>
  );
}
