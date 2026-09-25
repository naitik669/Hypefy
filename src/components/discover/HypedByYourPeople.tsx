"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { fetchHypeProof, type HypeProof, type Previewer } from "@/lib/hype-proof";

/**
 * A shelf with a reason, above the Discover grid.
 *
 * One line over a row of three, rather than a reason under every tile. A
 * twelfth of the noise, and it says something larger: not "a friend liked
 * this" but "this is a thing your people are into". It also answers the
 * commonest complaint about any recommender — not knowing why something is
 * there — without exposing the ranking.
 *
 * It groups rather than fetches: the shots are already on the page, and this
 * asks one question about them. A shelf that cannot fill three does not
 * appear, because two tiles under a reason reads as a mistake.
 */
const SHELF = 3;

export function HypedByYourPeople({
  shots,
  renderTile,
}: {
  shots: { id: string }[];
  renderTile: (id: string) => ReactNode;
}) {
  const [proof, setProof] = useState<Map<string, HypeProof>>(() => new Map());

  const key = shots.map((s) => s.id).join(",");
  useEffect(() => {
    const ids = shots.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) return;
    let alive = true;
    void fetchHypeProof("shot", ids).then((found) => {
      if (alive) setProof(found);
    });
    return () => {
      alive = false;
    };
    // `shots` is a fresh array each render; `key` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const picked = shots.filter((s) => proof.has(s.id)).slice(0, SHELF);
  if (picked.length < SHELF) return null;

  // Who to name: the people who come up most across the shelf, so the line
  // describes the row rather than whichever tile happens to be first.
  const seen = new Map<string, { p: Previewer; n: number }>();
  for (const s of picked) {
    for (const p of proof.get(s.id)?.previewers ?? []) {
      const at = seen.get(p.id);
      if (at) at.n += 1;
      else seen.set(p.id, { p, n: 1 });
    }
  }
  const ranked = [...seen.values()].sort((a, b) => b.n - a.n).map((v) => v.p);
  if (ranked.length === 0) return null;

  const lead = ranked[0].name?.trim() || ranked[0].username || "Someone";
  const rest = ranked.length - 1;

  return (
    <section className="pt-5">
      <div className="flex items-center gap-2 px-4">
        {ranked.length > 1 ? (
          <span aria-hidden className="flex shrink-0">
            {ranked.slice(0, 2).map((p, i) => (
              <span
                key={p.id}
                className="rounded-[30%]"
                style={{
                  marginLeft: i === 0 ? 0 : -6,
                  boxShadow: "0 0 0 1.5px var(--color-background)",
                }}
              >
                <Avatar
                  name={p.name ?? p.username ?? "?"}
                  hue={p.hue ?? 200}
                  size={18}
                  src={p.avatar_url ?? undefined}
                />
              </span>
            ))}
          </span>
        ) : (
          <Users size={15} className="shrink-0 text-faint" />
        )}
        <p className="min-w-0 truncate text-xs text-muted">
          Because <span className="font-bold text-foreground">{lead}</span>
          {rest > 0 && (
            <>
              {" "}
              and <span className="font-bold text-foreground">{rest} other{rest === 1 ? "" : "s"}</span>
            </>
          )}{" "}
          hyped these
        </p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 px-1">
        {picked.map((s) => (
          <div key={s.id}>{renderTile(s.id)}</div>
        ))}
      </div>
    </section>
  );
}
