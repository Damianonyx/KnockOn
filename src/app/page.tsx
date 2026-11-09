import { Gloock, Inter } from 'next/font/google';
import Link from 'next/link';
import { KnockyHero } from '@/components/landing/KnockyHero';
import { KnockySolid } from '@/components/landing/KnockySolid';
import styles from '@/components/landing/Landing.module.css';

const serif = Gloock({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-serif' });
const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });


const STEPS = [
  {
    title: 'Model your business',
    body: 'Start from the bakery template in a real spreadsheet, with fictional demo figures or your own. Every result is a formula you can inspect.',
  },
  {
    title: 'Add a shock',
    body: 'An energy or fuel cost increase, a supplier price rise, or a sales decline. The original baseline stays frozen for comparison.',
  },
  {
    title: 'Compare responses',
    body: 'Change your price (you enter the sales you expect, nothing is guessed) or switch supplier, and see profit against the baseline.',
  },
];

export default function Landing() {
  return (
    <main className={`${styles.page} ${sans.className} ${serif.variable}`}>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/" className={styles.navBrand} aria-label="KnockOn home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/knockon-mark.svg" alt="" width={26} height={19} />
          <span>KnockOn</span>
        </Link>
        <a href="#how">How it works</a>
        <Link href="/projects" className={styles.navApp}>
          Open app
        </Link>
      </nav>

      <KnockyHero />

      <section id="how" className={styles.how} aria-labelledby="how-title">
        <h2 id="how-title" className={`${styles.howTitle} ${serif.className}`}>
          One change. Every knock-on.
        </h2>
        <p className={styles.howLead}>
          KnockOn is an interactive economics lab for small business owners and learners. Try a change before you make it,
          and see exactly why the numbers move.
        </p>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepNum} aria-hidden>
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.openWrap}>
        <section className={styles.open} aria-labelledby="open-title">
          <KnockySolid size={84} />
          <div>
            <h2 id="open-title" className={serif.className}>
              Ready to see the knock‑on?
            </h2>
            <p>Open the app, start with the fictional demo bakery, and try your first shock in a couple of minutes.</p>
          </div>
          <Link href="/projects" className={styles.openBtn}>
            Open app <span aria-hidden>→</span>
          </Link>
        </section>
      </div>

      <footer className={styles.footer}>
        Demo figures are fictional and for learning. Every number in the app is calculated by the spreadsheet, and every
        assumption is yours.
      </footer>
    </main>
  );
}
