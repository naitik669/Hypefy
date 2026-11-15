import { UserRound, Users } from "lucide-react";
import { formatCount } from "@/lib/format";
import { Donut } from "@/components/charts/Donut";
import { LineChart } from "@/components/charts/LineChart";
import { Eyebrow, Figure } from "@/components/creator/Figures";
import { dayLabel, type DailyRow } from "@/lib/creator-overview";

/**
 * Who is on the other side of the numbers.
 *
 * Three questions, in the order they are worth asking: is the following
 * growing, is the work leaving that following, and does anybody come to
 * look at the profile itself.
 *
 * The reach split moved here from the Overview rather than being drawn in
 * both places. "Who saw it" is the audience question, and a tab that only
 * repeats the first screen is a tab nobody opens twice.
 */
export function Audience({
  days,
  totals,
  visits,
}: {
  days: DailyRow[];
  totals: Record<string, number>;
  visits: Record<string, number>;
}) {
  const followerPoints = days.map((d) => ({
    label: dayLabel(d.day),
    value: d.followers ?? 0,
  }));
  const followers = days.length ? (days[days.length - 1].followers ?? 0) : 0;
  const gain = days.length >= 2 ? followers - (days[0].followers ?? 0) : 0;

  const reach = totals.reach ?? 0;
  const following = totals.reach_following ?? 0;
  const fresh = totals.reach_new ?? 0;
  const outsidePct = reach > 0 ? Math.round((fresh / reach) * 100) : null;

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Figure
          icon={<Users size={15} />}
          label="Followers"
          value={followers}
          foot={gain !== 0 ? `${gain > 0 ? "+" : ""}${gain} in 30 days` : "no change in 30 days"}
        />
        <Figure
          icon={<UserRound size={15} />}
          label="Profile visits"
          value={visits.visits ?? 0}
          foot={`${formatCount(visits.visitors ?? 0)} ${
            (visits.visitors ?? 0) === 1 ? "person" : "people"
          }, 30 days`}
        />
      </div>

      <section>
        <Eyebrow>Followers over time</Eyebrow>
        <LineChart points={followerPoints} unit="Followers" />
      </section>

      {reach > 0 ? (
        <section>
          <Eyebrow>Who saw your work</Eyebrow>
          <Donut
            centreLabel={formatCount(reach)}
            data={[
              {
                label: "Already follow you",
                value: following,
                color: "var(--color-accent)",
              },
              { label: "New to you", value: fresh, color: "var(--color-hype)" },
            ]}
          />
          {outsidePct != null && (
            <p className="px-1 pt-2 text-xs leading-snug text-muted">
              {outsidePct === 0
                ? "Everybody who saw your work already follows you."
                : `${outsidePct}% of the people who saw your work don't follow you yet.`}
            </p>
          )}
        </section>
      ) : (
        <p className="px-1 text-xs text-faint">
          Nobody has seen your posts yet, so there is no audience to split.
        </p>
      )}
    </div>
  );
}
