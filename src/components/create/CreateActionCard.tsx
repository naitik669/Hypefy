import { ChevronRight } from "lucide-react";

type IconType = React.ComponentType<{ size?: number; className?: string }>;

export function CreateActionCard({
  icon: Icon,
  title,
  text,
  from,
  to,
  onClick,
}: {
  icon: IconType;
  title: string;
  text: string;
  from: number;
  to: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-card border border-border bg-surface p-4 text-left transition-transform active:scale-[0.99]"
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${from} 80% 55%), hsl(${to} 70% 35%))`,
        }}
      >
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      <ChevronRight size={20} className="shrink-0 text-faint" />
    </button>
  );
}
