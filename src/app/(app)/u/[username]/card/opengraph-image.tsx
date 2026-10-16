import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { remarkRows } from "@/lib/card-remarks";
import { hypefyQrSvg } from "@/lib/hypefy-qr";
import { pronounLabel } from "@/lib/profile";
import { anthemLine, memberNumber, memberSince, profileUrl } from "@/lib/profile-card";

/**
 * The picture a shared card link unfurls into.
 *
 * The profile link already has one of these — the photo and who they are,
 * landscape. This is the other side: the Hypefy ID, so sending someone the
 * card shows them the card rather than a title and a favicon. Sharing from
 * the card shares this address for exactly that reason.
 *
 * The code is drawn from the same matrix and the same rules as the one on
 * the card itself, as SVG rather than canvas because this runs on the
 * server. So the code in a preview is the code, and it scans.
 */
export const alt = "Hypefy ID";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const PLATE = "#0b0b0c";
const ACCENT = "#a3e635";

// Spelled out in full so the build sees which files are read and ships
// them with the server; a path assembled at runtime would leave them out.
const fonts = () =>
  Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/PlusJakartaSans-ExtraBold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/PlusJakartaSans-Medium.ttf")),
  ]);

type Id = {
  name: string;
  username: string;
  no: string | null;
  since: string | null;
  pronouns: string | null;
  roles: string[];
  anthem: string | null;
  remark: { label: string; value: string }[];
  qr: string | null;
};

async function loadId(username: string): Promise<Id | null> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, created_at, member_no, pronouns, profile_tags, interests, anthem, last_seen_at, show_activity, avatar_decoration, is_premium, is_verified",
    )
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();
  if (!p?.username) return null;

  const head = { count: "exact" as const, head: true };
  const [{ count: posts }, { count: hypers }] = await Promise.all([
    supabase.from("posts").select("id", head).eq("user_id", p.id as string),
    supabase.from("follows").select("follower_id", head).eq("following_id", p.id as string),
  ]);

  const anthem = anthemLine(p.anthem);
  return {
    name: (p.display_name as string) ?? (p.username as string),
    username: p.username as string,
    no: memberNumber(p.member_no as number | null),
    since: memberSince(p.created_at as string | null),
    pronouns: pronounLabel(p.pronouns as string | null),
    roles: (p.profile_tags as string[]) ?? [],
    anthem,
    remark: remarkRows({
      userId: p.id as string,
      tags: (p.profile_tags as string[]) ?? [],
      interests: (p.interests as string[]) ?? [],
      hasAnthem: !!anthem,
      memberNo: (p.member_no as number) ?? null,
      joinedAt: (p.created_at as string) ?? null,
      posts: posts ?? 0,
      hypers: hypers ?? 0,
      lastSeenAt: (p.last_seen_at as string) ?? null,
      showActivity: (p.show_activity as boolean) ?? true,
      frame: (p.avatar_decoration as string) ?? null,
      isPremium: (p.is_premium as boolean) ?? false,
      verified: (p.is_verified as boolean) ?? false,
    }),
    qr: hypefyQrSvg(profileUrl(p.username as string), 420),
  };
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [id, [extraBold, medium]] = await Promise.all([loadId(username), fonts()]);

  return new ImageResponse(id ? <Card id={id} /> : <Fallback />, {
    ...size,
    fonts: [
      { name: "Jakarta", data: extraBold, weight: 800, style: "normal" },
      { name: "Jakarta", data: medium, weight: 500, style: "normal" },
    ],
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 18,
        padding: "9px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span style={{ width: 118, fontSize: 15, letterSpacing: 2, color: "rgba(255,255,255,0.35)" }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 19, fontWeight: 800, color: "rgba(255,255,255,0.88)" }}>{value}</span>
    </div>
  );
}

function Card({ id }: { id: Id }) {
  const rows: [string, string][] = [];
  if (id.no) rows.push(["Member", id.no.split("").join(" ")]);
  if (id.since) rows.push(["Since", id.since]);
  if (id.pronouns) rows.push(["Pronouns", id.pronouns]);
  if (id.roles.length) rows.push(["Roles", id.roles.join(" · ").toUpperCase()]);
  for (const r of id.remark) rows.push([r.label, r.value]);
  if (id.anthem) rows.push(["Anthem", id.anthem]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BG,
        fontFamily: "Jakarta",
        padding: 44,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          background: PLATE,
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.10)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* The code, in the well it sits in on the card. */}
        <div style={{ display: "flex", padding: 42, alignItems: "center" }}>
          <div style={{ display: "flex", background: "#ffffff", borderRadius: 26, padding: 16 }}>
            {id.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                width={420}
                height={420}
                alt=""
                src={`data:image/svg+xml;base64,${Buffer.from(id.qr).toString("base64")}`}
              />
            ) : (
              <div style={{ width: 420, height: 420, display: "flex" }} />
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "46px 44px 46px 0" }}>
          <span style={{ fontSize: 17, letterSpacing: 5, color: "rgba(255,255,255,0.5)" }}>HYPEFY ID</span>
          <span style={{ marginTop: 16, fontSize: 44, fontWeight: 800, color: "#fff" }}>{id.name}</span>
          <span style={{ fontSize: 22, color: "rgba(255,255,255,0.45)" }}>@{id.username}</span>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
            {rows.slice(0, 6).map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "baseline" }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>Hypefy</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: ACCENT }}>.</span>
          </div>
        </div>

        {/* The painted edge, as on the card. */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: ACCENT }} />
      </div>
    </div>
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "Jakarta",
      }}
    >
      <span style={{ fontSize: 68, fontWeight: 800, color: "#fff" }}>Hypefy</span>
      <span style={{ fontSize: 68, fontWeight: 800, color: ACCENT }}>.</span>
    </div>
  );
}
