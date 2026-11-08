'use client';
/**
 * Landing hero: "Meet Knock-On," with Knocky, the halftone domino mascot.
 *
 * Intro (about 4 seconds, once per page load):
 * 1. Knocky prints in dot by dot.
 * 2. A little coral domino from the app icon hops in and knocks it; Knocky goes wide-eyed.
 * 3. The effects of the change burst out of Knocky's open top as tiles.
 * 4. The headline rises in, then the tagline and the Open app button; Knocky blinks and smiles.
 * Afterwards Knocky blinks every few seconds and the tiles float gently.
 *
 * With reduced motion (or before JavaScript runs) the finished hero is shown.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { knockyDots, VIEWBOX } from './halftone';
import styles from './Landing.module.css';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIn = (p: number) => p * p * p;
const backOut = (p: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const T = { print: [0.1, 1.3] as const, hop: [1.15, 1.6] as const, tip: [1.6, 1.95] as const, hit: 1.95, burst: 2.05, title: 2.55, done: 5.8 };
/** Open top of the domino, in stage pixels: where the tiles burst from. */
const ORIGIN = { x: 160, y: 60 };

function blinkAmount(t: number): number {
  const times = [3.45, 4.7];
  if (t > 6) times.push(6 + Math.floor((t - 6) / 4) * 4);
  let b = 0;
  for (const s of times) {
    const p = seg(t, s, s + 0.2);
    if (p > 0 && p < 1) b = Math.max(b, Math.sin(p * Math.PI));
  }
  return b;
}

const SHEET = (
  <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
    <rect x="3" y="5" width="34" height="30" rx="4" fill="#fff" />
    <path d="M3 14h34M3 23h34M14 5v30M26 5v30" stroke="#0d4452" strokeWidth="2" />
    <rect x="26" y="23" width="11" height="12" fill="#fdde76" />
  </svg>
);
const CHART = (
  <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
    <rect x="6" y="22" width="7" height="12" rx="2" fill="#2a78d6" />
    <rect x="17" y="14" width="7" height="20" rx="2" fill="#eb6834" />
    <rect x="28" y="8" width="7" height="26" rx="2" fill="#1baf7a" />
  </svg>
);
// eslint-disable-next-line @next/next/no-img-element
const MARK = <img src="/knock-on-mark.svg" alt="" width={40} height={29} />;

/** The effects of one change, as app-style tiles: final position (stage px), rotation, content. */
const TILES: { x: number; y: number; r: number; bg: string; label: string; content: React.ReactNode }[] = [
  { x: -150, y: 60, r: -12, bg: '#fd6a42', label: 'Energy costs', content: <span>⚡</span> },
  { x: -70, y: -10, r: 6, bg: '#fff3df', label: 'Bakery', content: <span>🥐</span> },
  { x: 40, y: 6, r: -6, bg: '#0d4452', label: 'Spreadsheet', content: SHEET },
  { x: 150, y: -50, r: 4, bg: '#ffffff', label: 'Knock-On', content: MARK },
  { x: 250, y: 0, r: 10, bg: '#fdde76', label: 'Prices', content: <span>🏷️</span> },
  { x: 350, y: -36, r: -8, bg: '#ffffff', label: 'Profit', content: CHART },
  { x: 420, y: 60, r: 12, bg: '#d8ecee', label: 'Suppliers', content: <span>🚚</span> },
];

