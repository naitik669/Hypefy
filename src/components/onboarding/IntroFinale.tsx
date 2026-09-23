"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { haptics } from "@/lib/haptics";

/**
 * The moment between the last intro slide and signing up.
 *
 * A pile of posts, profiles and Shots rains down, pours into the Hypefy icon,
 * and comes back out as the people who are here — then the welcome and the
 * buttons arrive. Tapping anywhere skips to that last frame, which is also
 * what anyone who asked for less motion gets immediately.
 *
 * The scene is composed on a fixed 300×620 stage and scaled to the screen, so
 * every piece keeps its place on any phone. Coordinates below are from the
 * middle of that stage.
 */

const STAGE_W = 300;
const STAGE_H = 620;

const MARK_Y = 215; // where the icon waits under the pile
const HERO_Y = -112; // where it settles for the welcome

const GROW_AT = 450, GROW = 520, DROP_AT = 1050, DROP = 450;
const RAIN_AT = 1350, RAIN_GAP = 145, FALL = 640;
const PULL_AT = 3650;
const RISE_AT = 4800;
const BURST_AT = 5250;
const ASK_AT = 6500;

const IMG = (n: string) => `url('/onboarding/${n}')`;

/** The funnel: small at the top, fullest in the middle, tapering to the icon. */
const PILE: [string, number, number, number, number][] = [
  ["profA", 0, -232, -4, 0.5], ["post1", -42, -198, -9, 0.52], ["shot1", 44, -184, 9, 0.5],
  ["plate", -4, -152, -3, 0.8], ["post2", -50, -110, -10, 0.72], ["profB", 46, -98, 7, 0.72],
  ["frame", -6, -64, 4, 0.9], ["post3", -46, -16, -6, 0.8], ["shot2", 52, -8, 10, 0.8],
  ["chip", 2, 26, -4, 1], ["post4", -40, 70, 6, 0.5], ["bubble", 40, 74, -6, 0.95], ["post5", 6, 114, -8, 0.42],
];

/** What comes back out, placed by hand so nothing overlaps anything else. */
type FieldItem = { img?: string; art?: "ufo" | "sat" | "planet"; x: number; y: number; size?: number; dim: number; blur?: number; go?: number };
const FIELD: FieldItem[] = [
  { img: "disc6.webp", x: -102, y: -258, size: 46, dim: 0.85, blur: 0.3 },
  { art: "planet", x: 98, y: -266, dim: 0.85, go: 190 },
  { img: "maya.webp", x: -20, y: -204, size: 56, dim: 1 },
  { img: "jay-pfp.webp", x: 86, y: -190, size: 52, dim: 0.95 },
  { art: "ufo", x: -104, y: -140, dim: 1, go: -210 },
  { art: "sat", x: 104, y: -118, dim: 0.9, go: 200 },
  { img: "ada-pfp.webp", x: -96, y: -46, size: 50, dim: 0.9 },
  { img: "disc9.webp", x: 92, y: -34, size: 46, dim: 0.9 },
];

const CARD = "overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_14px_28px_-10px_#000e]";
const PFP = "shrink-0 bg-cover bg-[50%_18%] rounded-[30%]";

function Star() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#a3e635" aria-hidden>
      <path d="M12 2.4l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.6 5.9 21l1.4-6.8L2.2 9.5l6.9-.8z" />
    </svg>
  );
}

