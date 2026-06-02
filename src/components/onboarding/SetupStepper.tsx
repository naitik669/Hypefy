"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { HypeMascot } from "@/components/mascot/HypeMascot";
import { Avatar } from "@/components/ui/Avatar";
import { saveProfile } from "@/app/setup-profile/actions";
import type { MascotMood } from "@/lib/profile";

const TOTAL_STEPS = 6;
const HUES = [280, 200, 150, 30, 330, 95, 250, 10, 180, 45];

const VIBES = [
  "Creator mode",
  "Chill",
  "Building",
  "Studying",
  "Gaming",
  "Meme mood",
  "Offline-ish",
  "Late night",
];

type FormState = {
  displayName: string;
  username: string;
  avatarHue: number;
  bio: string;
  vibe: string;
};

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

const stepMoods: MascotMood[] = [
  "friendly",   // 0: Name
  "thinking",   // 1: Username
  "curious",    // 2: Avatar
  "watching",   // 3: Bio
  "hype",       // 4: Vibe
  "welcome",    // 5: Complete
];

export function SetupStepper({
  userId,
  initial,
}: {
  userId: string;
  initial: FormState;
}) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [uStatus, setUStatus] = useState<UsernameStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slideDir, setSlideDir] = useState<"in" | "back">("in");

  /* ── field helpers ───────────────────────────────────────── */
  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setError(null);
  }

  function onUsernameChange(raw: string) {
    const u = raw.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    set("username", u);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!/^[a-z0-9_.]{3,20}$/.test(u)) {
      setUStatus(u.length === 0 ? "idle" : "invalid");
      return;
    }
    setUStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", u)
        .maybeSingle();
      setUStatus(data && data.id !== userId ? "taken" : "available");
    }, 450);
  }

  /* ── navigation ─────────────────────────────────────────── */
  function canAdvance() {
    switch (step) {
      case 0: return form.displayName.trim().length >= 2;
      case 1:
        return (
          /^[a-z0-9_.]{3,20}$/.test(form.username) && uStatus === "available"
        );
      default: return true;
    }
  }

  function next() {
    setSlideDir("in");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    setError(null);
  }

  function back() {
    setSlideDir("back");
    setStep((s) => Math.max(s - 1, 0));
    setError(null);
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const res = await saveProfile({
        displayName: form.displayName,
        username: form.username,
        bio: form.bio,
        currentVibe: form.vibe,
        avatarHue: form.avatarHue,
      });
      if (res?.error) setError(res.error);
    });
  }

  const mood = stepMoods[step] ?? "friendly";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Progress bar ────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/90 px-5 pb-3 pt-4 backdrop-blur-xl">
        {step < TOTAL_STEPS - 1 && (
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 overflow-hidden rounded-full bg-border"
              >
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                  style={{ width: i <= step ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step content ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col px-5 pb-32">
        {/* Mascot */}
        <div className="flex justify-center py-6">
          <HypeMascot mood={mood} size="md" animated />
        </div>

        {/* Step body */}
        {step === 0 && (
          <StepName value={form.displayName} onChange={(v) => set("displayName", v)} />
        )}
        {step === 1 && (
          <StepUsername
            value={form.username}
            status={uStatus}
            onChange={onUsernameChange}
          />
        )}
        {step === 2 && (
          <StepAvatar
            displayName={form.displayName}
            avatarHue={form.avatarHue}
            onChange={(h) => set("avatarHue", h)}
          />
        )}
        {step === 3 && (
          <StepBio value={form.bio} onChange={(v) => set("bio", v)} />
        )}
        {step === 4 && (
          <StepVibe value={form.vibe} onChange={(v) => set("vibe", v)} />
        )}
        {step === 5 && (
          <StepComplete form={form} />
        )}
      </div>

      {/* ── Bottom CTA ───────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-gradient-to-t from-background via-background to-transparent px-5 pb-8 pt-4">
        {error && (
          <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <button
              type="button"
              onClick={back}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill border border-border text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={step === TOTAL_STEPS - 1 ? finish : next}
            disabled={!canAdvance() || pending}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink shadow-[0_0_24px_2px_rgba(200,255,0,0.3)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Setting up…
              </>
            ) : step === TOTAL_STEPS - 1 ? (
              <>
                Enter Hypefy
                <ArrowRight size={20} strokeWidth={2.6} />
              </>
            ) : step === TOTAL_STEPS - 2 ? (
              <>
                Finish
                <ArrowRight size={20} strokeWidth={2.6} />
              </>
            ) : (
              <>
                Next
                <ArrowRight size={20} strokeWidth={2.6} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 0 — Name ─────────────────────────────────────────── */
function StepName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        title="What should people call you?"
        sub="This is how your name appears across Hypefy."
      />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 30))}
        maxLength={30}
        placeholder="Your name"
        className="input mt-4"
      />
      <p className="mt-1 text-right text-xs text-faint">{value.length}/30</p>
    </div>
  );
}

