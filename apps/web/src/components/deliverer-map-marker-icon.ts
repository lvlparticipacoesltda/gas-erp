import L from 'leaflet';

/** Cores do marcador conforme status de posição. */
export function delivererMarkerAccent(p: {
  stale: boolean;
  isLive: boolean;
}): string {
  if (p.stale) return '#94a3b8';
  if (p.isLive) return '#fb5e13';
  return '#3b82f6';
}

function markerSize(isSelected: boolean, isLive: boolean): number {
  if (isSelected) return 48;
  if (isLive) return 44;
  return 40;
}

/**
 * Silhueta de entregador em moto (vista lateral) — inspirada no ícone de referência.
 * Desenhada para legibilidade em ~40px no mapa.
 */
const SCOOTER_SILHOUETTE = `
  <g fill="currentColor">
    <circle cx="11" cy="27" r="3.2" />
    <circle cx="25" cy="27" r="3.2" />
    <path d="M13.5 24.5h6.2l1.4-4.2h3.1l-0.8 4.2h2.1v1.6H13.5z" />
    <circle cx="18.5" cy="11.5" r="3.1" />
    <path d="M16.8 14.2h3.4v5.6h-3.4z" />
    <path d="M15.2 12.8c0.8-1.6 2.4-2.6 4.2-2.6 0.5 0 1 0.1 1.4 0.2l-0.5 1.4c-0.3-0.1-0.6-0.1-0.9-0.1-1.2 0-2.2 0.6-2.8 1.5l-1.4-0.4z" />
    <rect x="5.5" y="14.5" width="6.2" height="6.2" rx="0.6" />
    <path d="M3.5 17.2h2.4M2.5 19.8h3.2M3.5 22.4h2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" />
  </g>
`;

export function createDelivererMapIcon(options: {
  accent: string;
  isSelected: boolean;
  isLive: boolean;
}): L.DivIcon {
  const { accent, isSelected, isLive } = options;
  const size = markerSize(isSelected, isLive);
  const border = isSelected ? 4 : 3;
  const selectedRing = isSelected
    ? 'box-shadow:0 0 0 2px #1d4ed8,0 2px 8px rgba(28,20,12,0.22);'
    : 'box-shadow:0 2px 6px rgba(28,20,12,0.18);';
  const pulseClass = isLive ? 'deliverer-marker-live' : '';

  const html = `
    <div
      class="deliverer-map-marker ${pulseClass}"
      style="
        width:${size}px;
        height:${size}px;
        display:flex;
        align-items:center;
        justify-content:center;
        ${selectedRing}
        border-radius:9999px;
      "
      aria-hidden="true"
    >
      <svg
        width="${size}"
        height="${size}"
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        style="display:block;overflow:visible;"
      >
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="#ffffff"
          stroke="${accent}"
          stroke-width="${border}"
        />
        <g color="${accent}" transform="translate(4.5, 2.5)">
          ${SCOOTER_SILHOUETTE}
        </g>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'deliverer-map-marker-root',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 4],
  });
}
