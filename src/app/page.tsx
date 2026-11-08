import Link from 'next/link';

/**
 * Landing page. Placeholder until the hero section is designed; the app itself
 * lives under /projects.
 */
export default function Landing() {
  return (
    <main className="landing">
      <div className="landing-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/knock-on-icon.svg" alt="" width={72} height={72} className="landing-icon" />
        <h1>Knock-On</h1>
        <p className="landing-tagline">See what one change sets in motion.</p>
        <p className="landing-body">
          Model a business in a real spreadsheet, introduce a change, and compare possible responses side by side.
        </p>
        <Link href="/projects" className="btn btn-accent landing-cta">
          Open the app
        </Link>
      </div>
    </main>
  );
}
