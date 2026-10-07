export const metadata = {
  title: "Delete your account · Hypefy",
  description: "How to delete your Hypefy account and the data that goes with it.",
};

/**
 * How to delete a Hypefy account, readable by anyone.
 *
 * Google Play asks every app that lets people create an account for a web
 * address where deletion can be requested without installing the app. The
 * button itself lives in Settings; this page says where, and gives a way
 * for someone who can no longer get in.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <h1>Delete your Hypefy account</h1>
      <p className="text-xs text-faint">Last updated: October 7, 2026</p>

      <p>
        You can delete your Hypefy account at any time. Deleting it is permanent
        and cannot be undone.
      </p>

      <h2>In the app or on the web</h2>
      <ol className="list-decimal pl-5">
        <li>Sign in at app.hypefy.chat or open the Hypefy app.</li>
        <li>Open your profile, then Settings.</li>
        <li>Choose Account.</li>
        <li>At the bottom, choose Delete account.</li>
        <li>Type your username to confirm, and confirm it is you when asked.</li>
      </ol>
      <p>
        <a href="/settings/account" className="text-accent">Go to Settings → Account</a>
      </p>

      <h2>If you cannot sign in</h2>
      <p>
        Write to{" "}
        <a href="mailto:privacy@hypefy.chat" className="text-accent">privacy@hypefy.chat</a>{" "}
        from the email address on the account and ask for it to be deleted. We
        will ask you to confirm that the account is yours before removing it.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your profile, username, photo and banner.</li>
        <li>Your posts, Shots, Shows and Spotlight pages.</li>
        <li>Your comments, hypes, saves and follows.</li>
        <li>Your messages and the media you sent.</li>
        <li>Your subscriptions and settings.</li>
      </ul>

      <h2>What is kept, and for how long</h2>
      <ul>
        <li>
          Copies in encrypted backups, which expire on a rolling basis.
        </li>
        <li>
          Records of purchases, for as long as Indian tax and accounting law
          requires (currently up to eight years).
        </li>
        <li>
          Limited data where the law requires it or to resolve a dispute.
        </li>
      </ul>

      <h2>Want a copy first?</h2>
      <p>
        Settings → Account has a download of your data. Take it before you
        delete; it cannot be produced afterwards.
      </p>

      <p>
        More in our <a href="/privacy" className="text-accent">Privacy Policy</a>.
      </p>
    </>
  );
}
