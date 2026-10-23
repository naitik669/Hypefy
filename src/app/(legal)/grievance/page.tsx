export const metadata = {
  title: "Grievance Redressal",
  description:
    "How to complain about content or conduct on Hypefy, who handles it, and the timeframes we work to.",
};

/**
 * The published complaint mechanism.
 *
 * Rule 3(2)(a) of the Information Technology (Intermediary Guidelines and
 * Digital Media Ethics Code) Rules, 2021 requires an intermediary to publish
 * the name and contact details of its Grievance Officer and the mechanism by
 * which a complaint may be made — prominently, not buried. Those details have
 * so far lived in section 14 of the Privacy Policy, which satisfies "we told
 * you" and not "prominently published". This is the page they belong on.
 *
 * Everything here describes machinery that exists: the ··· report flow writes
 * to `reports`, the admin queue reviews it, and takedown and suspension are
 * the actions available there. The timeframes are the statutory ones. They
 * are a commitment about staffing, not about code — do not shorten them here
 * without the person who has to answer the mail.
 *
 * Not legal advice, and not a substitute for review by someone qualified
 * before launch. The obligations in Rule 4 (Chief Compliance Officer, Nodal
 * Contact Person, Resident Grievance Officer) attach to a significant social
 * media intermediary — above fifty lakh registered users in India — which
 * Hypefy is not. If that changes, this page changes with it.
 */
export default function GrievancePage() {
  return (
    <>
      <h1>Grievance Redressal</h1>
      <p className="text-xs text-faint">Last updated: October 23, 2026</p>

      <p>
        If something on Hypefy breaks our rules or the law, or if you think we
        have got a decision wrong, this page tells you how to raise it, who
        reads it, and how long we take.
      </p>

      <h2>The fastest route: report it in the app</h2>
      <p>
        Open the <strong>···</strong> menu on the post, Shot, Show, comment,
        message or profile and choose <strong>Report</strong>. This is the
        quickest way to reach us: it carries the exact item with it, so nobody
        has to go looking for what you mean, and the person you reported is
        never told that the report came from you.
      </p>
      <p>
        Most complaints are resolved here, by the moderation team, without ever
        needing the Grievance Officer.
      </p>

      <h2>Writing to the Grievance Officer</h2>
      <p>
        Write to the Grievance Officer if an in-app report has not been dealt
        with, if you disagree with a decision we made, or if your complaint
        does not fit the report flow — a legal notice, a court order, or a
        request from an authority.
      </p>
      <ul>
        <li>
          <strong>Grievance Officer:</strong> Mohd Aman
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:grievance@hypefy.chat" className="text-accent">
            grievance@hypefy.chat
          </a>
        </li>
        <li>
          <strong>Address:</strong> Hypefy Platform Private Limited, House No.
          420, Sambhal Road, Taharpur, Moradabad, Uttar Pradesh 244001, India
        </li>
      </ul>
      <p className="text-xs text-faint">
        The address above is for written notices. It is not an office open to
        visitors, and complaints sent any other way may take longer to reach
        the right person.
      </p>

      <h2>What to include</h2>
      <p>
        A complaint is easier to act on, and acted on faster, when it has all
        of this:
      </p>
      <ul>
        <li>Your name, and an email address we can reply to.</li>
        <li>
          A link to the thing you are complaining about, or enough detail to
          find it — a username and roughly when it was posted will usually do.
        </li>
        <li>What is wrong with it, in your own words.</li>
        <li>
          If you are complaining on someone else&apos;s behalf, say who, and
          on what basis.
        </li>
        <li>
          For a legal demand: the provision relied on, and the order or notice
          itself.
        </li>
      </ul>
      <p>
        We may come back to you for proof of identity where a complaint
        concerns your own likeness, your own account, or personal data — we
        cannot act on those on an unverified say-so, because doing so is itself
        a way to attack someone.
      </p>

      <h2>How long we take</h2>
      <p>
        These are the timeframes set by the Information Technology
        (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021,
        and they are what we work to:
      </p>
      <ul>
        <li>
          <strong>Acknowledged within 24 hours</strong> of receipt, with a
          reference you can quote.
        </li>
        <li>
          <strong>Resolved within 15 days</strong> of receipt. If a complaint
          needs longer — because it needs evidence from elsewhere, or a legal
          view — we will tell you why and when to expect an answer, rather than
          going quiet.
        </li>
        <li>
          <strong>Within 24 hours</strong> for content that exposes a
          person&apos;s private area, shows them in full or partial nudity or
          in a sexual act, or is impersonation including a morphed or
          synthetic image of them. Complaints of this kind are acted on first.
        </li>
        <li>
          <strong>Within 36 hours</strong> of a court order or a notification
          from an authorised government agency, for the content it names.
        </li>
        <li>
          <strong>Within 72 hours</strong> for lawful requests for information
          from authorised government agencies.
        </li>
      </ul>

      <h2>What we can do about it</h2>
      <ul>
        <li>Remove the content, or restrict who can see it.</li>
        <li>Warn, suspend or terminate the account responsible.</li>
        <li>Leave it up, and tell you why.</li>
        <li>
          Preserve records and report to the authorities where the law requires
          it — which, for child sexual abuse material, we do in every case. See{" "}
          <a href="/child-safety" className="text-accent">
            Child Safety Standards
          </a>
          .
        </li>
      </ul>
      <p>
        We will tell you the outcome. Where we act against an account, we tell
        that person what was removed and why, and how to appeal — a decision
        nobody can contest is not a decision anyone should trust.
      </p>

      <h2>If you disagree with the outcome</h2>
      <p>
        Reply to the same thread within 30 days and say why. An appeal is read
        by someone who did not make the original decision. Nothing on this page
        takes away any other right you have, including the right to complain to
        a data protection authority or to go to court.
      </p>

      <h2>Complaints about your personal data</h2>
      <p>
        Access, correction, erasure and the rest are set out in the{" "}
        <a href="/privacy" className="text-accent">
          Privacy Policy
        </a>
        , and the fastest route for those is{" "}
        <a href="mailto:privacy@hypefy.chat" className="text-accent">
          privacy@hypefy.chat
        </a>
        . The Grievance Officer handles them too if you would rather go that
        way, on the same timeframes as above.
      </p>

      <h2>Other ways to reach us</h2>
      <ul>
        <li>
          General help:{" "}
          <a href="mailto:support@hypefy.chat" className="text-accent">
            support@hypefy.chat
          </a>
        </li>
        <li>
          Legal notices:{" "}
          <a href="mailto:legal@hypefy.chat" className="text-accent">
            legal@hypefy.chat
          </a>
        </li>
        <li>
          Child safety:{" "}
          <a href="mailto:grievance@hypefy.chat" className="text-accent">
            grievance@hypefy.chat
          </a>
        </li>
      </ul>
    </>
  );
}
