/**
 * The animations for reacting to a page.
 *
 * Drawn on fixed-position elements in <body>, so no card's overflow clips
 * them, and each removed when its animation ends. With reduced motion they
 * shrink to a short fade. Where the Web Animations API is missing (old
 * WebViews, tests) nothing is drawn and nothing breaks.
 */

const canAnimate = () =>
  typeof document !== "undefined" && typeof document.createElement("span").animate === "function";
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

function spawn(x: number, y: number, content: string, size: number): HTMLSpanElement {
  const el = document.createElement("span");
  el.textContent = content;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    fontSize: `${size}px`,
    lineHeight: "1",
    pointerEvents: "none",
    zIndex: "120",
    transform: "translate(-50%, -50%)",
    willChange: "transform, opacity",
  });
  document.body.appendChild(el);
  return el;
}

const at = (dx: number, dy: number, scale: number, rot = 0) =>
  `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale}) rotate(${rot}deg)`;

function run(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  const a = el.animate(frames, { fill: "both", ...opts });
  a.onfinish = () => el.remove();
  return a;
}

/** The button you pressed: pressed in, springs out. */
function squash(el: Element) {
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.72)", offset: 0.25 },
      { transform: "scale(1.28)", offset: 0.6 },
      { transform: "scale(1)" },
    ],
    { duration: 420, easing: "ease-out" }
  );
}

/** A ring spreading out from a point, like a drop landing. */
function ripple(x: number, y: number, color: string) {
  const ring = document.createElement("span");
  ring.setAttribute("aria-hidden", "true");
  Object.assign(ring.style, {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    width: "36px",
    height: "36px",
    borderRadius: "999px",
    border: `2px solid ${color}`,
    pointerEvents: "none",
    zIndex: "119",
    transform: "translate(-50%, -50%)",
  });
  document.body.appendChild(ring);
  run(ring, [
    { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0.8 },
    { transform: "translate(-50%, -50%) scale(2.4)", opacity: 0 },
  ], { duration: 520, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
}

/**
 * Sending an emoji to someone's page.
 *
 * The button squashes and a ring spreads from it; the emoji pops up large in
 * the middle of their page (`stage`), gives a little wiggle, then shrinks
 * away into their avatar (`to`) — delivered — while a stream of smaller
 * copies drifts up from your finger and fades, the way reactions float up a
 * live video.
 */
export function flyEmoji(emoji: string, from: Element, to: Element | null, stage?: Element | null) {
  if (!canAnimate()) return;
  const b = centre(from);
  squash(from);

  if (reduced()) {
    const el = spawn(b.x, b.y, emoji, 26);
    run(el, [
      { transform: at(0, 0, 1), opacity: 1 },
      { transform: at(0, -24, 1.15), opacity: 0 },
    ], { duration: 520, easing: "ease-out" });
    return;
  }

  ripple(b.x, b.y, "rgb(255 255 255 / 0.55)");

  // The hero: pops up in the middle of the page, then goes to them.
  const c = stage ? centre(stage) : { x: b.x, y: b.y - 150 };
  const t = to ? centre(to) : { x: c.x, y: c.y - 180 };
  const hero = spawn(c.x, c.y, emoji, 60);
  run(hero, [
    { transform: at(b.x - c.x, b.y - c.y, 0.3), opacity: 0, offset: 0 },
    { transform: at(0, 0, 1.4, -6), opacity: 1, offset: 0.2 },
    { transform: at(0, 0, 1, 0), opacity: 1, offset: 0.32 },
    { transform: at(0, 0, 1.05, -9), opacity: 1, offset: 0.42 },
    { transform: at(0, 0, 1.05, 7), opacity: 1, offset: 0.52 },
    { transform: at(0, 0, 1, 0), opacity: 1, offset: 0.62 },
    { transform: at(t.x - c.x, t.y - c.y, 0.3, 0), opacity: 0.2, offset: 1 },
  ], { duration: 1250, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" }).onfinish = () => {
    hero.remove();
    to?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
      { duration: 340, easing: "cubic-bezier(0.3, 1.6, 0.5, 1)" }
    );
  };

  // The stream: small copies drifting up from your finger, swaying, fading.
  for (let i = 0; i < 9; i++) {
    const size = 15 + Math.random() * 12;
    const rise = 150 + Math.random() * 110;
    const sway = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 22);
    const start = (Math.random() - 0.5) * 24;
    const el = spawn(b.x + start, b.y, emoji, size);
    run(el, [
      { transform: at(0, 0, 0.4, 0), opacity: 0 },
      { transform: at(sway * 0.4, -rise * 0.25, 1, sway * 0.3), opacity: 1, offset: 0.2 },
      { transform: at(-sway * 0.5, -rise * 0.6, 0.95, -sway * 0.3), opacity: 0.9, offset: 0.6 },
      { transform: at(sway, -rise, 0.8, sway * 0.4), opacity: 0 },
    ], { duration: 1000 + Math.random() * 600, delay: i * 55 + Math.random() * 90, easing: "ease-out" });
  }
}

/**
 * Hyping a page: the star pops, and sparks fly out from it in a ring —
 * quick and bright, for a thing that is on or off.
 */
export function starBurst(from: Element) {
  if (!canAnimate()) return;
  squash(from);
  if (reduced()) return;
  const b = centre(from);
  ripple(b.x, b.y, "rgb(163 230 53 / 0.8)");
  const sparks = ["✦", "⭐", "✦", "✨", "✦", "⭐", "✦", "✨"];
  sparks.forEach((s, i) => {
    const angle = (i / sparks.length) * Math.PI * 2 - Math.PI / 2;
    const dist = 34 + (i % 2) * 14;
    const el = spawn(b.x, b.y, s, i % 2 ? 11 : 14);
    el.style.color = "#a3e635";
    run(el, [
      { transform: at(0, 0, 0.3), opacity: 1 },
      { transform: at(Math.cos(angle) * dist, Math.sin(angle) * dist, 1, i * 20), opacity: 0 },
    ], { duration: 560, delay: 20, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" });
  });
}
