import L from 'leaflet';

const BRAND_ORANGE = '#fb5e13';

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
  if (isSelected) return 48;
  if (isLive) return 44;
  return 40;
}

/**
 * Moto/scooter (Material Design) — legível em tamanhos pequenos no mapa.
 * @see https://fonts.google.com/icons — moped
 */
const MOPED_PATH =
  'M17.7 3.2c-1.4 0-2.7.8-3.3 2.1l-1.4 2.8c-.4.8-1.2 1.3-2.1 1.3H9c-1.7 0-3 1.3-3 3v1H4v3h1v7h3v-7h3.1c.9 0 1.7-.5 2.1-1.3l1.4-2.8c.6-1.3 1.9-2.1 3.3-2.1h.3V3.2h-.4zm-2.8 2.1c.3-.6 1-.9 1.6-.9h.5v1.9h-.5c-.6 0-1.1-.3-1.4-.8l-.2-.2zM7 14c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm10 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z';

export function createDelivererMapIcon(options: {
  accent: string;
  isSelected: boolean;
  isLive: boolean;
}): L.DivIcon {
  const { accent, isSelected, isLive } = options;
  const size = markerSize(isSelected, isLive);
  const border = 3;
  const iconInner = Math.round(size * 0.52);
  const pulseClass = isLive ? 'deliverer-marker-live' : '';

  const shadow = isSelected
    ? '0 0 0 3px rgba(251, 94, 19, 0.35), 0 4px 12px rgba(28, 20, 12, 0.25)'
    : '0 2px 8px rgba(28, 20, 12, 0.2)';

  const html = `
    <div
      class="deliverer-map-marker ${pulseClass}"
      style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:#ffffff;
        border:${border}px solid ${accent};
        box-shadow:${shadow};
        display:flex;
        align-items:center;
        justify-content:center;
      "
      aria-hidden="true"
    >
      <svg
        width="${iconInner}"
        height="${iconInner}"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        style="display:block;"
      >
        <path fill="${accent}" d="${MOPED_PATH}" />
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
