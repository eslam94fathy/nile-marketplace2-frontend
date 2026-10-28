// Brand placeholders for missing images (../nile-brand/placeholders, T-J2), shown by `<NileImage>` (T-J3) when an
// image is `null`. Artwork unchanged; `slice` fills any box the way an image with `object-fit: cover` does.

export interface ImagePlaceholderProps {
  readonly className?: string;
  /** Accessible name. Omit when the placeholder stands next to text that names the item (the usual case). */
  readonly label?: string;
}

function a11y(label: string | undefined) {
  return label === undefined
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': label };
}

/** Square product placeholder (800 × 800). */
export function ProductImagePlaceholder({ className, label }: ImagePlaceholderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      focusable="false"
      {...a11y(label)}
    >
      <rect width="800" height="800" fill="#E8F0F2" />
      <g transform="translate(230 230) scale(1.0625)">
        <path d="M70 110 L160 155 L160 255 L70 210 Z" fill="#0E2A3B" fillOpacity="0.12" />
        <path d="M160 155 L250 110 L250 210 L160 255 Z" fill="#0E2A3B" fillOpacity="0.06" />
        <path
          d="M160 65 L250 110 L160 155 L70 110 Z M70 110 L70 210 L160 255 L250 210 L250 110 M160 155 L160 255"
          fill="none"
          stroke="#0E2A3B"
          strokeOpacity="0.35"
          strokeWidth="8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M115 87 L205 132"
          fill="none"
          stroke="#0E2A3B"
          strokeOpacity="0.35"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="252" cy="52" r="24" fill="#E2A93B" />
        <path
          d="M60 292 C 80 278, 100 278, 120 292 S 160 306, 180 292 S 220 278, 240 292 S 258 300, 260 298"
          fill="none"
          stroke="#1F6F80"
          strokeOpacity="0.6"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Landscape category placeholder (800 × 600). */
export function CategoryImagePlaceholder({ className, label }: ImagePlaceholderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      focusable="false"
      {...a11y(label)}
    >
      <rect width="800" height="600" fill="#E8F0F2" />
      <g transform="translate(240 150)">
        <rect
          x="52"
          y="20"
          width="96"
          height="96"
          rx="22"
          fill="none"
          stroke="#0E2A3B"
          strokeOpacity="0.35"
          strokeWidth="8"
        />
        <rect x="172" y="20" width="96" height="96" rx="22" fill="#0E2A3B" fillOpacity="0.12" />
        <circle cx="220" cy="68" r="22" fill="#E2A93B" />
        <rect x="52" y="140" width="96" height="96" rx="22" fill="#0E2A3B" fillOpacity="0.12" />
        <rect
          x="172"
          y="140"
          width="96"
          height="96"
          rx="22"
          fill="none"
          stroke="#0E2A3B"
          strokeOpacity="0.35"
          strokeWidth="8"
        />
        <path
          d="M60 276 C 80 262, 100 262, 120 276 S 160 290, 180 276 S 220 262, 240 276 S 260 284, 262 282"
          fill="none"
          stroke="#1F6F80"
          strokeOpacity="0.6"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
