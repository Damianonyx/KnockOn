/**
 * Halftone dots for Knocky, the big open-top domino in the landing hero.
 *
 * Pure geometry, no randomness at runtime beyond a fixed seed, so the server
 * and every browser draw the same dots. Coordinates are in the hero's SVG
 * viewBox ("-140 -60 530 520"): the front face spans x 0–300, y 0–450.
 */

export const VIEWBOX = { x: -140, y: -60, w: 530, h: 520 };

const FX = 0;
const FY = 0;
const FW = 300;
const FH = 450;
const DX = 74; // depth offset of the side and the open top
const DY = -46;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inRoundRect(x: number, y: number, x0: number, y0: number, w: number, h: number, r: number) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Point in parallelogram p + a*u + b*v (0 ≤ a, b ≤ 1); returns [inside, a, b]. */
function inParallelogram(x: number, y: number, p: [number, number], u: [number, number], v: [number, number]): [boolean, number, number] {
  const det = u[0] * v[1] - u[1] * v[0];
  const rx = x - p[0];
  const ry = y - p[1];
  const a = (rx * v[1] - ry * v[0]) / det;
  const b = (u[0] * ry - u[1] * rx) / det;
  return [a >= 0 && a <= 1 && b >= 0 && b <= 1, a, b];
}

/** 0 = paper, 1 = full ink. Light from the upper left; the base dissolves into the page. */
function darkness(x: number, y: number): number {
  const fade = Math.max(0, Math.min(1, (FH + 10 - y) / 230)) ** 1.4;
  // open top (dark interior with a lighter rim)
  let [inside, a, b] = inParallelogram(x, y, [FX + 12, FY + 2], [FW - 24, 0], [DX, DY]);
  if (inside) {
    const rim = Math.min(a, 1 - a, b, 1 - b);
    return rim < 0.06 ? 0.55 : 0.92 - 0.25 * b;
  }
  // right side
  [inside, a, b] = inParallelogram(x, y, [FX + FW, FY + 18], [DX, DY], [0, FH - 30]);
  if (inside) return (0.58 + 0.3 * b) * fade;
  // front face
  if (inRoundRect(x, y, FX, FY, FW, FH, 46)) {
    const u = (x - FX) / FW;
    const v = (y - FY) / FH;
    let d = 0.04 + 0.34 * v ** 1.3 + 0.14 * u ** 2;
    const edge = Math.min(u, 1 - u) * FW;
    if (edge < 16) d += 0.25 * (1 - edge / 16);
    if (Math.abs(v - 0.5) < 0.008 && u > 0.18 && u < 0.82) d = 0.75; // the domino's middle line
    return Math.min(1, d) * fade;
  }
  return 0;
}

export interface Dot {
  x: number;
  y: number;
  r: number;
  /** 0–1: when this dot prints in during the intro (a diagonal sweep from the top left). */
  order: number;
}

let cache: Dot[] | null = null;

export function knockyDots(): Dot[] {
  if (cache) return cache;
  const rand = rng(7);
  const dots: Dot[] = [];
  const step = 4.4;
  let row = 0;
  for (let y = FY + DY - 4; y < FH + 10; y += step, row++) {
    for (let x = FX - 4 + (row % 2 ? step / 2 : 0); x < FX + FW + DX + 6; x += step) {
      const d = darkness(x, y);
      if (d > 0.03 && rand() < 0.55 + 0.45 * Math.min(1, d * 3)) {
        const r = Math.sqrt(d) * step * 0.56 * (0.85 + rand() * 0.3);
        if (r > 0.35) dots.push({ x, y, r, order: (x * 0.6 + y) / 820 + rand() * 0.06 });
      }
    }
  }
  cache = dots;
  return dots;
}
