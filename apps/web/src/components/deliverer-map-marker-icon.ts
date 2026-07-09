import L from 'leaflet';

const MARKER_IMAGE = '/brand/deliverer-map-marker.png';

/** Cores do marcador conforme status de posição (anel de seleção). */
export function delivererMarkerAccent(p: {
  stale: boolean;
  isLive: boolean;
}): string {
  if (p.stale) return '#94a3b8';
  if (p.isLive) return '#fb5e13';
  return '#64748b';
}

function markerSize(isSelected: boolean, isLive: boolean): number {
  if (isSelected) return 52;
  if (isLive) return 48;
  return 44;
}

export function createDelivererMapIcon(options: {
  accent: string;
  isSelected: boolean;
  isLive: boolean;
  stale: boolean;
}): L.DivIcon {
  const { accent, isSelected, isLive, stale } = options;
  const size = markerSize(isSelected, isLive);
  const pulseClass = isLive && !stale ? 'deliverer-marker-live' : '';

  const filter = stale
    ? 'grayscale(1) saturate(0.35) opacity(0.82)'
    : !isLive
      ? 'saturate(0.55) brightness(0.95)'
      : 'none';

  const shadow = isSelected
    ? `0 0 0 3px ${accent}55, 0 4px 12px rgba(28, 20, 12, 0.28)`
    : '0 2px 8px rgba(28, 20, 12, 0.2)';

  const html = `
    <div
      class="deliverer-map-marker ${pulseClass}"
      style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        box-shadow:${shadow};
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
      "
      aria-hidden="true"
    >
      <img
        src="${MARKER_IMAGE}"
        width="${size}"
        height="${size}"
        alt=""
        draggable="false"
        style="
          display:block;
          width:100%;
          height:100%;
          object-fit:contain;
          filter:${filter};
          pointer-events:none;
          user-select:none;
        "
      />
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
