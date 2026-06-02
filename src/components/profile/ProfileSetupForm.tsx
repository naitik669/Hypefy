"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { HypeMascot } from "@/components/mascot/HypeMascot";
import { ProfilePreviewCard } from "@/components/profile/ProfilePreviewCard";
import { BannerPicker } from "@/components/profile/BannerPicker";
import { InterestPills } from "@/components/profile/InterestPills";
import { saveProfile } from "@/app/setup-profile/actions";
import { DEFAULT_BANNER_ID } from "@/lib/profile";

const HUES = [280, 200, 150, 30, 330, 95, 250, 10];

type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

export function ProfileSetupForm({
  userId,
  initial,
}: {
  userId: string;
  initial: {
    displayName: string;
    username: string;
    bio: string;
    vibe: string;
    avatarHue: number;
    bannerId: string;
    interests: string[];
  };
}) {
  const supabase = createClient();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [vibe, setVibe] = useState(initial.vibe);
  const [avatarHue, setAvatarHue] = useState(initial.avatarHue);
  const [bannerId, setBannerId] = useState(initial.bannerId || DEFAULT_BANNER_ID);
  const [interests, setInterests] = useState<string[]>(initial.interests);

  const [uStatus, setUStatus] = useState<UsernameStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onUsernameChange(raw: string) {
    const u = raw.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    setUsername(u);
    setError(null);

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
      if (data && data.id !== userId) setUStatus("taken");
      else setUStatus("available");
    }, 450);
  }

  const formValid =
    displayName.trim().length > 0 &&
    /^[a-z0-9_.]{3,20}$/.test(username) &&
    uStatus !== "taken" &&
    uStatus !== "checking";

  function submit() {
    if (!formValid) {
      setError("Add a display name and a valid, available username.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveProfile({
        username,
        displayName,
        bio,
        currentVibe: vibe,
        avatarHue,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-32 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HypeMascot mood="calm" size="md" animated />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Set up your profile
          </h1>
          <p className="text-sm text-muted">
            Make your space feel like you before you get hyped.
          </p>
        </div>
      </div>

      {/* Live preview */}
      <ProfilePreviewCard
        displayName={displayName}
        username={username}
        bio={bio}
        vibe={vibe}
        avatarHue={avatarHue}
        bannerId={bannerId}
        interests={interests}
        complete={formValid}
      />

      {/* Display name */}
      <Field label="Display name">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={30}
          placeholder="What people call you"
          className="input"
        />
      </Field>

      {/* Username */}
      <Field label="Username">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
          <span className="shrink-0 text-sm text-faint">hypefy.chat/@</span>
          <input
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="username"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {uStatus === "checking" && (
            <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
          )}
          {uStatus === "available" && (
            <Check size={16} className="shrink-0 text-accent" />
          )}
        </div>
        {uStatus === "taken" && (
          <p className="mt-1 text-xs text-danger">That username is taken.</p>
        )}
        {uStatus === "invalid" && (
          <p className="mt-1 text-xs text-muted">
            3–20 characters: a–z, 0–9, dot, underscore.
          </p>
        )}
      </Field>

      {/* Bio */}
      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 160))}
          rows={2}
          placeholder="Tell people what your vibe is."
          className="input resize-none"
        />
        <p className="mt-1 text-right text-xs text-faint">{bio.length}/160</p>
      </Field>

      {/* Vibe */}
      <Field label="Current vibe (optional)">
        <input
          value={vibe}
          onChange={(e) => setVibe(e.target.value.slice(0, 40))}
          placeholder="building quietly, late night energy, meme dealer…"
          className="input"
        />
      </Field>

      {/* Avatar color */}
      <Field label="Avatar color">
        <div className="flex flex-wrap gap-2.5">
          {HUES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setAvatarHue(h)}
              className={`h-10 w-10 rounded-[14px] transition-all ${
                avatarHue === h ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""
              }`}
              style={{
                background: `linear-gradient(140deg, hsl(${h} 75% 52%), hsl(${(h + 50) % 360} 70% 38%))`,
              }}
              aria-label={`Color ${h}`}
            />
          ))}
        </div>
      </Field>

      {/* Banner */}
      <Field label="Profile banner">
        <BannerPicker value={bannerId} onChange={setBannerId} />
      </Field>

      {/* Interests */}
      <Field label="Interests">
        <InterestPills value={interests} onChange={setInterests} />
      </Field>

      {/* CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-gradient-to-t from-background via-background to-transparent px-5 pb-7 pt-4">
        {error && (
          <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending || !formValid}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink shadow-[0_0_24px_2px_rgba(200,255,0,0.35)] transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Entering…" : "Enter Hypefy"}
          {!pending && <ArrowRight size={20} strokeWidth={2.6} />}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children}
    </div>
  );
}
