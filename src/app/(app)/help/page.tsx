import Link from "next/link";
import {
  Bookmark,
  Clapperboard,
  Heart,
  ImageIcon,
  BookOpenText,
  Lock,
  Mail,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * The glossary.
 *
 * Hypefy invents its own words — Hype, Hyper, Favourite, Shot, Show, Diary —
 * and defined none of them anywhere. FeatureHint is rendered in exactly one
 * place, explaining Shows, so every other term had to be guessed from context.
 * This is also the app's only real support contact; the one that existed was
 * the literal string "[support@hypefy.chat]", square brackets and all.
 */
export const metadata = { title: "Help" };

const SUPPORT = "support@hypefy.chat";

type Entry = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  term: string;
  what: string;
  href?: string;
  hrefLabel?: string;
};

const CONTENT: Entry[] = [
  {
    icon: ImageIcon,
    term: "Post",
    what: "A photo and your thoughts. Posts stay up until you delete them, and they're what fills the Home feed.",
  },
  {
    // The bolt, because that is what the tab bar shows. A glossary that
    // draws a term differently from the app is a second thing to learn.
    icon: Zap,
    term: "Shot",
    what: "A short video reel. Shots get their own tab, and they play full-screen one after another.",
    href: "/shots",
    hrefLabel: "Open Shots",
  },
  {
    icon: Clapperboard,
    term: "Show",
    what: "A moment that disappears after 24 hours — unless you keep it, in which case it stays on your profile.",
    href: "/shows",
    hrefLabel: "Your Shows",
  },
  {
    // The same open-book glyph as the button in Messages, so the glossary
    // draws it the way the app does.
    icon: BookOpenText,
    term: "Diary",
    what: "A short note — a line, an emoji, a song — that people you follow back can read for 24 hours. Tap the open book in Messages.",
    href: "/messages/diary",
    hrefLabel: "Open Diary",
  },
];

const ACTIONS: Entry[] = [
  {
    // Moved off the bolt when Shot took it, and a star is what you actually
    // tap in the feed — the bolt only ever appeared on Discover's counters.
    icon: Star,
    term: "Hype",
    what: "The applause. Hyping a post or a Shot tells the person you liked it, and pushes more like it into your feed.",
  },
  {
    // Not a star any more: Hype took it, and two identical glyphs two rows
    // apart in a glossary defeat the point of the glossary.
    icon: Users,
    term: "Hyper",
    what: "One of your closest people. Their posts come first in the Hypers feed. Your list is private — nobody is told they're on it.",
    href: "/hypers",
    hrefLabel: "Your Hypers",
  },
  {
    icon: Heart,
    term: "Favourite",
    what: "Someone you don't want to miss. Favourites get their own feed tab, and this list is private too.",
    href: "/favourites",
    hrefLabel: "Your Favourites",
  },
  {
    icon: Bookmark,
    term: "Saved",
    what: "Anything you keep for later. Saved posts can be filed into collections — folders only you can see.",
    href: "/saved",
    hrefLabel: "Your Saved",
  },
  {
    icon: Lock,
    term: "Private account",
    what: "With a private account, people have to ask before they can follow you and see your posts. Requests wait until you answer them.",
    href: "/requests",
    hrefLabel: "Follow requests",
  },
];

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-border/50">
        {entries.map(({ icon: Icon, term, what, href, hrefLabel }) => (
          <div key={term} className="flex gap-3 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
              <Icon size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{term}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {what}
              </p>
              {href && hrefLabel && (
                <Link
                  href={href}
                  className="mt-1.5 inline-block text-xs font-bold text-accent hover:underline"
                >
                  {hrefLabel} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" showBack />

      <div className="flex flex-col gap-6 px-4 pb-12 pt-4">
        <p className="text-[13px] leading-relaxed text-muted">
          Hypefy uses a few words of its own. Here is what they all mean.
        </p>

        <Section title="What you can make" entries={CONTENT} />
        <Section title="What the buttons mean" entries={ACTIONS} />

        <section>
          <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Hidden gestures
          </h2>
          <ul className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed text-muted">
            <li>
              <strong className="text-foreground">Hold a photo</strong> to blow
              it up without leaving the feed. Pinch it to zoom and pan; let go
              and it springs back.
            </li>
            <li>
              <strong className="text-foreground">Hold a comment</strong> for
              reply, copy and delete.
            </li>
            <li>
              <strong className="text-foreground">Hold an avatar</strong> to
              open someone&apos;s profile card, with their QR code.
            </li>
            <li>
              <strong className="text-foreground">Swipe a sheet down</strong> to
              close it — comments, sharing, and the rest.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Still stuck
          </h2>
          <a
            href={`mailto:${SUPPORT}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-4 transition-colors hover:bg-elevated"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-foreground">
              <Mail size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Email support</p>
              <p className="truncate text-xs text-muted">{SUPPORT}</p>
            </div>
          </a>
          <p className="mt-3 px-1 text-[11px] text-faint">
            To report a post, a Shot or a person, use the ··· menu on the thing
            itself — reports reach us faster that way, and the other person is
            never told it came from you.
          </p>
        </section>

        <p className="text-center text-[11px] text-faint">
          <Link href="/terms" className="underline hover:text-muted">
            Terms of Service
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="underline hover:text-muted">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/guidelines" className="underline hover:text-muted">
            Community Guidelines
          </Link>
        </p>
      </div>
    </>
  );
}
