"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, ArrowLeft, Check, Loader2, Upload, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ProfilePreviewCard } from "@/components/onboarding/ProfilePreviewCard";
import { saveProfile } from "@/app/setup-profile/actions";
import { PROFILE_TAGS } from "@/lib/profile";

const TOTAL_STEPS = 6; // 5 input steps + completion
const HUES = [280, 200, 150, 30, 330, 95, 250, 10, 180, 45];
const MAX_TAGS = 3;

type FormState = {
  displayName: string;
  username: string;
  avatarHue: number;
  avatarUrl: string | null;
  bio: string;
  tags: string[]; // stored as profile_tags
};

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function uploadAvatar(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    set("avatarUrl", data.publicUrl);
    setUploading(false);
  }

  function canAdvance() {
    switch (step) {
      case 0:
        return form.displayName.trim().length >= 2;
      case 1:
        return /^[a-z0-9_.]{3,20}$/.test(form.username) && uStatus === "available";
      default:
        return true;
    }
  }

  function next() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    setError(null);
  }
  function back() {
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
        profileTags: form.tags,
        avatarHue: form.avatarHue,
        avatarUrl: form.avatarUrl,
      });
      if (res?.error) setError(res.error);
    });
  }

  const isLast = step === TOTAL_STEPS - 1;
  const isSecondLast = step === TOTAL_STEPS - 2;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Progress */}
      {!isLast && (
        <div className="sticky top-0 z-10 bg-background/90 px-6 pb-3 pt-5 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-faint">
              Step {step + 1} of {TOTAL_STEPS - 1}
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                  style={{ width: i <= step ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col px-6 pb-40 pt-6">
        {step === 0 && <StepName value={form.displayName} onChange={(v) => set("displayName", v)} />}
        {step === 1 && <StepUsername value={form.username} status={uStatus} onChange={onUsernameChange} />}
        {step === 2 && (
          <StepAvatar
            displayName={form.displayName}
            avatarHue={form.avatarHue}
            avatarUrl={form.avatarUrl}
            uploading={uploading}
            onUpload={uploadAvatar}
            onColor={(h) => set("avatarHue", h)}
            onRemove={() => set("avatarUrl", null)}
          />
        )}
        {step === 3 && <StepBio value={form.bio} onChange={(v) => set("bio", v)} />}
        {step === 4 && <StepTags selected={form.tags} onChange={(v) => set("tags", v)} />}
        {step === 5 && <StepComplete form={form} />}

        {/* Live preview (steps 0–4) */}
        {!isLast && (
          <div className="mt-8">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-faint">
              Live preview
            </p>
            <ProfilePreviewCard
              displayName={form.displayName}
              username={form.username}
              bio={form.bio}
              tags={form.tags}
              avatarUrl={form.avatarUrl}
              avatarHue={form.avatarHue}
              compact
            />
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-gradient-to-t from-background via-background to-transparent px-6 pb-8 pt-6">
        {error && (
          <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {step > 0 && !isLast && (
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
            onClick={isLast ? finish : next}
            disabled={!canAdvance() || pending || uploading}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Setting up…
              </>
            ) : isLast ? (
              <>
                Enter Hypefy <ArrowRight size={20} strokeWidth={2.6} />
              </>
            ) : isSecondLast ? (
              <>
                Finish <ArrowRight size={20} strokeWidth={2.6} />
              </>
            ) : (
              <>
                Next <ArrowRight size={20} strokeWidth={2.6} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Steps ──────────────────────────────────────────────────── */

function StepName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader title="What should people call you?" sub="This is how your name shows up across Hypefy." />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 30))}
        maxLength={30}
        placeholder="Your name"
        className="input mt-5 text-base"
      />
      <p className="mt-1 text-right text-xs text-faint">{value.length}/30</p>
    </div>
  );
}

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
      <StepHeader title="Claim your username" sub="Pick a unique name people can find you with." />
      <div className="mt-5 flex h-12 items-center gap-1 rounded-xl border border-border bg-surface px-3 focus-within:border-white/25">
        <span className="shrink-0 text-sm text-faint">hypefy.chat/@</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="username"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
        />
        {status === "checking" && <Loader2 size={16} className="shrink-0 animate-spin text-muted" />}
        {status === "available" && <Check size={16} className="shrink-0 text-accent" />}
      </div>
      {status === "taken" && <p className="mt-1.5 text-xs text-danger">That username is taken.</p>}
      {status === "available" && <p className="mt-1.5 text-xs text-accent">Nice — that one's free.</p>}
      {status === "invalid" && value.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">3–20 characters: a–z, 0–9, dot, underscore.</p>
      )}
    </div>
  );
}

function StepAvatar({
  displayName,
  avatarHue,
  avatarUrl,
  uploading,
  onUpload,
  onColor,
  onRemove,
}: {
  displayName: string;
  avatarHue: number;
  avatarUrl: string | null;
  uploading: boolean;
  onUpload: (f: File) => void;
  onColor: (h: number) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <StepHeader title="Add your profile picture" sub="Upload a photo, or roll with a color and your initial." />

      <div className="mt-5 flex items-center gap-4">
        <div className="relative">
          <Avatar
            name={displayName || "?"}
            hue={avatarHue}
            src={avatarUrl ?? undefined}
            size={84}
            className="rounded-[26px]"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[26px] bg-black/50">
              <Loader2 size={22} className="animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background transition active:scale-[0.99] disabled:opacity-60"
          >
            <Upload size={17} /> Upload photo
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={onRemove}
              className="h-9 rounded-xl border border-border text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {!avatarUrl && (
        <>
          <p className="mb-2.5 mt-6 text-xs font-semibold uppercase tracking-wider text-faint">
            Or pick a color
          </p>
          <div className="flex flex-wrap gap-2.5">
            {HUES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onColor(h)}
                className="h-11 w-11 rounded-2xl transition-transform active:scale-95"
                style={{
                  background: `linear-gradient(140deg, hsl(${h} 75% 52%), hsl(${(h + 50) % 360} 70% 38%))`,
                  outline: avatarHue === h ? "3px solid var(--color-accent)" : "none",
                  outlineOffset: "2px",
                }}
                aria-label={`Color ${h}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StepBio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader title="Say a little about yourself" sub="A short line that tells people what you're about." />
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 160))}
        rows={3}
        placeholder="creator mode, late night energy, building quietly..."
        className="input mt-5 resize-none"
      />
      <p className="mt-1 text-right text-xs text-faint">{value.length}/160</p>
    </div>
  );
}

function StepTags({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(tag: string) {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag].slice(0, MAX_TAGS),
    );
  }
  return (
    <div>
      <StepHeader title="What do you do?" sub={`Pick up to ${MAX_TAGS} tags that describe you.`} />
      <div className="mt-5 flex flex-wrap gap-2">
        {PROFILE_TAGS.map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && <p className="mt-3 text-xs text-muted">{selected.join(" · ")}</p>}
    </div>
  );
}

function StepComplete({ form }: { form: FormState }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles size={30} />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">You&apos;re in.</h1>
        <p className="mt-1.5 text-sm text-muted">Your profile is ready. Start the hype.</p>
      </div>
      <ProfilePreviewCard
        displayName={form.displayName}
        username={form.username}
        bio={form.bio}
        tags={form.tags}
        avatarUrl={form.avatarUrl}
        avatarHue={form.avatarHue}
      />
    </div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted">{sub}</p>
    </div>
  );
}
