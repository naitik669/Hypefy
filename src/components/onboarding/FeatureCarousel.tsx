"use client";

import { useRef, useState } from "react";
import { Users, Camera, ImageIcon, Compass } from "lucide-react";
import { FeatureCard } from "@/components/onboarding/FeatureCard";

const features = [
  {
    key: "hype",
    mascot: "hype" as const,
    title: "Hype what hits",
    text: "Tap the star to hype posts, shots, and moments that deserve energy.",
    from: 45,
    to: 50,
  },
  {
    key: "rooms",
    icon: Users,
    title: "Build your Room",
    text: "Create social spaces for friends, creators, squads, and communities.",
    from: 265,
    to: 320,
  },
  {
    key: "shots",
    icon: Camera,
    title: "Post quick Shots",
    text: "Share 24-hour moments that show what your day feels like.",
    from: 150,
    to: 190,
  },
  {
    key: "posts",
    icon: ImageIcon,
    title: "Post your world",
    text: "Share photos, thoughts, videos, and moments with your people.",
    from: 200,
    to: 250,
  },
  {
    key: "discover",
    icon: Compass,
    title: "Discover the energy",
    text: "Find people, rooms, posts, and conversations that match your vibe.",
    from: 30,
    to: 70,
  },
  {
    key: "personality",
    mascot: "proud" as const,
    title: "Make it yours",
    text: "Your profile, banner, vibe, and rooms should feel like you.",
    from: 280,
    to: 330,
  },
];

export function FeatureCarousel() {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth * 0.78));
    if (i !== idx) setIdx(Math.min(i, features.length - 1));
  }

  return (
    <div className="mt-8">
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2"
      >
        {features.map(({ key, ...f }) => (
          <FeatureCard key={key} {...f} />
        ))}
        {/* trailing spacer so last card can center */}
        <div className="w-[11vw] shrink-0" aria-hidden />
      </div>

      {/* Dots */}
      <div className="mt-5 flex justify-center gap-1.5">
        {features.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === idx ? "w-5 bg-accent" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