/* ─── Step 1 — Username ─────────────────────────────────────── */
function StepUsername({
  value,
  status,
  onChange,
}: {
  value: string;
  status: UsernameStatus;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader
        title="Claim your Hypefy name"
        sub="Pick a username people can find you with."
      />

      <div className="mt-4 flex h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent/40">
        <span className="shrink-0 text-sm text-faint">hypefy.chat/@</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="username"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
        />
        {status === "checking" && (
          <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
        )}
        {status === "available" && (
          <Check size={16} className="shrink-0 text-accent" />
        )}
      </div>

      {status === "taken" && (
        <p className="mt-1 text-xs text-danger">That username is taken.</p>
      )}
      {status === "invalid" && value.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          3–20 characters: a–z, 0–9, dot, underscore.
        </p>
      )}
    </div>
  );
}

/* ─── Step 2 — Avatar ───────────────────────────────────────── */
function StepAvatar({
  displayName,
  avatarHue,
  onChange,
}: {
  displayName: string;
  avatarHue: number;
  onChange: (h: number) => void;
}) {
  return (
    <div>
      <StepHeader
        title="Choose your face card"
        sub="Pick a color — you can update your photo later."
      />

      {/* Preview */}
      <div className="mt-4 flex justify-center">
        <Avatar name={displayName || "?"} hue={avatarHue} size={88} className="rounded-[28px]" />
      </div>

      {/* Color picker */}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {HUES.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            className="h-12 w-12 rounded-2xl transition-all"
            style={{
              background: `linear-gradient(140deg, hsl(${h} 75% 52%), hsl(${(h + 50) % 360} 70% 38%))`,
              outline: avatarHue === h ? "3px solid var(--color-accent)" : "none",
              outlineOffset: "2px",
            }}
            aria-label={`Color ${h}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Step 3 — Bio ──────────────────────────────────────────── */
function StepBio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        title="Add your vibe"
        sub="A short line that tells people what you are about."
      />
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 160))}
        rows={3}
        placeholder="creator mode, late night energy, building quietly..."
        className="input mt-4 resize-none"
      />
      <p className="mt-1 text-right text-xs text-faint">{value.length}/160</p>
    </div>
  );
}

/* ─── Step 4 — Vibe ─────────────────────────────────────────── */
function StepVibe({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        title="What is your current vibe?"
        sub="This can change anytime."
      />

      {/* Quick-select pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {VIBES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? "" : v)}
            className={`rounded-pill border px-4 py-2 text-sm font-medium transition-colors ${
              value === v
                ? "border-accent bg-accent text-accent-ink"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Custom text */}
      <input
        value={VIBES.includes(value) ? "" : value}
        onChange={(e) => onChange(e.target.value.slice(0, 40))}
        placeholder="Or type your own…"
        className="input mt-4"
      />
    </div>
  );
}

/* ─── Step 5 — Complete ──────────────────────────────────────── */
function StepComplete({ form }: { form: FormState }) {
  return (
    <div>
      <StepHeader
        title="You're in."
        sub="Your space is ready. Start the hype."
      />

      {/* Mini profile preview */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
        {/* Default lime-pulse banner */}
        <div
          className="h-16 w-full"
          style={{
            background:
              "radial-gradient(120% 150% at 25% -20%, rgba(200,255,0,0.4), transparent 55%), #0d0d0d",
          }}
        />
        <div className="px-4 pb-4">
          <div className="-mt-7 mb-2">
            <Avatar
              name={form.displayName || "?"}
              hue={form.avatarHue}
              size={52}
              className="rounded-[18px] ring-4 ring-surface"
            />
          </div>
          <p className="font-bold">{form.displayName || "Your name"}</p>
          <p className="text-sm text-muted">@{form.username || "username"}</p>
          {form.bio && <p className="mt-1.5 text-sm">{form.bio}</p>}
          {form.vibe && (
            <span className="mt-2 inline-block rounded-pill border border-border bg-elevated px-2.5 py-1 text-xs text-muted">
              {form.vibe}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared step header ─────────────────────────────────────── */
function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}
