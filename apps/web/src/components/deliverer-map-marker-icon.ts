import L from 'leaflet';
import { delivererMarkerSvg } from '@/components/deliverer-map-marker-art';

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
  if (isSelected) return 56;
  if (isLive) return 52;
  return 48;
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
  const opacity = stale ? 0.72 : !isLive ? 0.88 : 1;

  const shadow = isSelected
    ? `0 0 0 3px ${accent}44, 0 4px 14px rgba(28, 20, 12, 0.3)`
    : '0 2px 10px rgba(28, 20, 12, 0.22)';

  const html = `
    <div
      class="deliverer-map-marker ${pulseClass}"
      style="
        width:${size}px;
        height:${size}px;
        box-shadow:${shadow};
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
      "
      aria-hidden="true"
    >
      ${delivererMarkerSvg(accent, size, opacity)}
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
