"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Clamps long text to a few lines with a "more" / "less" toggle.
 * Only shows the toggle when the content actually overflows.
 */
export function ExpandableText({
  children,
  clampClass = "line-clamp-2",
  className = "",
  moreClassName = "text-muted",
}: {
  children: React.ReactNode;
  clampClass?: string;
  className?: string;
  moreClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // When clamped, the full content (scrollHeight) exceeds the visible box.
    setClamped(el.scrollHeight - el.clientHeight > 2);
  }, [children, expanded]);

  return (
    <div className={className}>
      <div ref={ref} className={expanded ? undefined : clampClass}>
        {children}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`mt-0.5 text-sm font-semibold ${moreClassName}`}
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}