function PostCard({ pfp, img, name, time, hypes }: { pfp: string; img: string; name: string; time: string; hypes: string }) {
  return (
    <div className={`${CARD} w-[158px] p-[11px]`}>
      <div className="flex items-center gap-[9px]">
        <div className={`${PFP} h-8 w-8`} style={{ backgroundImage: IMG(pfp) }} />
        <div>
          <p className="text-xs font-extrabold leading-none">{name}</p>
          <p className="text-[9.5px] text-muted">{time}</p>
        </div>
      </div>
      <div className="mt-[9px] aspect-square rounded-[18px] bg-cover bg-center" style={{ backgroundImage: IMG(img) }} />
      <div className="mt-[9px] flex items-center gap-[13px] text-muted">
        <span className="flex items-center gap-[5px]">
          <Star />
          <b className="text-[11.5px] font-extrabold text-foreground">{hypes}</b>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.8-5a8.3 8.3 0 0 1-.8-3.6 8.4 8.4 0 0 1 8.5-8.3 8.4 8.4 0 0 1 8.5 7.9z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21.5 2.5L11 13M21.5 2.5l-6.7 19-3.8-8.5L2.5 9.2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function ProfileCard({ pfp, name, handle, tags }: { pfp: string; name: string; handle: string; tags: string[] }) {
  return (
    <div className={`${CARD} w-[156px]`}>
      <div className="h-10" style={{ background: "linear-gradient(115deg, rgba(163,230,53,0.20), rgba(109,40,217,0.28) 75%), #121212" }} />
      <div className="px-[11px] pb-[11px]">
        <div className="flex items-end justify-between">
          <div className="-mt-[22px] h-[46px] w-[46px] rounded-[30%] bg-cover bg-[50%_16%] shadow-[0_0_0_3px_var(--color-surface)]" style={{ backgroundImage: IMG(pfp) }} />
          <div className="flex gap-[9px] pb-0.5 text-center">
            {[["128", "Posts"], ["12.4k", "Hypes"], ["843", "Friends"]].map(([n, l]) => (
              <div key={l}>
                <b className="block text-[10.5px] font-extrabold leading-none">{n}</b>
                <span className="text-[8px] text-muted">{l}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[12.5px] font-extrabold">{name}</p>
        <p className="text-[10px] text-muted">@{handle}</p>
        <div className="mt-[7px] flex gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-[7px] border border-border bg-elevated px-1.5 py-[3px] text-[8.5px] font-semibold">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShotCard({ img, caption }: { img: string; caption: string }) {
  return (
    <div className={`${CARD} relative h-[152px] w-[92px] rounded-[20px] bg-cover bg-center`} style={{ backgroundImage: IMG(img) }}>
      <span className="absolute left-1/2 top-1/2 -ml-1.5 -mt-2.5 border-y-[10px] border-l-[15px] border-y-transparent border-l-white/90" />
      <p className="absolute inset-x-[9px] bottom-[9px] text-[9.5px] font-bold text-white [text-shadow:0_1px_6px_#000b]">{caption}</p>
    </div>
  );
}

const PIECES: Record<string, React.ReactNode> = {
  profA: <ProfileCard pfp="maya.webp" name="Maya Rivera" handle="maya" tags={["Creator", "Film"]} />,
  profB: <ProfileCard pfp="jay-pfp.webp" name="Jay Osei" handle="jay.wav" tags={["Sunsets", "Indie"]} />,
  post1: <PostCard pfp="ada-pfp.webp" img="disc6.webp" name="ada" time="2m ago" hypes="2.4k" />,
  post2: <PostCard pfp="maya.webp" img="post-sample.jpg" name="maya" time="12m ago" hypes="941" />,
  post3: <PostCard pfp="jay-pfp.webp" img="leo-post.jpg" name="jay" time="1h ago" hypes="3.1k" />,
  post4: <PostCard pfp="ada-pfp.webp" img="disc1.webp" name="nia" time="3h ago" hypes="612" />,
  post5: <PostCard pfp="maya.webp" img="disc5.webp" name="leo" time="5h ago" hypes="1.8k" />,
  shot1: <ShotCard img="disc9.webp" caption="late night energy" />,
  shot2: <ShotCard img="ada-post.webp" caption="she found the sun" />,
  plate: <span className="whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-extrabold text-white shadow-[0_14px_28px_-10px_#000e]" style={{ background: "linear-gradient(135deg,#c86bff,#ff5bb8)" }}>HYPE</span>,
  frame: (
    <span className="block h-16 w-16 rounded-[30%] p-1 shadow-[0_14px_28px_-10px_#000e]" style={{ background: "conic-gradient(#a3e635,#3dd6ff,#c86bff,#ff5bb8,#a3e635)" }}>
      <span className="block h-full w-full rounded-[26%] border-[3px] border-background bg-cover bg-center" style={{ backgroundImage: IMG("ada-pfp.webp") }} />
    </span>
  ),
  chip: (
    <span className="flex items-center gap-[5px] whitespace-nowrap rounded-[11px] bg-accent px-3 py-[7px] text-xs font-extrabold text-accent-ink shadow-[0_14px_28px_-10px_#000e]">
      <Star /> HYPED
    </span>
  ),
  bubble: <span className="whitespace-nowrap rounded-[16px_16px_16px_5px] bg-[#2b2b2b] px-3 py-2 text-xs font-semibold shadow-[0_14px_28px_-10px_#000e]">slide in?</span>,
};

const ART = {
  ufo: (
    <svg width="132" height="84" viewBox="0 0 240 150" aria-hidden>
      <path d="M79 72 A41 38 0 0 1 161 72 Z" fill="#1c1c1c" stroke="#333" strokeWidth="2.4" />
      <path d="M98 48 Q108 38 122 37" stroke="#333" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M120 33 V18" stroke="#333" strokeWidth="3" strokeLinecap="round" />
      <circle cx="120" cy="15" r="4.8" fill="#333" />
      <ellipse cx="120" cy="84" rx="101" ry="24" fill="#262626" />
      <ellipse cx="120" cy="77" rx="101" ry="12" fill="#333" />
      {[[58, 91], [96, 97], [144, 97], [182, 91]].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="5.4" fill="#3d3d3d" />
      ))}
    </svg>
  ),
  sat: (
    <svg width="74" height="58" viewBox="0 0 120 94" aria-hidden>
      <rect x="48" y="30" width="26" height="34" rx="6" fill="#1c1c1c" stroke="#333" strokeWidth="2.4" />
      <rect x="10" y="34" width="32" height="26" rx="4" fill="#262626" stroke="#333" strokeWidth="2" />
      <rect x="80" y="34" width="32" height="26" rx="4" fill="#262626" stroke="#333" strokeWidth="2" />
      <path d="M61 30 V16" stroke="#333" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M50 14 A16 16 0 0 1 72 14" stroke="#333" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="61" cy="74" r="4" fill="#3d3d3d" />
    </svg>
  ),
  planet: (
    <svg width="64" height="50" viewBox="0 0 100 78" aria-hidden>
      <circle cx="50" cy="39" r="22" fill="#1f1f1f" stroke="#333" strokeWidth="2.2" />
      <ellipse cx="50" cy="42" rx="44" ry="11" fill="none" stroke="#333" strokeWidth="2.6" transform="rotate(-14 50 42)" />
      <circle cx="42" cy="33" r="4" fill="#2b2b2b" />
      <circle cx="57" cy="46" r="3" fill="#2b2b2b" />
    </svg>
  ),
};

const T = (x: number, y: number, r = 0, s = 1, extra = "") =>
  `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${r}deg) scale(${s}) ${extra}`;
const M = (y: number, s = 1, r = 0) => `translateY(${y}px) scale(${s}) rotate(${r}deg)`;

export function IntroFinale() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const pile = useRef<(HTMLDivElement | null)[]>([]);
  const field = useRef<(HTMLDivElement | null)[]>([]);
  const scrim = useRef<HTMLDivElement>(null);
  const words = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const el = stage.current;
    if (!el || !mark.current) return;

    // Everything is already in its final place in the markup for anyone who
    // asked for less motion; the animation only runs when motion is welcome.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Marks the whole screen, not just the stage: the words and buttons
      // live outside it and have to appear too.
      root.current?.setAttribute("data-done", "1");
      return;
    }

    const made: Animation[] = [];
    const anim = (node: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => {
      // "forwards", not "both": a later stage must not paint its first frame
      // during its delay.
      const a = node.animate(frames, { fill: "forwards", ...o });
      a.persist();
      made.push(a);
      return a;
    };

    // The icon: pops in, grows as if the app is opening, then drops under
    // where the pile will land.
    anim(mark.current, [
      { opacity: 0, transform: M(0, 0.6) },
      { opacity: 1, transform: M(0, 1.08), offset: 0.6 },
      { opacity: 1, transform: M(0, 1) },
    ], { duration: 380, easing: "cubic-bezier(.34,1.4,.64,1)" });
    anim(mark.current, [
      { transform: M(0, 1) }, { transform: M(0, 0.94), offset: 0.15 }, { transform: M(0, 2.6) },
    ], { duration: GROW, delay: GROW_AT, easing: "cubic-bezier(.5,0,.2,1)" });
    anim(mark.current, [
      { transform: M(0, 2.6) },
      { transform: M(MARK_Y + 10, 0.8), offset: 0.8 },
      { transform: M(MARK_Y, 0.85) },
    ], { duration: DROP, delay: DROP_AT, easing: "cubic-bezier(.5,0,.3,1)" });

    // The rain, and then the pour: the bottom of the pile drains first, each
    // piece stretching into a streak on its way in.
    const n = PILE.length;
    PILE.forEach(([, x, y, r, s], i) => {
      const p = pile.current[i];
      if (!p) return;
      anim(p, [
        { opacity: 0, transform: T(x * 0.3, -430, r - 20, s * 0.9, "rotateX(55deg)") },
        { opacity: 1, transform: T(x, y + 12, r + 4, s * 1.03, "rotateX(-6deg)"), offset: 0.7 },
        { opacity: 1, transform: T(x, y - 2, r - 1, s, "rotateX(2deg)"), offset: 0.86 },
        { opacity: 1, transform: T(x, y, r, s, "rotateX(0deg)") },
      ], { duration: FALL, delay: RAIN_AT + i * RAIN_GAP, easing: "cubic-bezier(.3,.9,.4,1)" });

      const dy = MARK_Y - y;
      anim(p, [
        { opacity: 1, transform: T(x, y, r, s), filter: "blur(0)" },
        { opacity: 1, transform: T(x * 1.06, y - 10, r, s * 1.04), filter: "blur(0)", offset: 0.14 },
        { opacity: 1, transform: T(x * 0.35, y + dy * 0.45, r * 0.3, s, "scaleX(.62) scaleY(1.7)"), filter: "blur(3px)", offset: 0.6 },
        { opacity: 0, transform: T(0, MARK_Y, 0, 0.12, "scaleX(.4) scaleY(2.4)"), filter: "blur(9px)" },
      ], { duration: 560, delay: PULL_AT + (n - 1 - i) * 55, easing: "cubic-bezier(.62,0,.9,.55)" });
    });

    // The icon gulps as the pile arrives, then rises to the middle.
    const span = 560 + (n - 1) * 55;
    const gulp: Keyframe[] = [{ transform: M(MARK_Y, 0.85) }];
    for (let g = 0; g < 3; g++) {
      const o = (g + 0.5) / 3;
      gulp.push({ transform: M(MARK_Y, 1.05 + g * 0.06, g % 2 ? 4 : -4), offset: o - 0.04 });
      gulp.push({ transform: M(MARK_Y, 0.9 + g * 0.04), offset: o + 0.04 });
    }
    gulp.push({ transform: M(MARK_Y, 1.05) });
    anim(mark.current, gulp, { duration: span, delay: PULL_AT + 120, easing: "ease-in-out" });
    anim(mark.current, [
      { transform: M(MARK_Y, 1.05) },
      { transform: M(MARK_Y, 1.3), offset: 0.18 },
      { transform: M(MARK_Y - 20, 1.18), offset: 0.32 },
      { transform: M(HERO_Y - 8, 1.5), offset: 0.85 },
      { transform: M(HERO_Y, 1.44) },
    ], { duration: 900, delay: RISE_AT, easing: "cubic-bezier(.45,0,.2,1)" });

    // Everything it swallowed comes back out and takes its place.
    FIELD.forEach((it, i) => {
      const f = field.current[i];
      if (!f) return;
      const at = (k: number, drift = 0) =>
        `translate(-50%,-50%) translate(${it.x * k + drift}px,${HERO_Y + (it.y - HERO_Y) * k}px) scale(${0.18 + 0.82 * k})`;
      anim(f, [
        { opacity: 0, transform: at(0.06) },
        { opacity: it.dim, transform: at(1.05), offset: 0.75 },
        { opacity: it.dim, transform: at(1) },
      ], { duration: 760, delay: BURST_AT + i * 70, easing: "cubic-bezier(.2,.9,.35,1)" });

      if (it.art) {
        // The drawings drift out of frame and come back round; the photos
        // only breathe.
        anim(f, [
          { opacity: it.dim, transform: at(1) },
          { opacity: it.dim, transform: at(1, (it.go ?? 0) * 0.35), offset: 0.42 },
          { opacity: 0, transform: at(1, it.go ?? 0), offset: 0.6 },
          { opacity: 0, transform: at(1, -(it.go ?? 0)), offset: 0.72 },
          { opacity: it.dim, transform: at(1) },
        ], { duration: 5200, delay: BURST_AT + i * 70 + 900, iterations: Infinity, easing: "cubic-bezier(.4,0,.5,1)" });
      } else {
        anim(f, [
          { transform: at(1) }, { transform: at(1.03), offset: 0.5 }, { transform: at(1) },
        ], { duration: 3000, delay: BURST_AT + i * 70 + 760, easing: "ease-in-out" });
      }
    });

    if (scrim.current) anim(scrim.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: ASK_AT - 250 });

    const rise: Keyframe[] = [
      { opacity: 0, transform: "translateY(18px)", filter: "blur(6px)" },
      { opacity: 1, transform: "translateY(-3px)", filter: "blur(0)", offset: 0.7 },
      { opacity: 1, transform: "none", filter: "blur(0)" },
    ];
    const spring: Keyframe[] = [
      { opacity: 0, transform: "translateY(22px) scale(.92)" },
      { opacity: 1, transform: "translateY(-4px) scale(1.02)", offset: 0.65 },
      { opacity: 1, transform: "none" },
    ];
    const at = [ASK_AT, ASK_AT + 260, ASK_AT + 560, ASK_AT + 700, ASK_AT + 920];
    words.current.forEach((w, i) => {
      if (!w) return;
      anim(w, i < 2 ? rise : spring, {
        duration: i < 2 ? 700 : 650,
        delay: at[i],
        easing: i < 2 ? "cubic-bezier(.2,1,.3,1)" : "cubic-bezier(.34,1.3,.64,1)",
      });
    });

    return () => made.forEach((a) => a.cancel());
  }, []);

  /** A tap anywhere jumps to the last frame — nobody should be made to wait. */
  function skip() {
    const el = stage.current;
    if (!el || root.current?.hasAttribute("data-done")) return;
    haptics.tap();
    el.getAnimations({ subtree: true }).forEach((a) => {
      // The looping drawings have no end to jump to; leave them running.
      if (a.effect?.getTiming().iterations !== Infinity) a.finish();
    });
  }

  return (
    <div
      ref={root}
      className="fixed inset-0 z-50 overflow-hidden bg-background [&[data-done]_.fin]:opacity-100"
      onPointerDown={skip}
      style={{ ["--stage" as string]: `min(100vw / ${STAGE_W}, 100dvh / ${STAGE_H})` }}
    >
      {/* The scene is composed at 300×620 and scaled, so the layout holds on
          any screen. data-done is the reduced-motion state: everything sits
          in its final place with no animation at all. */}
      <div
        ref={stage}
        className="absolute left-1/2 top-1/2 h-[620px] w-[300px] -translate-x-1/2 -translate-y-1/2 [perspective:700px]"
        style={{ scale: "var(--stage)" }}
      >
        {PILE.map(([kind], i) => (
          <div
            key={kind}
            ref={(n) => { pile.current[i] = n; }}
            className="absolute left-1/2 top-1/2 opacity-0 [transform-style:preserve-3d] [will-change:transform,opacity,filter]"
          >
            {PIECES[kind]}
          </div>
        ))}

        {FIELD.map((it, i) => (
          <div
            key={it.img ?? it.art}
            ref={(n) => { field.current[i] = n; }}
            className={`fin absolute left-1/2 top-1/2 opacity-0 [will-change:transform,opacity] ${it.img ? "rounded-[30%] bg-cover bg-center" : ""}`}
            style={
              it.img
                ? {
                    width: it.size, height: it.size, backgroundImage: IMG(it.img),
                    filter: it.blur ? `blur(${it.blur}px)` : undefined,
                    transform: T(it.x, it.y), opacity: undefined,
                  }
                : { transform: T(it.x, it.y) }
            }
          >
            {it.art ? ART[it.art] : null}
          </div>
        ))}

        {/* The app icon, all the way through. */}
        <div
          ref={mark}
          className="fin absolute left-1/2 top-1/2 z-20 -ml-8 -mt-8 grid h-16 w-16 place-items-center rounded-[20px] bg-black text-white opacity-0 shadow-[inset_0_0_0_1px_#ffffff26,0_10px_30px_-8px_#000]"
          style={{ transform: M(HERO_Y, 1.44) }}
        >
          <svg viewBox="0 0 40 40" className="h-[62%] w-[62%]" aria-hidden>
            <rect fill="currentColor" x="7.7" y="5.8" width="7" height="28.4" />
            <rect fill="currentColor" x="25.5" y="5.8" width="6.8" height="28.4" />
            <rect fill="currentColor" x="7.7" y="16.8" width="24.6" height="5.8" />
            <rect fill="#a3e635" x="35" y="29.6" width="4.6" height="4.6" />
          </svg>
        </div>
      </div>

      {/* The join between the top half and the buttons. */}
      <div
        ref={scrim}
        aria-hidden
        className="fin pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[56%] opacity-0"
        style={{
          background:
            "radial-gradient(120% 78% at 50% 118%, rgba(163,230,53,0.20), rgba(163,230,53,0.05) 42%, rgba(10,10,10,0) 72%), linear-gradient(to top, #0a0a0a 26%, rgba(10,10,10,0.88) 52%, rgba(10,10,10,0) 100%)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 z-30 mx-auto grid max-w-[420px] gap-2.5 px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] text-center">
        <h1 ref={(n) => { words.current[0] = n; }} className="fin text-[27px] font-extrabold leading-[1.08] tracking-[-0.025em] opacity-0">
          Welcome to Hypefy<span className="text-accent">.</span>
        </h1>
        <p ref={(n) => { words.current[1] = n; }} className="fin mb-2.5 text-sm font-semibold text-muted opacity-0">
          Where your personality lives.
        </p>
        <Link
          ref={(n) => { words.current[2] = n; }}
          href="/signup"
          onClick={() => haptics.tap()}
          className="fin flex w-full items-center justify-center rounded-2xl bg-accent py-[15px] text-[15px] font-extrabold text-accent-ink opacity-0 transition-transform active:scale-[0.97]"
        >
          Create account
        </Link>
        {/* Google needs the age and consent answers first, and those live on
            the signup form — so this opens it pointed at that path rather
            than starting an OAuth flow that would skip the gate. */}
        <Link
          ref={(n) => { words.current[3] = n; }}
          href="/signup?via=google"
          onClick={() => haptics.tap()}
          className="fin flex w-full items-center justify-center gap-2.5 rounded-2xl bg-elevated py-[15px] text-[15px] font-extrabold text-foreground opacity-0 transition-transform active:scale-[0.97]"
        >
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h11.8a10 10 0 0 1-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.4z" />
            <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7A22 22 0 0 0 24 46z" />
            <path fill="#FBBC05" d="M11.8 28.3a13 13 0 0 1 0-8.6v-5.7H4.5a22 22 0 0 0 0 20l7.3-5.7z" />
            <path fill="#EA4335" d="M24 10.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 30 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z" />
          </svg>
          Continue with Google
        </Link>
        <Link
          ref={(n) => { words.current[4] = n; }}
          href="/signin"
          onClick={() => haptics.tap()}
          className="fin mt-1 text-[13px] text-muted opacity-0"
        >
          Already have an account? <span className="font-bold text-foreground">Sign in</span>
        </Link>
      </div>
    </div>
  );
}
