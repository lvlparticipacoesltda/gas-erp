import L from 'leaflet';
import { delivererMarkerSvg } from '@/components/deliverer-map-marker-art';

const BRAND_ORANGE = '#fb5e13';
const LABEL_HEIGHT = 18;
const LABEL_GAP = 4;

/** Cores do marcador conforme status de posição. */
export function delivererMarkerAccent(p: {
  stale: boolean;
  isLive: boolean;
}): string {
  if (p.stale) return '#94a3b8';
  if (p.isLive) return BRAND_ORANGE;
  return '#64748b';
}

export function delivererFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0]!.replace(/^[#~]+/, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markerSize(isSelected: boolean, isLive: boolean): number {
  if (isSelected) return 56;
  if (isLive) return 52;
  return 48;
}

export function createDelivererMapIcon(options: {
  name: string;
  accent: string;
  isSelected: boolean;
  isLive: boolean;
  stale: boolean;
}): L.DivIcon {
  const { name, accent, isSelected, isLive, stale } = options;
  const size = markerSize(isSelected, isLive);
  const pulseClass = isLive && !stale ? 'deliverer-marker-live' : '';
  const opacity = stale ? 0.72 : !isLive ? 0.88 : 1;
  const firstName = delivererFirstName(name);
  const label = escapeHtml(firstName.toLocaleUpperCase('pt-BR'));
  const hasLabel = firstName.length > 0;
  const labelBlock = hasLabel ? LABEL_HEIGHT + LABEL_GAP : 0;

  const shadow = isSelected
    ? `0 0 0 3px ${accent}44, 0 4px 14px rgba(28, 20, 12, 0.3)`
    : '0 2px 10px rgba(28, 20, 12, 0.22)';

  const totalHeight = size + labelBlock;
  const iconWidth = hasLabel ? Math.max(size, firstName.length * 7 + 12) : size;

  const html = `
    <div
      class="deliverer-map-marker-wrap"
      style="width:${iconWidth}px;height:${totalHeight}px;"
      aria-hidden="true"
    >
      ${
        hasLabel
          ? `<span class="deliverer-map-marker-label">${label}</span>`
          : ''
      }
      <div
        class="deliverer-map-marker ${pulseClass}"
        style="
          width:${size}px;
          height:${size}px;
          margin:0 auto;
          box-shadow:${shadow};
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
        "
      >
        ${delivererMarkerSvg(accent, size, opacity)}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'deliverer-map-marker-root',
    html,
    iconSize: [iconWidth, totalHeight],
    iconAnchor: [iconWidth / 2, labelBlock + size / 2],
    popupAnchor: [0, -(labelBlock + size / 2) - 4],
  });
}
