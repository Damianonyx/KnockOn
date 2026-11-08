/**
 * Knocky, the halftone domino mascot, in one of its poses. Decorative: the
 * text next to it always says what matters, so it has an empty alt.
 */
const POSES = {
  hello: { w: 320, h: 466 },
  knock: { w: 320, h: 293 },
  whoa: { w: 320, h: 463 },
  gotit: { w: 320, h: 409 },
} as const;

export type KnockyPoseName = keyof typeof POSES;

export function KnockyPose({ pose, width, className }: { pose: KnockyPoseName; width: number; className?: string }) {
  const { w, h } = POSES[pose];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/knocky/${pose}.webp`}
      width={width}
      height={Math.round((width * h) / w)}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={className}
      style={{ display: 'block', flex: 'none' }}
    />
  );
}
