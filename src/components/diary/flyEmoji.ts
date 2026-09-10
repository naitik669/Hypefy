/**
 * Send an emoji flying from the button you tapped to the person you sent it
 * to — up in an arc, growing on the way, shrinking into their avatar, which
 * gives a small bump when it lands. A few smaller copies burst out where you
 * tapped. That is the whole acknowledgement: nothing stays lit on the button,
 * because the reaction has gone — to them, in your DMs.
 *
 * Drawn on fixed-position spans in <body> so no card's overflow can clip the
 * flight, and removed when each animation ends. With reduced motion, the
 * emoji just rises a little and fades. Where the Web Animations API is
 * missing (old WebViews, tests) nothing is drawn at all.
 */
export function flyEmoji(emoji: string, from: Element, to: Element | null) {
  if (typeof document === "undefined") return;
  const probe = document.createElement("span");
  if (typeof probe.animate !== "function") return;

  const a = from.getBoundingClientRect();
  const x = a.left + a.width / 2;
  const y = a.top + a.height / 2;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const spawn = (size: number) => {
    const el = document.createElement("span");
    el.textContent = emoji;
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
  };
  const at = (dx: number, dy: number, scale: number, rot = 0) =>
    `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale}) rotate(${rot}deg)`;

  if (reduce) {
    const el = spawn(22);
    el.animate(
      [
        { transform: at(0, 0, 1), opacity: 1 },
        { transform: at(0, -28, 1.2), opacity: 0 },
      ],
      { duration: 500, easing: "ease-out" }
    ).onfinish = () => el.remove();
    return;
  }

  // Where it lands: the avatar, or straight up if there is none on screen.
  let dx = 0;
  let dy = -160;
  if (to) {
    const b = to.getBoundingClientRect();
    dx = b.left + b.width / 2 - x;
    dy = b.top + b.height / 2 - y;
  }

  const main = spawn(24);
  const flight = main.animate(
    [
      { transform: at(0, 0, 1), opacity: 1, offset: 0 },
      { transform: at(dx * 0.3, Math.min(dy * 0.45, 0) - 70, 2.2, -10), opacity: 1, offset: 0.42 },
      { transform: at(dx * 0.85, dy * 0.9, 1, 6), opacity: 1, offset: 0.85 },
      { transform: at(dx, dy, 0.4, 0), opacity: 0, offset: 1 },
    ],
    { duration: 900, easing: "cubic-bezier(0.33, 0.8, 0.35, 1)" }
  );
  flight.onfinish = () => {
    main.remove();
    to?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(1)" }],
      { duration: 320, easing: "cubic-bezier(0.3, 1.6, 0.5, 1)" }
    );
  };

  // The burst where you tapped.
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i - 2) * 0.55;
    const dist = 38 + (i % 2) * 14;
    const spark = spawn(13);
    spark.animate(
      [
        { transform: at(0, 0, 0.6), opacity: 0.95 },
        { transform: at(Math.cos(angle) * dist, Math.sin(angle) * dist, 1, (i - 2) * 18), opacity: 0 },
      ],
      { duration: 560, delay: 30, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "backwards" }
    ).onfinish = () => spark.remove();
  }
}
