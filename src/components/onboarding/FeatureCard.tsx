import { HypeMascot } from "@/components/mascot/HypeMascot";
import type { MascotMood } from "@/lib/profile";

type IconType = React.ComponentType<{ size?: number; className?: string }>;

export function FeatureCard({
  icon: Icon,
  mascot,
  title,
  text,
  from,
  to,
}: {
  icon?: IconType;
  mascot?: MascotMood;
  title: string;
  text: string;
  from: number;
  to: number;
}) {
  return (
    <div className="flex w-[78vw] max-w-[300px] shrink-0 snap-center flex-col items-center rounded-3xl border border-border bg-surface/60 p-7 text-center backdrop-blur-sm">
      <div className="flex h-28 w-full items-center justify-center">
        {mascot ? (
          <HypeMascot mood={mascot} size="lg" animated />
        ) : (
          <span
            className="flex h-20 w-20 items-center justify-center rounded-3xl text-white"
            style={{
              background: `linear-gradient(135deg, hsl(${from} 80% 55%), hsl(${to} 70% 35%))`,
            }}
          >
            {Icon && <Icon size={34} />}
          </span>
        )}
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}
