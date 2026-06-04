"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Star, MessageCircle, Send, Camera, Play } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ProfilePreviewCard } from "@/components/onboarding/ProfilePreviewCard";

const SLIDES = ["welcome", "posts", "shots", "discover", "identity"] as const;

/**
 * Enter/exit transition for a slide's content. Active → focused (sharp,
 * settled). Inactive → faded, blurred, nudged down + scaled back. Moving to
 * the next slide plays the incoming "in" while the outgoing plays the reverse.
 */
function slideAnim(active: boolean, delay = 0): React.CSSProperties {
  return {
    opacity: active ? 1 : 0,
    filter: active ? "blur(0px)" : "blur(10px)",
    transform: active ? "translateY(0) scale(1)" : "translateY(28px) scale(0.94)",
    transition: `opacity 0.5s ease ${delay}ms, filter 0.55s ease ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
    willChange: "opacity, transform, filter",
  };
}

export function IntroCarousel() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const isLast = index === SLIDES.length - 1;

  function goTo(i: number) {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
  }

  function advance() {
    if (isLast) router.push("/signup");
    else goTo(index + 1);
  }

  // Controlled swipe — one slide per gesture, no momentum skipping.
  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx <= -45) goTo(index + 1);
    else if (dx >= 45) goTo(index - 1);
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] select-none flex-col overflow-hidden bg-background">
      {/* Top bar — wordmark + Skip */}
      <div className="z-10 flex items-center justify-between px-6 pt-5">
        <span className="text-lg font-extrabold tracking-tight">
          Hypefy<span className="text-accent">.</span>
        </span>
        {!isLast && (
          <Link href="/signup" className="text-sm font-medium text-muted transition-colors active:text-foreground">
            Skip
          </Link>
        )}
      </div>

      {/* Pager — transform-based, one slide at a time */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(-${index * 100}%)`,
            transition: "transform 0.55s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {SLIDES.map((s, i) => {
            const active = i === index;
            return (
              <section key={s} className="flex h-full w-full shrink-0 flex-col px-7">
                {/* Visual — animates in/out, floats while idle */}
                <div className="flex flex-[1.15] items-center justify-center">
                  <div style={slideAnim(active, 0)}>
                    <div className={active ? "animate-float-y" : ""}>
                      <Visual slide={s} />
                    </div>
                  </div>
                </div>
                {/* Copy — same in/out, slightly delayed for a layered feel */}
                <div className="flex flex-1 flex-col justify-start pt-1">
                  <div style={slideAnim(active, 110)}>
                    <Copy slide={s} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
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
      lead: "Short video, big energy.",
      text: "Post short video reels your people can't stop watching.",
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
      return <MockReel />;
    case "discover":
      return <MockDiscover />;
    case "identity":
      return (
        <div className="w-[300px]">
          <ProfilePreviewCard
            displayName="Maya Rivera"
            username="maya"
            bio="creator mode · late night energy"
            tags={["Creator", "Designer"]}
            avatarHue={280}
          />
        </div>
      );
  }
}

function WelcomeVisual() {
  return (
    <div className="relative h-72 w-72">
      <div className="absolute left-1 top-6 flex w-48 items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 shadow-2xl">
        <Avatar name="Jay" hue={200} size={34} />
        <div className="flex-1">
          <div className="h-2.5 w-20 rounded-full bg-elevated" />
          <div className="mt-1.5 h-2.5 w-12 rounded-full bg-elevated/70" />
        </div>
      </div>
      <div className="absolute right-0 top-28 flex items-center gap-2 rounded-2xl border border-accent/30 bg-surface px-3.5 py-3 shadow-2xl">
        <Star size={20} className="fill-hype text-hype" />
        <span className="text-sm font-bold">2.4k Hypes</span>
      </div>
      <div className="absolute bottom-2 left-7 flex w-44 items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 shadow-2xl">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Camera size={18} />
        </span>
        <div className="h-2.5 w-24 rounded-full bg-elevated" />
      </div>
    </div>
  );
}

function MockPostCard() {
  return (
    <div className="w-[300px] rounded-[28px] border border-border bg-surface p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <Avatar name="Maya" hue={280} size={42} />
        <div className="flex-1">
          <p className="text-[15px] font-bold leading-tight">maya</p>
          <p className="text-xs text-muted">2m ago</p>
        </div>
      </div>
      <div
        className="mt-3.5 aspect-square w-full overflow-hidden rounded-3xl"
        style={{ background: "linear-gradient(135deg, #6d28d9, #2563eb)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/onboarding/post-sample.jpg"
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="mt-3.5 flex items-center gap-5">
        <span className="flex items-center gap-1.5">
          <Star size={24} className="fill-hype text-hype" />
          <span className="text-[15px] font-bold">2.4k</span>
        </span>
        <MessageCircle size={23} className="text-muted" />
        <Send size={22} className="text-muted" />
      </div>
    </div>
  );
}

function MockReel() {
  return (
    <div
      className="relative h-[340px] w-[192px] overflow-hidden rounded-[30px] border border-border shadow-2xl"
      style={{ background: "linear-gradient(160deg, #3b2a6d, #1b2b6b 55%, #0c1430)" }}
    >
      {/* Play glyph */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
          <Play size={26} className="ml-0.5 fill-white text-white" />
        </span>
      </div>

      {/* Right action rail */}
      <div className="absolute bottom-16 right-3 flex flex-col items-center gap-4 text-white">
        <span className="flex flex-col items-center gap-0.5">
          <Star size={26} className="fill-hype text-hype" />
          <span className="text-[10px] font-semibold">4.1k</span>
        </span>
        <MessageCircle size={24} />
        <Send size={22} />
      </div>

      {/* Author + caption */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pr-14">
        <div className="flex items-center gap-2">
          <Avatar name="Leo" hue={30} size={26} className="ring-2 ring-white/60" />
          <span className="text-xs font-bold text-white">@leo</span>
        </div>
        <p className="mt-1 text-[11px] text-white/85">late night skate ✦</p>
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
    <div className="grid w-[320px] grid-cols-2 gap-3.5">
      {tiles.map((t) => (
        <div key={t.n} className="flex flex-col items-center gap-2.5 rounded-[26px] border border-border bg-surface p-4 shadow-xl">
          <Avatar name={t.n} hue={t.h} size={56} />
          <div className="text-center">
            <p className="text-[15px] font-bold leading-tight">{t.n}</p>
            <p className="text-xs text-muted">{t.tag}</p>
          </div>
          <span className="rounded-pill bg-accent px-5 py-1.5 text-xs font-bold text-accent-ink">Follow</span>
        </div>
      ))}
    </div>
  );
}
