/** The Graphein brand mark — the "g" with its 4-node color ramp.
 *  The stroke uses currentColor so it adapts to light/dark surroundings. */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 116.85 116.85"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g transform="translate(18.618,2.609)">
        <path
          d="M61,29 A23,23 0 1 0 61,53 C61,68 62,82 56,89 C51,95 38,95 30,90"
          fill="none"
          stroke="currentColor"
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="61.00" cy="29.00" r="6.9" fill="#4F46E5" />
        <circle cx="18.57" cy="43.97" r="6.9" fill="#1E88E5" />
        <circle cx="61.04" cy="60.15" r="6.9" fill="#06B6D4" />
        <circle cx="30.00" cy="90.00" r="6.9" fill="#10B981" />
      </g>
    </svg>
  );
}
