"use client";

/** Shared pill-style switch used across settings pages. */
export function SettingToggle({
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-white/[0.03] disabled:opacity-50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface ring-1 ring-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
