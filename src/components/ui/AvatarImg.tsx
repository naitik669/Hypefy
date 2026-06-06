"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Renders a user's uploaded avatar photo, falling back to the generated
 * initials/gradient Avatar if the image is missing or fails to load.
 */
export function AvatarImg({
  url,
  name,
  hue,
  size,
  className = "",
}: {
  url: string | null | undefined;
  name: string;
  hue: number;
  size: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return <Avatar name={name} hue={hue} size={size} className={className} />;
  }
  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
