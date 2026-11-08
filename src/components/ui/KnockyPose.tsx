/**
 * Knocky, the halftone domino mascot, alive: each pose is a self-contained
 * animated SVG (breathing, blinking, a gesture and a speech bubble). With
 * reduced motion turned on, it holds still on the key pose. Decorative: the
 * text next to it always says what matters, so it has an empty alt.
 */
const POSES = {
  hello: { w: 440, h: 540 },
  knock: { w: 550, h: 540 },
  whoa: { w: 440, h: 540 },
  gotit: { w: 440, h: 540 },
} as const;

export type KnockyPoseName = keyof typeof POSES;

export function KnockyPose({ pose, width, className }: { pose: KnockyPoseName; width: number; className?: string }) {
  const { w, h } = POSES[pose];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/knocky/${pose}.svg`}
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
