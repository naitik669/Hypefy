import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * What a suspended account sees instead of the app.
 *
 * The database triggers (0057) are the actual enforcement — this screen is the
 * explanation. Without it a suspension reads as the app being broken: every
 * post, follow and message fails with an error and nothing says why.
 *
 * Deliberately not a dead end. Account settings, the guidelines and help stay
 * reachable, because someone who wants to appeal, export or delete their
 * account must be able to, and a suspension that holds a person's data hostage
 * is a support problem before it is anything else.
 */
export function SuspendedScreen({
  reason,
  until,
}: {
  reason: string | null;
  until: string | null;
}) {
  const ends = until
    ? new Date(until).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <ShieldAlert size={24} />
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Your account is suspended</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {ends
            ? `You can't post, comment, message or follow until ${ends}.`
            : "You can't post, comment, message or follow while this is in place."}
        </p>
      </div>

      {reason && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-faint">Reason</p>
          <p className="mt-1.5 text-sm leading-relaxed">{reason}</p>
        </div>
      )}

      <p className="text-sm leading-relaxed text-muted">
        You can still read, and your account and its content are untouched. If you think
        this is a mistake, reply to us and a person will look at it.
      </p>

      <div className="flex flex-col gap-2">
        <Link
          href="/help"
          className="flex h-11 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99]"
        >
          Contact support
        </Link>
        <Link
          href="/guidelines"
          className="flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          Community Guidelines
        </Link>
        <Link
          href="/settings/account"
          className="flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          Account settings
        </Link>
      </div>
    </div>
  );
}
