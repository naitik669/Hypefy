import { Star } from "lucide-react";

const dirs = [
  { dx: "-22px", dy: "-26px" },
  { dx: "22px", dy: "-30px" },
  { dx: "-28px", dy: "-4px" },
  { dx: "28px", dy: "-2px" },
  { dx: "0px", dy: "-36px" },
];

/** A small burst of gold stars flying outward — overlaid on the Hype source. */
export function HypeParticles({ size = 10 }: { size?: number }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dirs.map((d, i) => (
        <Star
          key={i}
          size={size}
          fill="currentColor"
          className="animate-hype-particle absolute text-hype"
          style={{ ["--dx"]: d.dx, ["--dy"]: d.dy } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
