/** Distância em metros entre dois pontos (Haversine). */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Formata distância para exibição (~2,3 km ou ~450 m). */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `~${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `~${km.toFixed(1).replace('.', ',')} km` : `~${Math.round(km)} km`;
}
