"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Star, MessageCircle, Send, Camera, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ProfilePreviewCard } from "@/components/onboarding/ProfilePreviewCard";

const SLIDES = ["welcome", "posts", "shots", "discover", "identity"] as const;

export function IntroCarousel() {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function advance() {
    if (isLast) router.push("/signup");
    else goTo(index + 1);
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      {/* Top bar — wordmark + Skip */}
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="text-lg font-extrabold tracking-tight">
          Hypefy<span className="text-accent">.</span>
        </span>
        {!isLast && (
          <Link href="/signup" className="text-sm font-medium text-muted transition-colors active:text-foreground">
            Skip
          </Link>
        )}
      </div>

      {/* Swipeable slides */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {SLIDES.map((s) => (
          <section
            key={s}
            className="flex w-full shrink-0 snap-center flex-col px-7"
          >
            {/* Visual */}
            <div className="flex flex-[1.1] items-center justify-center">
              <Visual slide={s} />
            </div>
            {/* Copy */}
            <div className="flex flex-1 flex-col justify-start pt-2">
              <Copy slide={s} />
            </div>
          </section>
        ))}
      </div>

      {/* Footer — dots + CTA */}
      <div className="px-7 pb-10 pt-2">
        <div className="mb-5 flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-accent" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={advance}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.98]"
        >
          {isLast ? "Get Hyped" : "Next"}
          <ArrowRight size={20} strokeWidth={2.6} />
        </button>

        {isLast && (
          <Link
            href="/signin"
            className="mt-3 block text-center text-sm font-medium text-muted transition-colors active:text-foreground"
          >
            Already have an account? <span className="font-semibold text-foreground">Sign in</span>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ─── Slide copy ─────────────────────────────────────────────── */
function Copy({ slide }: { slide: (typeof SLIDES)[number] }) {
  const data = {
    welcome: {
      title: (
        <>
          Welcome to <span className="text-accent">Hypefy</span>
        </>
      ),
      lead: "Where your personality lives.",
      text: "Post, share Shots, hype what hits, and connect through a social app that feels alive.",
    },
    posts: {
      title: <>Post what matters</>,
      lead: "Your world, your way.",
      text: "Share your thoughts, images, and moments — then let people Hype what hits.",
    },
    shots: {
      title: <>Share quick Shots</>,
      lead: "Fast moments, big energy.",
      text: "Post quick Shots that keep your people updated in the moment.",
    },
    discover: {
      title: <>Find your people</>,
      lead: "Discover your vibe.",
      text: "Explore creators, posts, profiles, and conversations that match your energy.",
    },
    identity: {
      title: <>Make the profile yours</>,
      lead: "Show up as you.",
      text: "Your name, photo, bio, and tags shape how the world sees you.",
    },
  }[slide];

  return (
    <div>
      <h1 className="text-[2rem] font-extrabold leading-[1.1] tracking-tight">{data.title}</h1>
      <p className="mt-2 text-base font-semibold text-foreground">{data.lead}</p>
      <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted">{data.text}</p>
    </div>
  );
}

/* ─── Slide visuals (clean mock UI, no neon) ─────────────────── */
function Visual({ slide }: { slide: (typeof SLIDES)[number] }) {
  switch (slide) {
    case "welcome":
      return <WelcomeVisual />;
    case "posts":
      return <MockPostCard />;
    case "shots":
      return <MockShots />;
    case "discover":
      return <MockDiscover />;
    case "identity":
      return (
        <div className="w-full max-w-[280px]">
          <ProfilePreviewCard
            displayName="Maya Rivera"
            username="maya"
            bio="creator mode · late night energy"
            tags={["Creator", "Designer"]}
            avatarHue={280}
            compact
          />
        </div>
      );
  }
}

function WelcomeVisual() {
  return (
    <div className="relative h-56 w-56">
      {/* Stacked mock chips arranged playfully */}
      <div className="absolute left-2 top-6 flex w-40 items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-xl">
        <Avatar name="Jay" hue={200} size={30} />
        <div className="flex-1">
          <div className="h-2 w-16 rounded-full bg-elevated" />
          <div className="mt-1.5 h-2 w-10 rounded-full bg-elevated/70" />
        </div>
      </div>
      <div className="absolute right-1 top-24 flex items-center gap-2 rounded-2xl border border-accent/30 bg-surface px-3 py-2.5 shadow-xl">
        <Star size={18} className="fill-hype text-hype" />
        <span className="text-sm font-bold">2.4k Hypes</span>
      </div>
      <div className="absolute bottom-2 left-6 flex w-36 items-center gap-2 rounded-2xl border border-border bg-surface p-2.5 shadow-xl">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Camera size={16} />
        </span>
        <div className="h-2 w-16 rounded-full bg-elevated" />
      </div>
    </div>
  );
}

function MockPostCard() {
  return (
    <div className="w-full max-w-[260px] rounded-3xl border border-border bg-surface p-3 shadow-xl">
      <div className="flex items-center gap-2.5">
        <Avatar name="Maya" hue={280} size={36} />
        <div className="flex-1">
          <p className="text-sm font-bold leading-tight">maya</p>
          <p className="text-xs text-muted">2m ago</p>
        </div>
      </div>
      <div
        className="mt-3 aspect-[4/3] w-full rounded-2xl"
        style={{ background: "linear-gradient(135deg, #6d28d9, #2563eb)" }}
      />
      <div className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Star size={20} className="fill-hype text-hype" />
          <span className="text-sm font-bold">2.4k</span>
        </span>
        <MessageCircle size={20} className="text-muted" />
        <Send size={19} className="text-muted" />
      </div>
    </div>
  );
}

function MockShots() {
  const people = [
    { n: "You", h: 95, add: true },
    { n: "Jay", h: 200 },
    { n: "Nia", h: 330 },
    { n: "Leo", h: 30 },
    { n: "Ada", h: 150 },
  ];
  return (
    <div className="w-full max-w-[290px] rounded-3xl border border-border bg-surface p-4 shadow-xl">
      <div className="flex justify-between gap-3">
        {people.map((p) => (
          <div key={p.n} className="flex flex-col items-center gap-1.5">
            <div className="relative rounded-full p-[2px]" style={{ background: p.add ? "transparent" : "linear-gradient(135deg, var(--color-accent), #6d28d9)" }}>
              <div className="rounded-full bg-surface p-[2px]">
                {p.add ? (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-border text-faint">
                    <Plus size={18} />
                  </span>
                ) : (
                  <Avatar name={p.n} hue={p.h} size={48} className="rounded-full" />
                )}
              </div>
            </div>
            <span className="text-[10px] text-muted">{p.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockDiscover() {
  const tiles = [
    { n: "Jay", h: 200, tag: "Developer" },
    { n: "Nia", h: 330, tag: "Artist" },
    { n: "Leo", h: 30, tag: "Gamer" },
    { n: "Ada", h: 150, tag: "Creator" },
  ];
  return (
    <div className="grid w-full max-w-[290px] grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div key={t.n} className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-surface p-3.5 shadow-lg">
          <Avatar name={t.n} hue={t.h} size={48} />
          <div className="text-center">
            <p className="text-sm font-bold leading-tight">{t.n}</p>
            <p className="text-[11px] text-muted">{t.tag}</p>
          </div>
          <span className="rounded-pill bg-accent px-4 py-1 text-xs font-bold text-accent-ink">Follow</span>
        </div>
      ))}
    </div>
  );
}
