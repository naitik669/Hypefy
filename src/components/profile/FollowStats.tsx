"use client";

import Link from "next/link";
import { formatCount } from "@/lib/format";

export function FollowStats({
  username,
  posts,
  followers,
  following,
}: {
  /** The followers/following routes are username-scoped. Without one there
   *  is nowhere to link, so the counts render as plain text. */
  username: string | null;
  posts: number;
  followers: number;
  following: number;
}) {
  const Stat = ({ n, label, href }: { n: number; label: string; href?: string }) => {
    const body = (
      <>
        <span className="text-xl font-extrabold tabular-nums leading-none text-foreground">
          {formatCount(n)}
        </span>
        <span className="text-xs text-muted">{label}</span>
      </>
    );
    const cls = "flex flex-1 flex-col items-center gap-0.5";
    // Without a username there is no route to point at, so the count stays
    // plain text rather than a link that goes nowhere.
    return href ? (
      <Link href={href} className={`${cls} active:opacity-70`}>
        {body}
      </Link>
    ) : (
      <div className={cls}>{body}</div>
    );
  };

  return (
    /* Stacked columns: bold count on top, muted label below — no commas.
       Followers and Following are routes now, not a sheet: the list is
       paginated, searchable, and survives tapping through to a profile and
       coming back. */
    <div className="flex flex-1 translate-y-2.5 pb-1">
      <Stat n={posts} label="Posts" />
      <Stat
        n={followers}
        label="Followers"
        href={username ? `/u/${username}/followers` : undefined}
      />
      <Stat
        n={following}
        label="Following"
        href={username ? `/u/${username}/following` : undefined}
      />
    </div>
  );
}
