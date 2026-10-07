export const metadata = {
  title: "Child Safety Standards · Hypefy",
  description: "Hypefy's standards against child sexual abuse and exploitation, and how to report.",
};

/**
 * Hypefy's published standards against child sexual abuse and exploitation.
 *
 * Google Play requires social apps to publish these at a public address,
 * with a way to report inside the app and a named point of contact. Every
 * commitment here is one the Community Guidelines and the Privacy Policy
 * already make; this page gathers them where a reviewer, a parent or an
 * authority can find them. It is a public commitment: change it only with
 * the people who have to keep it.
 */
export default function ChildSafetyPage() {
  return (
    <>
      <h1>Child Safety Standards</h1>
      <p className="text-xs text-faint">Last updated: October 7, 2026</p>

      <p>
        Hypefy has zero tolerance for child sexual abuse and exploitation
        (CSAE). This page sets out what is prohibited, what we do when we find
        it, and how to report it. It applies to everything on Hypefy: posts,
        Shots, Shows, Spotlight pages, comments, profiles, messages and calls.
      </p>

      <h2>What is prohibited</h2>
      <ul>
        <li>
          Child sexual abuse material (CSAM) of any kind, including drawn,
          generated or edited imagery.
        </li>
        <li>Sexualising a minor in images, video, audio or text.</li>
        <li>
          Grooming: building a relationship with a minor in order to sexually
          abuse or exploit them.
        </li>
        <li>Asking a minor for sexual content, or sending sexual content to one.</li>
        <li>Sextortion, threats or blackmail involving a minor.</li>
        <li>Trafficking, or advertising or arranging the abuse of a child.</li>
        <li>Sharing links to, or instructions for finding, any of the above.</li>
      </ul>

      <h2>What we do</h2>
      <ul>
        <li>We remove the content.</li>
        <li>We terminate the accounts responsible.</li>
        <li>We preserve the evidence.</li>
        <li>
          We report it to the appropriate authorities, as the law requires.
        </li>
      </ul>

      <h2>Who can use Hypefy</h2>
      <p>
        Hypefy is not intended for children under 13. We ask for a date of
        birth, and people identified as minors under applicable law get
        additional protections, including no personalised advertising.
      </p>

      <h2>How to report</h2>
      <ul>
        <li>
          <strong>In the app:</strong> use the report option on any post, Shot,
          comment, message or profile. You can also block the person.
        </li>
        <li>
          <strong>By email:</strong>{" "}
          <a href="mailto:grievance@hypefy.chat" className="text-accent">grievance@hypefy.chat</a>.
          You do not need an account to write to us.
        </li>
      </ul>
      <p>
        If a child is in immediate danger, contact your local emergency
        services or police first.
      </p>

      <h2>Point of contact</h2>
      <p>
        Hypefy&apos;s Grievance Officer is the designated contact for child
        safety and for questions about these standards:{" "}
        <a href="mailto:grievance@hypefy.chat" className="text-accent">grievance@hypefy.chat</a>.
      </p>

      <p>
        See also our{" "}
        <a href="/guidelines" className="text-accent">Community Guidelines</a> and{" "}
        <a href="/privacy" className="text-accent">Privacy Policy</a>.
      </p>
    </>
  );
}