export function KnockyHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const q = <E extends Element>(sel: string) => root.querySelector(sel) as E;
    const qa = <E extends Element>(sel: string) => [...root.querySelectorAll(sel)] as E[];
    const domino = q<HTMLDivElement>('[data-domino]');
    const coral = q<SVGGElement>('[data-coral]');
    const spark = q<SVGGElement>('[data-spark]');
    const face = q<SVGGElement>('[data-face]');
    const eyes = qa<SVGGElement>('[data-eye]');
    const smile = q<SVGPathElement>('[data-smile]');
    const oh = q<SVGEllipseElement>('[data-oh]');
    const tiles = qa<HTMLDivElement>('[data-tile]');
    const words = qa<HTMLSpanElement>('[data-word]');
    const sub = q<HTMLElement>('[data-sub]');
    const cta = q<HTMLElement>('[data-cta]');
    const dots = knockyDots();

    // ---- halftone on a canvas (thousands of dots stay smooth on phones) ----
    let drawnFull = false;
    const ctx = canvas.getContext('2d');
    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      drawnFull = false;
    };
    const draw = (progress: number) => {
      if (!ctx) return;
      const k = canvas.width / VIEWBOX.w;
      ctx.setTransform(k, 0, 0, k, -VIEWBOX.x * k, -VIEWBOX.y * k);
      ctx.clearRect(VIEWBOX.x, VIEWBOX.y, VIEWBOX.w, VIEWBOX.h);
      ctx.fillStyle = '#072d36';
      ctx.beginPath();
      for (const d of dots) {
        const local = progress >= 1 ? 1 : clamp((progress * 1.25 - d.order) / 0.25);
        if (local <= 0) continue;
        const r = d.r * easeOut(local);
        ctx.moveTo(d.x + r, d.y);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    size();
    const onResize = () => size();
    window.addEventListener('resize', onResize);

    const render = (t: number) => {
      const pp = seg(t, ...T.print);
      if (pp < 1 || !drawnFull) {
        draw(pp);
        drawnFull = pp >= 1;
      }
      // coral domino hops in, then tips over into Knocky
      const hop = easeOut(seg(t, ...T.hop));
      const bounce = Math.sin(seg(t, ...T.hop) * Math.PI) * -26;
      let angle = easeIn(seg(t, ...T.tip)) * 40;
      const settle = seg(t, T.hit, T.hit + 0.25);
      if (settle > 0) angle = 40 - Math.sin(settle * Math.PI) * 4;
      coral.setAttribute('transform', `translate(${lerp(-140, 0, hop).toFixed(1)} ${bounce.toFixed(1)}) rotate(${angle.toFixed(2)} -70 394)`);
      coral.setAttribute('opacity', seg(t, T.hop[0], T.hop[0] + 0.15).toFixed(2));
      // impact
      const imp = seg(t, T.hit, T.hit + 0.5);
      spark.setAttribute('opacity', (imp > 0 && imp < 1 ? Math.sin(imp * Math.PI) : 0).toFixed(2));
      const shake = imp > 0 && imp < 1 ? Math.sin(imp * Math.PI * 5) * (1 - imp) * 2.2 : 0;
      domino.style.transform = `rotate(${(-4 + shake).toFixed(2)}deg)`;
      // Knocky's face
      face.setAttribute('opacity', easeOut(seg(t, 0.9, 1.4)).toFixed(2));
      const surprise = seg(t, T.hit, T.hit + 0.15) * (1 - seg(t, 3.0, 3.3));
      const open = 1 + 0.22 * surprise;
      const sy = open * (1 - 0.93 * blinkAmount(t));
      eyes.forEach((el) => {
        const cx = Number(el.dataset.eye);
        el.setAttribute('transform', `translate(${cx} 94) scale(${open.toFixed(3)} ${sy.toFixed(3)}) translate(${-cx} -94)`);
      });
      oh.setAttribute('opacity', surprise.toFixed(2));
      smile.setAttribute('opacity', (1 - surprise).toFixed(2));
      const grin = 0.7 + 0.6 * seg(t, 3.2, 3.6);
      smile.setAttribute('transform', `translate(150 136) scale(${grin.toFixed(3)}) translate(-150 -136)`);
      // tiles burst out of the open top, then float
      tiles.forEach((el, i) => {
        const tl = TILES[i];
        const p = seg(t, T.burst + i * 0.085, T.burst + i * 0.085 + 0.7);
        const fx = tl.x + 32;
        const fy = tl.y + 32;
        const e = backOut(p);
        const x = lerp(ORIGIN.x, fx, e);
        const y = lerp(ORIGIN.y, fy, e) - Math.sin(clamp(p) * Math.PI) * 70;
        const bob = Math.sin((t - T.burst - i * 0.3) * 2.1) * 4 * seg(t, T.burst + 1, T.burst + 1.6);
        el.style.transform = `translate(${(x - fx).toFixed(1)}px, ${(y - fy + bob).toFixed(1)}px) rotate(${(tl.r * e + (1 - p) * 40).toFixed(1)}deg) scale(${lerp(0.2, 1, easeOut(p)).toFixed(3)})`;
        el.style.opacity = clamp(p * 4).toFixed(2);
      });
      // headline, tagline, button
      words.forEach((w, i) => {
        const p = easeOut(seg(t, T.title + i * 0.12, T.title + i * 0.12 + 0.6));
        w.style.transform = `translateY(${(110 * (1 - p)).toFixed(1)}%)`;
      });
      const sp = easeOut(seg(t, T.title + 0.45, T.title + 1.0));
      sub.style.opacity = String(sp);
      sub.style.transform = `translateY(${(8 * (1 - sp)).toFixed(1)}px)`;
      const cp = backOut(seg(t, T.title + 0.7, T.title + 1.2));
      cta.style.opacity = String(clamp(cp));
      cta.style.transform = `scale(${lerp(0.85, 1, cp).toFixed(3)})`;
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.dataset.state = 'playing';
    if (reduce) {
      render(T.done);
      root.dataset.state = 'done';
      return () => window.removeEventListener('resize', onResize);
    }
    let raf = 0;
    let t0: number | null = null;
    const loop = (now: number) => {
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      render(t);
      if (t > T.done) root.dataset.state = 'done';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.hero} data-state="idle">
      <header className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.word}>
            <span data-word>Meet</span>
          </span>{' '}
          <span className={styles.word}>
            <span data-word>Knock-On,</span>
          </span>
        </h1>
        <p className={styles.sub} data-sub>
          and see what one change sets in motion.
        </p>
        <Link href="/projects" className={styles.cta} data-cta>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/knock-on-mark.svg" alt="" width={18} height={13} />
          Open app
        </Link>
      </header>

      <div className={styles.stage} aria-hidden="true">
        <div className={styles.domino} data-domino>
          <canvas ref={canvasRef} className={styles.canvas} />
          <svg className={styles.overlay} viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}>
            <g data-face>
              <ellipse cx="66" cy="132" rx="17" ry="8" fill="#fd6a42" opacity=".7" />
              <ellipse cx="236" cy="132" rx="17" ry="8" fill="#fd6a42" opacity=".7" />
              {[90, 210].map((cx) => (
                <g key={cx} data-eye={cx}>
                  <ellipse cx={cx} cy="94" rx="18" ry="21" fill="#072d36" />
                  <circle cx={cx + 6} cy="86" r="6.5" fill="#fff" />
                  <circle cx={cx - 5} cy="102" r="2.6" fill="#fff" />
                </g>
              ))}
              <path data-smile d="M132 136 q18 20 36 0 z" fill="#072d36" transform="translate(150 136) scale(1.3) translate(-150 -136)" />
              <ellipse data-oh cx="150" cy="142" rx="11" ry="14" fill="#072d36" opacity="0" />
            </g>
            <g data-coral transform="rotate(40 -70 394)">
              <rect x="-101" y="285" width="40" height="112" rx="13" fill="#d84b2c" />
              <rect x="-110" y="282" width="40" height="112" rx="13" fill="#fd6a42" />
              <rect x="-104" y="290" width="7" height="40" rx="3.5" fill="#fff" opacity=".3" />
              <ellipse cx="-86" cy="300" rx="3.4" ry="5.2" fill="#072d36" />
              <ellipse cx="-77" cy="302" rx="3.4" ry="5.2" fill="#072d36" />
            </g>
            <g data-spark stroke="#fd6a42" strokeWidth="3.5" strokeLinecap="round" opacity="0">
              <path d="M-14 300 l-12 -10" />
              <path d="M-8 290 l-2 -16" />
              <path d="M-18 312 l-16 0" />
            </g>
          </svg>
        </div>
        {TILES.map((tl) => (
          <div
            key={tl.label}
            className={styles.tile}
            data-tile
            title={tl.label}
            style={{ left: tl.x, top: tl.y, background: tl.bg, transform: `rotate(${tl.r}deg)` }}
          >
            {tl.content}
          </div>
        ))}
      </div>
    </div>
  );
}
