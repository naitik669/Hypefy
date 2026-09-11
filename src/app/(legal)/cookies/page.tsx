import Link from "next/link";
import { CookiePreferencesButton } from "@/components/consent/ConsentBanner";

export const metadata = { title: "Cookie Policy" };

/**
 * The cookie policy.
 *
 * Every name below was taken from the code rather than from a template — the
 * cookies the app sets, and the keys it keeps in local storage — so that the
 * page describes this app and not apps in general. If you add a cookie or a
 * storage key, add it here, and if it is not essential, it belongs behind the
 * consent banner in lib/consent.ts too.
 */

const th = "border-b border-border px-2 py-2 text-left text-xs font-bold text-foreground";
const td = "border-b border-border/60 px-2 py-2 align-top text-xs";

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>What it does</th>
            <th className={th}>How long</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, what, how]) => (
            <tr key={name}>
              <td className={`${td} font-mono text-[11px] text-foreground`}>{name}</td>
              <td className={td}>{what}</td>
              <td className={`${td} whitespace-nowrap`}>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="text-xs text-faint">Last updated: September 10, 2026</p>

      <p>
        This policy explains the cookies and similar technologies Hypefy
        Platform Private Limited (&quot;Hypefy&quot;, &quot;we&quot;) uses on
        app.hypefy.chat and in the Hypefy app, what each one is for, and how
        you control them. It sits alongside our{" "}
        <Link href="/privacy" className="text-accent">
          Privacy Policy
        </Link>
        .
      </p>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Your choice, any time</p>
        <p className="mt-1 text-xs text-muted">
          Change what you allow here, or from Settings. Turning analytics off
          also deletes the analytics cookies already set.
        </p>
        <CookiePreferencesButton className="mt-3 h-10 rounded-2xl bg-accent px-4 text-sm font-extrabold text-accent-ink" />
      </div>

      <h2>1. What cookies are</h2>
      <p>
        A cookie is a small file a website stores in your browser so it can
        recognise it again. We also use your browser&apos;s local storage,
        which works the same way but never leaves your device on its own. This
        policy covers both, and calls them all &quot;cookies&quot; for short.
      </p>

      <h2>2. The three kinds we use</h2>
      <ul>
        <li>
          <strong>Essential</strong> — needed for Hypefy to work at all:
          keeping you signed in, security, remembering your cookie choice. These
          are always on and do not need your consent.
        </li>
        <li>
          <strong>Analytics</strong> — Google Analytics, so we can see which
          screens get used and which break. Only with your consent.
        </li>
        <li>
          <strong>Advertising</strong> — Google AdSense, for the ads in the
          feed. Only with your consent.
        </li>
      </ul>

      <h2>3. Essential cookies</h2>
      <Table
        rows={[
          ["sb-…-auth-token", "Keeps you signed in to your account (Supabase, our authentication provider).", "Until you sign out"],
          ["hypefy_consent", "Remembers the cookie choice you made, so we do not ask again.", "6 months"],
          ["hypefy_invite", "Lets you past the invite screen while Hypefy is invite-only.", "30 days"],
          ["spotify_oauth_state", "Protects the step where you connect Spotify, if you do.", "Minutes"],
        ]}
      />

      <h2>4. Stored on your device</h2>
      <p>
        These live in your browser&apos;s local or session storage. They make
        the app behave the way you left it and are not sent to us or anyone
        else on their own.
      </p>
      <Table
        rows={[
          ["hypefy_feed_seen, hypefy_seen_shows, hypefy:diary:seen, hypefy:pages:flown", "Which posts, Shows and Pages you have already seen, and which reactions to your page have already been shown, so they are not shown as new again.", "Until cleared"],
          ["hypefy_music_muted, hypefy.shots.muted", "Whether you had sound on.", "Until cleared"],
          ["hypefy_recent_searches, hypefy_gif_faves, hypefy_post_draft", "Your recent searches, favourite GIFs, and an unfinished post.", "Until cleared"],
          ["hypefy_accounts", "Accounts you have signed in to on this device, for the account switcher.", "Until you remove them"],
          ["hypefy_ref, hypefy_visits", "Who invited you, and how many times you have opened the app.", "Until cleared"],
          ["hypefy_ads_shown", "How many ads you have seen this session, so we can cap them.", "This session"],
          ["Snooze and badge keys (hypefy_*_snooze, …)", "When you dismissed a prompt, so it does not come straight back.", "Until cleared"],
        ]}
      />

      <h2>5. Analytics cookies</h2>
      <Table
        rows={[
          ["_ga", "Google Analytics: tells one visit from the next, so a returning visitor is not counted as new.", "2 years"],
          ["_ga_<id>", "Google Analytics: keeps track of the current session.", "2 years"],
        ]}
      />
      <p>
        We do not send Google Analytics your name, username, email address or
        messages. Without your consent, Google&apos;s analytics script is not
        loaded at all.
      </p>

      <h2 id="advertising">6. Advertising cookies</h2>
      <p>
        With your consent, Google AdSense may set cookies such as{" "}
        <code>__gads</code>, <code>__gpi</code> and <code>__eoi</code> to show
        ads, measure them, limit how often you see the same one, and detect
        fraud. They can last up to 13 months. Google explains them in{" "}
        <a
          href="https://policies.google.com/technologies/cookies"
          className="text-accent"
          rel="noopener noreferrer"
          target="_blank"
        >
          how Google uses cookies
        </a>
        .
      </p>
      <p>
        If you turn advertising off, you do not get fewer ads — you get
        Hypefy&apos;s own cards in those places instead, which set no
        third-party cookies. Ads are personalised only for people we can
        confirm are 18 or over.
      </p>

      <h2>7. Where you are makes a difference</h2>
      <ul>
        <li>
          <strong>European Economic Area, United Kingdom, Switzerland:</strong>{" "}
          analytics and advertising are off until you turn them on. Google
          ads are not shown there at all for now, even with your consent, and
          you will see Hypefy&apos;s own cards instead.
        </li>
        <li>
          <strong>Everywhere else:</strong> analytics and advertising are on
          until you turn them off. The banner offers that on your first visit,
          and you can change it any time.
        </li>
        <li>
          <strong>If we cannot tell where you are,</strong> we treat you as
          being in the first group.
        </li>
      </ul>

      <h2>8. In the Hypefy app</h2>
      <p>
        The Android app shows the same choices and follows them the same way.
        Google ads are never shown in the app; analytics runs there only with
        your consent, as it does on the web.
      </p>

      <h2>9. Other ways to control cookies</h2>
      <p>
        Your browser can block or delete cookies too. Blocking essential ones
        will sign you out and stop Hypefy working properly; blocking the rest
        has the same effect as turning them off here.
      </p>

      <h2>10. Changes and contact</h2>
      <p>
        If we change what these categories cover, we will update this page and
        ask for your choice again. Questions go to{" "}
        <a href="mailto:privacy@hypefy.chat" className="text-accent">
          privacy@hypefy.chat
        </a>
        , or to our Grievance Officer as set out in the{" "}
        <Link href="/privacy" className="text-accent">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}
