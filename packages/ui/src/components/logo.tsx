// Generated from ../nile-brand/logo-variants/svg/nile-horizontal-short-light.svg (T-J2): the artwork is unchanged,
// the viewBox is cropped to the painted area. The full logo (with "marketplace") is too small to read at header
// size, so the apps use this one; the full logo is the storefront share image. Colours are the brand's own (navy
// #0E2A3B, gold #E2A93B), for light backgrounds.

export interface LogoProps {
  /** Height comes from the class (e.g. `h-8 w-auto`); the aspect ratio is fixed by the viewBox. */
  readonly className?: string;
  /** Accessible name. Omit only when visible text next to the logo already names it. */
  readonly label?: string;
}

function a11y(label: string | undefined) {
  return label === undefined
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': label };
}

/** Short logo: mark and "nile" (storefront header; portal headers next to the portal's name). */
export function NileLogoShort({ className, label }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 20 250 112"
      className={className}
      focusable="false"
      {...a11y(label)}
    >
      <g transform="translate(20 20) scale(0.9333)">
        <rect width="120" height="120" rx="30" fill="#0E2A3B" />
        <circle cx="60" cy="50" r="16" fill="#E2A93B" />
        <path
          d="M22 82 C 34 72, 46 72, 60 82 S 86 92, 98 82"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M174.02734375 79.92578125C174.02734375 74.16015625 177.015625 71.59375 181.3046875 71.59375C185.62890625 71.59375 188.125 74.23046875 188.125 79.22265625V100.5625H198.4609375V77.32421875C198.4609375 67.9375 193.36328125 62.6640625 185.453125 62.6640625C180.109375 62.6640625 176.34765625 65.0546875 173.8515625 69.2734375V63.4375H163.65625V100.5625H174.02734375ZM203.64859375 100.5625H214.0196875V63.4375H203.64859375ZM229.54328125 48.1796875H219.1721875V100.5625H229.54328125ZM251.64109375 101.40625C260.64109375 101.40625 267.81296875 96.2734375 269.1840625 88.890625H259.72703125C258.7778125 91.7734375 256.00046875 93.63671875 251.9575 93.63671875C246.50828125 93.63671875 243.34421875 90.0859375 243.1684375 84.6015625H269.57078125V81.82421875C269.57078125 70.50390625 262.223125 62.59375 251.28953125 62.59375C240.6371875 62.59375 233.07859375 70.71484375 233.07859375 82.03515625C233.07859375 93.3203125 240.39109375 101.40625 251.64109375 101.40625ZM243.23875 77.9921875C243.80125 73.3515625 246.85984375 70.46875 251.50046875 70.46875C256.17625 70.46875 259.27 73.3515625 259.79734375 77.9921875Z"
        fill="#0E2A3B"
      />
      <circle cx="208.83" cy="48.44" r="7.50" fill="#E2A93B" />
    </svg>
  );
}
