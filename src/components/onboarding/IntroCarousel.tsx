"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Star, MessageCircle, Send, Play, Compass, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";

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

/**
 * Sequenced reveal for the posts slide — a clean fade + rise per element.
 * Shared timeline (order × gap): header 0 → body 1 → maya 2 → jay 3 →
 * rest of the background posts 4 → ada 5.
 */
const REVEAL_GAP = 170;
function revealStyle(active: boolean, order: number): React.CSSProperties {
  const d = order * REVEAL_GAP;
  return {
    opacity: active ? 1 : 0,
    transform: active ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.5s ease ${d}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${d}ms`,
    willChange: "opacity, transform",
  };
}

export function IntroCarousel() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const wheelLock = useRef(false);
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

  // Trackpad / wheel — one slide per gesture (locked during a short cooldown)
  function onWheel(e: React.WheelEvent) {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8 || wheelLock.current) return;
    wheelLock.current = true;
    goTo(index + (d > 0 ? 1 : -1));
    setTimeout(() => {
      wheelLock.current = false;
    }, 650);
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
        onWheel={onWheel}
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
                {/* Visual — fills all remaining space above the copy block */}
                <div className="min-h-0 flex-1 flex items-center justify-center overflow-hidden">
                  {/* Shots handles its own per-reel reveal (see MockReel). */}
                  <div style={s === "shots" ? undefined : slideAnim(active, 0)}>
                    {/* Posts, shots + discover slides float each element individually;
                        other slides float as one piece. */}
                    <div
                      className={
                        active && s !== "posts" && s !== "discover" && s !== "shots"
                          ? "animate-float-y"
                          : ""
                      }
                    >
                      <Visual slide={s} active={active} />
                    </div>
                  </div>
                </div>
                {/* Copy — natural height, anchored just above the footer.
                    flex-none prevents it from growing and creating a blank zone. */}
                <div className="flex-none pb-5 pt-4">
                  <Copy slide={s} active={active} />
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
          className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-accent-ink transition-transform duration-150 active:scale-[0.96]"
        >
          {isLast ? "Get Hyped" : "Next"}
          <ArrowRight
            size={20}
            strokeWidth={2.6}
            className="transition-transform duration-200 group-active:translate-x-1.5"
          />
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
function Copy({ slide, active }: { slide: (typeof SLIDES)[number]; active: boolean }) {
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
      {/* Header reveals first */}
      <h1 style={revealStyle(active, 0)} className="text-[2rem] font-extrabold leading-[1.1] tracking-tight">
        {data.title}
      </h1>
      {/* Body reveals second */}
      <div style={revealStyle(active, 1)}>
        <p className="mt-2 text-base font-semibold text-foreground">{data.lead}</p>
        <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted">{data.text}</p>
      </div>
    </div>
  );
}

/* ─── Slide visuals (clean mock UI, no neon) ─────────────────── */
function Visual({ slide, active }: { slide: (typeof SLIDES)[number]; active: boolean }) {
  switch (slide) {
    case "welcome":
      return <WelcomeVisual />;
    case "posts":
      return <MockPostStack active={active} />;
    case "shots":
      return <MockReel active={active} />;
    case "discover":
      return <MockDiscover />;
    case "identity":
      return <MockProfile />;
  }
}

function ProfileStat({ n, l }: { n: string; l: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold leading-tight">{n}</p>
      <p className="text-[10px] text-muted">{l}</p>
    </div>
  );
}

/** Rich profile card for the identity slide — banner, avatar, stats, tags,
 *  recent posts and actions, so it feels like a real, lived-in profile. */
function MockProfile() {
  const tags = ["Creator", "Designer", "Photographer"];
  const thumbs = [
    "/onboarding/post-sample.jpg",
    "/onboarding/ada-post.webp",
    "/onboarding/nia-post.jpg",
    "/onboarding/jay-post.jpg",
  ];
  return (
    <div className="w-[300px] overflow-hidden rounded-[26px] border border-border bg-surface shadow-2xl">
      {/* Banner */}
      <div
        className="h-16 w-full"
        style={{ background: "linear-gradient(115deg, rgba(200,255,0,0.20), rgba(109,40,217,0.28) 75%), #121212" }}
      />

      <div className="px-4 pb-4">
        {/* Avatar + stats */}
        <div className="flex items-end justify-between">
          <div className="-mt-9 h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[22px] ring-4 ring-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/onboarding/maya.webp"
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: "50% 16%" }}
              draggable={false}
            />
          </div>
          <div className="flex gap-4 pb-0.5">
            <ProfileStat n="128" l="Posts" />
            <ProfileStat n="12.4k" l="Hypes" />
            <ProfileStat n="843" l="Friends" />
          </div>
        </div>

        {/* Identity */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-[17px] font-bold leading-tight">Maya Rivera</span>
          <VerifiedStar className="h-4 w-4 text-verified" />
        </div>
        <p className="text-sm text-muted">@maya</p>
        <p className="mt-1.5 text-sm leading-snug text-foreground/90">
          creator mode · late night energy ✦
        </p>

        {/* Tags */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-lg border border-border bg-elevated px-2.5 py-1 text-xs font-medium"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Recent posts */}
        <div className="mt-3 flex gap-1.5">
          {thumbs.map((src, i) => (
            <div key={i} className="aspect-square flex-1 overflow-hidden rounded-lg bg-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <div className="flex h-9 flex-1 items-center justify-center rounded-xl bg-accent text-xs font-bold text-accent-ink">
            Edit profile
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted">
            <Send size={15} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A cohesive mini "Hypefy app" preview — wordmark, Shows row, a real post
 *  with Hype — so the welcome scene reads as the product, not loose chips. */
function WelcomeVisual() {
  const rings = [
    { img: "/onboarding/jay-pfp.webp", pos: "50% 16%" },
    { img: "/onboarding/disc9.webp", pos: "50% 32%" },
    { img: "/onboarding/ada-pfp.webp", pos: "50% 22%" },
    { img: "/onboarding/disc6.webp", pos: "50% 35%" },
  ];
  return (
    <div className="relative">
      {/* Energy glow */}
      <div aria-hidden className="absolute -inset-7 rounded-[44px] bg-accent/10 blur-3xl" />

      {/* App preview card */}
      <div className="relative w-[212px] overflow-hidden rounded-[28px] border border-border bg-surface shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
          <span className="text-[13px] font-extrabold tracking-tight">
            Hypefy<span className="text-accent">.</span>
          </span>
          <div className="flex items-center gap-2 text-faint">
            <Compass size={13} />
            <span className="relative">
              <Bell size={13} />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          </div>
        </div>

        {/* Shows row */}
        <div className="flex gap-2.5 px-3 pb-2">
          {rings.map((r) => (
            <div key={r.img} className="rounded-full p-[1.5px]" style={{ background: "linear-gradient(135deg, var(--color-accent), #6d28d9)" }}>
              <div className="rounded-full bg-surface p-[1.5px]">
                <div className="h-[26px] w-[26px] overflow-hidden rounded-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.img} alt="" className="h-full w-full object-cover" style={{ objectPosition: r.pos }} draggable={false} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* A post */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 py-1.5">
            <div className="h-[22px] w-[22px] shrink-0 overflow-hidden rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/onboarding/maya.webp" alt="" className="h-full w-full object-cover" style={{ objectPosition: "50% 18%" }} draggable={false} />
            </div>
            <div className="flex-1">
              <div className="h-1.5 w-16 rounded-full bg-elevated" />
              <div className="mt-1 h-1.5 w-9 rounded-full bg-elevated/70" />
            </div>
          </div>
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onboarding/post-sample.jpg" alt="" className="h-full w-full object-cover" draggable={false} />
          </div>
          <div className="flex items-center gap-3.5 pt-2">
            <span className="flex items-center gap-1">
              <Star size={17} className="fill-hype text-hype" />
              <span className="text-[11px] font-bold">2.4k</span>
            </span>
            <MessageCircle size={15} className="text-muted" />
            <Send size={14} className="text-muted" />
          </div>
        </div>
      </div>

      {/* Hype badge popping off the corner */}
      <div className="absolute -right-6 top-[42%] flex items-center gap-1.5 rounded-pill border border-accent/30 bg-surface px-3 py-2 shadow-2xl">
        <Star size={15} className="fill-hype text-hype" />
        <span className="text-xs font-bold">2.4k Hypes</span>
      </div>
    </div>
  );
}

/** Background posts — real-looking, different users, so the feed feels alive. */
type BgPostData = {
  name: string;
  hue: number;
  time: string;
  hypes: string;
  img: string;
  imgPos: string;
  avatar?: string;
  avatarPos?: string;
};

const BG_POSTS: BgPostData[] = [
  { name: "leo", hue: 30, time: "5m", hypes: "1.2k", img: "/onboarding/leo-post.jpg", imgPos: "50% 50%" },
  { name: "nia", hue: 330, time: "12m", hypes: "3.4k", img: "/onboarding/nia-post.jpg", imgPos: "50% 45%" },
  { name: "jay", hue: 200, time: "1h", hypes: "890", img: "/onboarding/jay-post.jpg", imgPos: "50% 45%", avatar: "/onboarding/jay-pfp.webp", avatarPos: "50% 16%" },
  { name: "ada", hue: 150, time: "2h", hypes: "2.1k", img: "/onboarding/ada-post.webp", imgPos: "50% 42%", avatar: "/onboarding/ada-pfp.webp", avatarPos: "50% 22%" },
];

/**
 * The hero post surrounded by other users' posts that bleed off the left and
 * right edges in two staggered columns (upper + lower per side) — a feed wall.
 * Their inner edges tuck behind the opaque hero card, so nothing collides.
 */
function MockPostStack({ active }: { active: boolean }) {
  // Reveal order (after header + body): maya (2) → jay (3) → leo + nia (4) → ada (5).
  return (
    <div className="relative">
      {/* Behind the hero — leo (up-left), jay (down-left), nia (right) */}
      <div aria-hidden className="absolute -left-28 -top-8 w-40 opacity-60">
        <div style={revealStyle(active, 4)}>
          <Float dur="4.1s" delay="0.7s">
            <BgPost post={BG_POSTS[0]} />
          </Float>
        </div>
      </div>
      <div aria-hidden className="absolute -left-28 -bottom-6 w-40 opacity-50">
        <div style={revealStyle(active, 3)}>
          <Float dur="4.4s" delay="1s">
            <BgPost post={BG_POSTS[2]} />
          </Float>
        </div>
      </div>
      <div aria-hidden className="absolute -right-24 top-3 w-36 opacity-60">
        <div style={revealStyle(active, 4)}>
          <Float dur="3.7s" delay="0.3s">
            <BgPost post={BG_POSTS[1]} />
          </Float>
        </div>
      </div>

      {/* Hero post — nudged slightly up + left, revealed after the copy */}
      <div className="relative z-20" style={{ transform: "translate(-12px, -10px)" }}>
        <div style={revealStyle(active, 2)}>
          <Float dur="3.4s" delay="0s">
            <MockPostCard />
          </Float>
        </div>
      </div>

      {/* In front of the hero, bigger, shifted down-right, revealed last */}
      <div aria-hidden className="absolute -right-32 -bottom-5 z-30 w-48">
        <div style={revealStyle(active, 5)}>
          <Float dur="3.2s" delay="0.5s">
            <BgPost post={BG_POSTS[3]} />
          </Float>
        </div>
      </div>

      {/* Top-most black fade — every post (hero + neighbours + ada) dissolves
          into black as it nears the copy below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -right-32 -bottom-10 z-40 h-44"
        style={{
          background:
            "linear-gradient(to top, var(--color-background) 0%, var(--color-background) 42%, transparent 100%)",
        }}
      />
    </div>
  );
}

/** Gentle bob with a per-instance duration + delay so posts float out of sync. */
function Float({ dur, delay, children }: { dur: string; delay: string; children: React.ReactNode }) {
  return (
    <div className="animate-float-y" style={{ animationDuration: dur, animationDelay: delay }}>
      {children}
    </div>
  );
}

function BgPost({ post }: { post: BgPostData }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-2.5 shadow-xl">
      <div className="flex items-center gap-2">
        {post.avatar ? (
          <div className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[30%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.avatar}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: post.avatarPos }}
              draggable={false}
            />
          </div>
        ) : (
          <Avatar name={post.name} hue={post.hue} size={26} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold leading-tight">{post.name}</p>
          <p className="text-[9px] text-muted">{post.time}</p>
        </div>
      </div>
      <div className="mt-2 aspect-square w-full overflow-hidden rounded-xl bg-elevated">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.img}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: post.imgPos }}
          draggable={false}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Star size={13} className="fill-hype text-hype" />
        <span className="text-[10px] font-bold">{post.hypes}</span>
        <MessageCircle size={12} className="text-muted" />
        <Send size={11} className="text-muted" />
      </div>
    </div>
  );
}

function MockPostCard() {
  return (
    <div className="w-[300px] rounded-[28px] border border-border bg-surface p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        {/* Face-focused square pfp */}
        <div className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-[30%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/onboarding/maya.webp"
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: "50% 18%" }}
            draggable={false}
          />
        </div>
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

type ReelData = {
  img: string;
  imgPos?: string;
  pfp?: string;
  pfpPos?: string;
  handle: string;
  caption: string;
  hypes: string;
  hue?: number;
};

const HERO_REEL: ReelData = {
  img: "/onboarding/jay-post.jpg",
  imgPos: "50% 45%",
  pfp: "/onboarding/disc9.webp",
  pfpPos: "50% 30%",
  handle: "leo",
  caption: "golden hour ✦",
  hypes: "4.1k",
};

const BG_REELS: ReelData[] = [
  { img: "/onboarding/nia-post.jpg", imgPos: "50% 45%", pfp: "/onboarding/disc6.webp", pfpPos: "50% 35%", handle: "mara", caption: "park days", hypes: "2.3k" },
  { img: "/onboarding/ada-post.webp", imgPos: "50% 42%", pfp: "/onboarding/disc7.webp", pfpPos: "50% 38%", handle: "kit", caption: "sun nap ☀️", hypes: "3.1k" },
];

/** Per-reel in-animation: blur + fade + rise, staggered by order. */
function reelReveal(active: boolean, order: number): React.CSSProperties {
  const d = order * 170;
  return {
    opacity: active ? 1 : 0,
    filter: active ? "blur(0px)" : "blur(8px)",
    transform: active ? "translateY(0) scale(1)" : "translateY(22px) scale(0.95)",
    transition: `opacity 0.55s ease ${d}ms, filter 0.6s ease ${d}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${d}ms`,
    willChange: "opacity, transform, filter",
  };
}

/** One reel card (real image still, play glyph, hype rail, author). */
function ReelCard({ data, w, h, active = false }: { data: ReelData; w: number; h: number; active?: boolean }) {
  const big = w > 150;
  return (
    <div
      className="relative overflow-hidden rounded-[26px] border border-border bg-elevated shadow-2xl"
      style={{ width: w, height: h }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.img}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: data.imgPos }}
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />

      {/* Play */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm"
          style={{ width: w * 0.26, height: w * 0.26 }}
        >
          <Play size={w * 0.13} className="ml-0.5 fill-white" />
        </span>
      </div>

      {/* Hype rail */}
      <div className="absolute bottom-12 right-2.5 flex flex-col items-center gap-3 text-white">
        <span className="flex flex-col items-center gap-0.5">
          <Star
            size={big ? 26 : 20}
            className={`fill-hype text-hype ${active ? "animate-star-pop" : ""}`}
          />
          <span className="text-[10px] font-semibold">{data.hypes}</span>
        </span>
        <MessageCircle size={big ? 22 : 18} />
        <Send size={big ? 20 : 16} />
      </div>

      {/* Author + caption */}
      <div className="absolute inset-x-0 bottom-0 p-3 pr-11">
        <div className="flex items-center gap-2">
          {data.pfp ? (
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full ring-2 ring-white/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.pfp}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: data.pfpPos }}
                draggable={false}
              />
            </div>
          ) : (
            <Avatar name={data.handle} hue={data.hue ?? 280} size={26} className="rounded-full ring-2 ring-white/60" />
          )}
          <span className="text-xs font-bold text-white">@{data.handle}</span>
        </div>
        <p className="mt-1 line-clamp-1 text-[11px] text-white/85">{data.caption}</p>
      </div>
    </div>
  );
}

/** Hero reel over a couple of others so the Shots scene feels populated.
 *  Each reel reveals (blur + fade + rise) with relative latency, then floats. */
function MockReel({ active }: { active: boolean }) {
  return (
    <div className="relative">
      {/* Background reels peeking from behind, floating on their own clocks */}
      <div className="absolute -left-20 top-7 opacity-50">
        <div style={reelReveal(active, 3)}>
          <Float dur="4.3s" delay="0.6s">
            <ReelCard data={BG_REELS[0]} w={134} h={238} />
          </Float>
        </div>
      </div>
      <div className="absolute -right-20 top-12 opacity-45">
        <div style={reelReveal(active, 4)}>
          <Float dur="3.6s" delay="0.2s">
            <ReelCard data={BG_REELS[1]} w={130} h={230} />
          </Float>
        </div>
      </div>

      {/* Hero reel — leads the reveal (after the copy) */}
      <div className="relative z-10">
        <div style={reelReveal(active, 2)}>
          <Float dur="3.9s" delay="0s">
            <ReelCard data={HERO_REEL} w={188} h={332} active={active} />
          </Float>
        </div>
      </div>
    </div>
  );
}

type Bubble = {
  deg: number;
  size: number;
  r?: number; // orbit radius (% of container)
  dur: string; // float duration
  delay: string; // float delay
  img?: string;
  pos?: string;
  name?: string;
  hue?: number;
};

// 10 profiles evenly around the disc; distinct dur/delay so neighbours never sync.
const DISCOVER_BUBBLES: Bubble[] = [
  { deg: -90, size: 52, r: 40, dur: "3.6s", delay: "0s", img: "/onboarding/maya.webp", pos: "50% 18%" },
  { deg: -54, size: 46, r: 41, dur: "4.4s", delay: "0.9s", img: "/onboarding/disc6.webp", pos: "50% 38%" },
  { deg: -18, size: 48, r: 39, dur: "3.1s", delay: "0.4s", img: "/onboarding/disc9.webp", pos: "50% 32%" },
  { deg: 18, size: 58, r: 40, dur: "4.7s", delay: "1.3s", img: "/onboarding/ada-pfp.webp", pos: "50% 22%" },
  { deg: 54, size: 46, r: 41, dur: "3.4s", delay: "0.2s", img: "/onboarding/disc7.webp", pos: "50% 38%" },
  { deg: 90, size: 50, r: 40, dur: "4.1s", delay: "0.7s", img: "/onboarding/jay-pfp.webp", pos: "50% 16%" },
  { deg: 126, size: 48, r: 41, dur: "3s", delay: "0.5s", img: "/onboarding/disc1.webp", pos: "50% 52%" },
  { deg: 162, size: 46, r: 39, dur: "4.6s", delay: "1.1s", img: "/onboarding/disc3.webp", pos: "50% 45%" },
  { deg: 198, size: 50, r: 40, dur: "3.8s", delay: "0.3s", img: "/onboarding/disc4.jpg", pos: "50% 48%" },
  { deg: 234, size: 44, r: 41, dur: "4.2s", delay: "1.5s", img: "/onboarding/disc5.webp", pos: "55% 45%" },
];

/** Orbiting avatars around a central Hypefy hub — "your people" constellation. */
function MockDiscover() {
  return (
    <div className="relative h-[300px] w-[300px]">
      {/* Filled dark disc */}
      <div
        className="absolute inset-3 rounded-full"
        style={{ background: "radial-gradient(circle at 50% 44%, #1d1d1d 0%, #121212 55%, #0b0b0b 100%)" }}
      />

      {/* Center hub — dark (not pitch black) so it stays distinct from the disc */}
      <div
        className="absolute left-1/2 top-1/2 z-10 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[22px] shadow-2xl ring-1 ring-white/15"
        style={{ background: "#262626" }}
      >
        <span className="text-3xl font-extrabold tracking-tight text-white">
          h<span className="text-accent">.</span>
        </span>
      </div>

      {/* Slowly orbiting ring — avatars counter-rotate to stay upright,
          and each still floats on its own clock */}
      <div className="absolute inset-0 animate-orbit">
        {DISCOVER_BUBBLES.map((b, i) => {
          const a = (b.deg * Math.PI) / 180;
          const r = b.r ?? 39;
          const x = 50 + r * Math.cos(a);
          const y = 50 + r * Math.sin(a);
          return (
            <div
              key={i}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div className="animate-orbit-reverse">
                <Float dur={b.dur} delay={b.delay}>
                  <div
                    className="overflow-hidden rounded-[28%] bg-elevated shadow-xl ring-2 ring-white/10"
                    style={{ width: b.size, height: b.size }}
                  >
                    {b.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.img}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ objectPosition: b.pos }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center font-bold text-white/95"
                        style={{
                          fontSize: b.size * 0.4,
                          background: `linear-gradient(140deg, hsl(${b.hue} 75% 52%), hsl(${((b.hue ?? 0) + 50) % 360} 70% 38%))`,
                        }}
                      >
                        {b.name?.[0]}
                      </div>
                    )}
                  </div>
                </Float>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
