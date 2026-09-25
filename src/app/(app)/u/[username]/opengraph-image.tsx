import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { shareProfile, type ShareProfile } from "@/lib/profile-share";

/**
 * The picture a shared profile link unfurls into — on WhatsApp, iMessage, X,
 * Discord, anywhere that reads og:image. It is the profile card, landscape:
 * the photo down the left, fading into the dark the way it does in the app,
 * and who they are down the right, with a Follow to act on.
 *
 * It replaces the bare avatar the link used to carry, which most apps drew as
 * a small square beside the title and said nothing about the person.
 */
export const alt = "Profile on Hypefy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const ACCENT = "#a3e635";
const PHOTO_W = 520;

// Spelled out in full so the build sees which files are read and ships them
// with the server; a path assembled at runtime would leave them behind.
const fonts = () =>
  Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/PlusJakartaSans-ExtraBold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/PlusJakartaSans-Medium.ttf")),
  ]);

/** Cut to a length the layout holds, on a word where there is one. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, [extraBold, medium]] = await Promise.all([shareProfile(username), fonts()]);

  return new ImageResponse(profile ? <Card p={profile} /> : <Fallback />, {
    ...size,
    fonts: [
      { name: "Jakarta", data: extraBold, weight: 800, style: "normal" },
      { name: "Jakarta", data: medium, weight: 500, style: "normal" },
    ],
  });
}

function Card({ p }: { p: ShareProfile }) {
  const name = clip(p.name, 26);
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: BG, fontFamily: "Jakarta", color: "#fff" }}>
      {/* The photo, full height, fading into the page on its right and foot. */}
      <div style={{ display: "flex", position: "relative", width: PHOTO_W, height: "100%" }}>
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt="" width={PHOTO_W} height={630} style={{ objectFit: "cover", width: PHOTO_W, height: 630 }} />
        ) : (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(140deg, hsl(${p.hue} 75% 52%), hsl(${(p.hue + 50) % 360} 70% 38%))`,
              fontSize: 260,
              fontWeight: 800,
            }}
          >
            {p.name.trim()[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            // The renderer has no inset shorthand; spelled out.
            top: 0,
            left: 0,
            width: PHOTO_W,
            height: 630,
            display: "flex",
            background: `linear-gradient(90deg, rgba(10,10,10,0) 58%, ${BG} 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            // The renderer has no inset shorthand; spelled out.
            top: 0,
            left: 0,
            width: PHOTO_W,
            height: 630,
            display: "flex",
            background: `linear-gradient(180deg, rgba(10,10,10,0) 72%, rgba(10,10,10,0.7) 100%)`,
          }}
        />
      </div>

      {/* Who they are. */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 64px 56px 36px" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
          Hypefy<span style={{ color: ACCENT }}>.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: name.length > 16 ? 62 : 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{name}</span>
            {p.verified && <Seal />}
          </div>
          <span style={{ marginTop: 8, fontSize: 30, fontWeight: 500, color: "#8f8f8f" }}>@{p.username}</span>
          {p.bio && (
            <span style={{ marginTop: 24, fontSize: 30, fontWeight: 500, lineHeight: 1.35, color: "#c9c9c9" }}>
              {clip(p.bio, 110)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          <Stat icon={<PeopleIcon />} value={compact(p.followers)} label={p.followers === 1 ? "follower" : "followers"} />
          {p.posts !== null && <Stat icon={<GridIcon />} value={compact(p.posts)} label={p.posts === 1 ? "post" : "posts"} />}
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              alignItems: "center",
              height: 64,
              padding: "0 34px",
              borderRadius: 999,
              flexShrink: 0,
              whiteSpace: "nowrap",
              background: ACCENT,
              color: "#0f1405",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            Follow +
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginRight: 36, fontSize: 28 }}>
      {icon}
      <span style={{ marginLeft: 10, fontWeight: 800 }}>{value}</span>
      <span style={{ marginLeft: 8, fontWeight: 500, color: "#8f8f8f" }}>{label}</span>
    </div>
  );
}

/**
 * Hypefy's verified badge — the same mark as VerifiedStar, redrawn for the
 * card renderer, which reads plain CSS more reliably than it reads an SVG
 * gradient. The squircle is a rounded box with the light on it and the star
 * sits inside, so the two stay the same badge.
 */
function Seal() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 54,
        height: 54,
        marginLeft: 12,
        flexShrink: 0,
        borderRadius: 18,
        background: "linear-gradient(180deg, #6aa4ff, #1b48cc)",
      }}
    >
      <svg width="54" height="54" viewBox="0 0 24 24">
        <path
          d="M 12 5.8 L 13.7 9.65 L 17.9 10.08 L 14.76 12.9 L 15.64 17.02 L 12 14.9 L 8.36 17.02 L 9.24 12.9 L 6.1 10.08 L 10.3 9.65 Z"
          fill="#fff"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8f8f8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8f8f8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** A username that does not exist still unfurls into something, not a broken image. */
function Fallback() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "Jakarta",
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
        Hypefy<span style={{ color: ACCENT }}>.</span>
      </div>
      <span style={{ marginTop: 16, fontSize: 36, fontWeight: 500, color: "#9b9b9b" }}>Where your personality lives.</span>
    </div>
  );
}
