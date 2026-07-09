/**
 * Ícone de entregador em moto — Lucide "moped" (ISC).
 * https://lucide.dev/icons/moped
 */
export function delivererScooterMarkup(accent: string): string {
  return `
    <g
      transform="translate(32 33) scale(1.45) translate(-12 -12)"
      stroke="${accent}"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <path d="m18.16 14.12-3-9h-2" />
      <path d="M19 10a7 7 0 0 0-7 7H8" />
      <path d="m3 9 6 2" />
      <circle cx="19" cy="17" r="3" />
      <circle cx="5" cy="17" r="3" />
    </g>
  `;
}

export function delivererMarkerSvg(accent: string, size: number, opacity: number): string {
  return `
    <svg
      width="${size}"
      height="${size}"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      style="display:block;opacity:${opacity}"
    >
      <circle cx="32" cy="32" r="29" fill="#ffffff" stroke="${accent}" stroke-width="3.5"/>
      ${delivererScooterMarkup(accent)}
    </svg>
  `;
}
