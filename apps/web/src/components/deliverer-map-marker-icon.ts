import L from 'leaflet';

const BRAND_ORANGE = '#fb5e13';
const BRAND_ORANGE_LIGHT = '#fff4ed';

/** Cores do marcador conforme status de posição. */
export function delivererMarkerAccent(p: {
  stale: boolean;
  isLive: boolean;
}): string {
  if (p.stale) return '#94a3b8';
  if (p.isLive) return BRAND_ORANGE;
  return '#64748b';
}

function markerSize(isSelected: boolean, isLive: boolean): number {
  if (isSelected) return 54;
  if (isLive) return 50;
  return 46;
}

/**
 * Entregador em moto — vista lateral (direita), com caixa e linhas de movimento.
 * Otimizado para leitura em ~46–54px no mapa.
 */
function scooterMarkup(accent: string): string {
  return `
    <g transform="translate(9.5, 7.5)">
      <g fill="${accent}">
        <!-- caixa de entrega -->
        <rect x="0" y="11" width="8.5" height="8.5" rx="1.2" />
        <!-- rodas -->
        <circle cx="11" cy="28.5" r="4.8" />
        <circle cx="28.5" cy="28.5" r="4.8" />
        <!-- chassi + guidão -->
        <path d="M14 24h8.5l2.4-7.5h5.2l-1.2 7.5h3.2v2.4H14z" />
        <path d="M27.5 16.5l1.8-5.2h2.2l-0.6 5.2z" />
        <!-- corpo -->
        <path d="M17.5 18.5h4.2v7.2h-4.2z" />
        <!-- capacete -->
        <circle cx="19.6" cy="12.8" r="4.5" />
        <!-- retrovisor -->
        <circle cx="25.2" cy="9.2" r="1.5" />
        <path d="M22.2 13.2l3.8-5.2" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" fill="none" />
      </g>
      <!-- detalhes claros -->
      <g fill="#ffffff">
        <circle cx="11" cy="28.5" r="1.9" />
        <circle cx="28.5" cy="28.5" r="1.9" />
        <path d="M16.8 11.5c1.1-2 3.4-2.8 5.4-1.6" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" fill="none" />
      </g>
      <!-- linhas de movimento -->
      <g stroke="${accent}" stroke-width="1.9" stroke-linecap="round" fill="none" opacity="0.9">
        <path d="M0 14h5" />
        <path d="M0 17.5h6.5" />
        <path d="M0 21h5" />
      </g>
    </g>
  `;
}

export function createDelivererMapIcon(options: {
  accent: string;
  isSelected: boolean;
  isLive: boolean;
}): L.DivIcon {
  const { accent, isSelected, isLive } = options;
  const size = markerSize(isSelected, isLive);
  const border = isSelected ? 3.5 : 3;
  const isBrandLive = isLive && accent === BRAND_ORANGE;

  const shadow = isSelected
    ? `0 0 0 3px rgba(251, 94, 19, 0.28), 0 4px 14px rgba(28, 20, 12, 0.28)`
    : `0 3px 10px rgba(28, 20, 12, 0.22)`;

  const pulseClass = isLive ? 'deliverer-marker-live' : '';
  const innerTint = isBrandLive ? BRAND_ORANGE_LIGHT : '#ffffff';

  const html = `
    <div
      class="deliverer-map-marker ${pulseClass}"
      style="
        width:${size}px;
        height:${size}px;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:${shadow};
        border-radius:9999px;
      "
      aria-hidden="true"
    >
      <svg
        width="${size}"
        height="${size}"
        viewBox="0 0 56 56"
        xmlns="http://www.w3.org/2000/svg"
        style="display:block;overflow:visible;"
      >
        <circle cx="28" cy="28" r="25.5" fill="${innerTint}" />
        <circle
          cx="28"
          cy="28"
          r="23"
          fill="#ffffff"
          stroke="${accent}"
          stroke-width="${border}"
        />
        ${scooterMarkup(accent)}
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'deliverer-map-marker-root',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 6],
  });
}
