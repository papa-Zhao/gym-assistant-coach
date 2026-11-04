// Small stroke icon set (24px grid, Lucide-style geometry), drawn inline so
// the LIFF bundle needs no icon font. Icons are decorative: the button or
// link around them carries the accessible name.

const PATHS = {
  scale: (
    <>
      <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8.5 10a3.5 3.5 0 0 1 7 0" />
      <path d="m12 10 1.5-2" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6.5 6.5v11" />
      <path d="M17.5 6.5v11" />
      <path d="M3.5 9v6" />
      <path d="M20.5 9v6" />
      <path d="M6.5 12h11" />
    </>
  ),
  utensils: (
    <>
      <path d="M4 3v7a3 3 0 0 0 3 3v8" />
      <path d="M10 3v7a3 3 0 0 1-3 3" />
      <path d="M7 3v6" />
      <path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v4H17" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M10 2h4" />
    </>
  ),
  flame: (
    <path d="M12 3c.5 3 3 4.5 4.5 6.5A6.5 6.5 0 1 1 6 12c0-1.8.8-3.2 2-4.2.2 1.7 1 2.7 2 3.2C9.5 8 10.5 5 12 3z" />
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  pencil: (
    <>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  bellOff: (
    <>
      <path d="M8.7 4.2A6 6 0 0 1 18 9c0 2.8.6 4.5 1.2 5.5" />
      <path d="M6 9c0 5-2 6.5-2 6.5h11.5" />
      <path d="M10 19a2 2 0 0 0 4 0" />
      <path d="m3 3 18 18" />
    </>
  ),
  skip: (
    <>
      <path d="m6 6 8 6-8 6z" />
      <path d="M18 6v12" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15v4" />
      <path d="M17 17h4" />
    </>
  ),
  trendDown: (
    <>
      <path d="m3 7 7 7 4-4 7 7" />
      <path d="M15 17h6v-6" />
    </>
  ),
  trendUp: (
    <>
      <path d="m3 17 7-7 4 4 7-7" />
      <path d="M15 7h6v6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
