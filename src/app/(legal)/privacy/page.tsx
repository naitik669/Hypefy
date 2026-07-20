export const metadata = { title: "Privacy Policy · Hypefy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-xs text-faint">Last updated: June 10, 2026</p>

      <p>
        This policy explains what Hypefy collects, why, and what control you have over it.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong>: email address, password (hashed; we never see it),
          and your profile (name, username, bio, avatar, banner, tags).
        </li>
        <li>
          <strong>Content</strong>: posts, Shots, Shows, comments, messages, reactions,
          and media you upload.
        </li>
        <li>
          <strong>Activity</strong>: follows, hypes, saves, show views, and read receipts,
          used to rank feeds and power features like seen-states.
        </li>
        <li>
          <strong>Push subscriptions</strong>: if you enable push notifications, your
          browser&apos;s push endpoint (no location or device-identity data).
        </li>
      </ul>

      <h2>2. What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell your data.</li>
        <li>We don&apos;t show third-party ads or share data with ad networks.</li>
        <li>We don&apos;t track you across other websites.</li>
      </ul>

      <h2>3. Where your data lives</h2>
      <p>
        Hypefy runs on Supabase (database, auth, storage) and Vercel (hosting). GIF search
        is powered by GIPHY, search queries for GIFs are proxied through our server to
        GIPHY&apos;s API. These providers process data on our behalf under their own privacy
        terms.
      </p>

      <h2>4. Messages</h2>
      <p>
        Direct messages are private to conversation members. Hypefy staff do not read your
        messages except when required to investigate a report you or another participant files.
      </p>

      <h2>5. Your controls</h2>
      <ul>
        <li>Private account, who-can-message-you, and per-type notification settings live in Settings → Privacy / Notifications.</li>
        <li>You can delete individual posts, Shots, Shows, comments, and messages.</li>
        <li>
          <strong>Delete your account</strong> in Settings → Account, this permanently removes
          your profile, content, messages, and subscriptions.
        </li>
      </ul>

      <h2>6. Data retention</h2>
      <p>
        Content stays until you delete it or your account. Shows auto-expire after 24 hours.
        Deleted accounts are removed from production systems immediately; residual backups
        expire on a rolling basis.
      </p>

      <h2>7. Changes</h2>
      <p>Material changes to this policy will be announced in-app.</p>

      <h2>8. Contact</h2>
      <p>
        Privacy questions or data requests:{" "}
        <a href="mailto:craziematez@gmail.com" className="text-accent">craziematez@gmail.com</a>.
      </p>
    </>
  );
}
