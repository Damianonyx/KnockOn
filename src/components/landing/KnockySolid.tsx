/** Flat, solid-teal Knocky for small sizes, where halftone dots would turn muddy. */
export function KnockySolid({ size = 96, title }: { size?: number; title?: string }) {
  return (
    <svg
      viewBox="-4 -12 196 270"
      width={size}
      height={(size * 270) / 196}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M136 20 L174 -6 L174 214 Q174 240 150 248 L136 236 Z" fill="#021e25" />
      <rect x="0" y="0" width="150" height="236" rx="34" fill="#0d4452" />
      <rect x="26" y="115" width="98" height="6" rx="3" fill="#fff8ee" opacity=".45" />
      {[45, 105].map((x) => (
        <g key={x}>
          <circle cx={x} cy="52" r="15" fill="#fff8ee" />
          <circle cx={x + 4} cy="47" r="5.5" fill="#0d4452" />
        </g>
      ))}
      <ellipse cx="33" cy="80" rx="11" ry="6" fill="#fd6a42" />
      <ellipse cx="117" cy="80" rx="11" ry="6" fill="#fd6a42" />
      <path d="M58 80 q17 19 34 0 z" fill="#fff8ee" />
    </svg>
  );
}
