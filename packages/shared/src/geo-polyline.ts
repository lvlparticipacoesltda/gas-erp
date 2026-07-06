import { haversineDistanceMeters } from './geo-distance';

export type LatLng = { latitude: number; longitude: number };

/** Decodifica polyline encoded do Google Directions. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const directA = haversineDistanceMeters(point.latitude, point.longitude, a.latitude, a.longitude);
  const directB = haversineDistanceMeters(point.latitude, point.longitude, b.latitude, b.longitude);
  const segLen = haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  if (segLen < 1) return directA;

  // Projeção aproximada no segmento (suficiente para reroute em distâncias urbanas).
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.latitude - a.latitude) * (b.latitude - a.latitude)
        + (point.longitude - a.longitude) * (b.longitude - a.longitude))
        / (segLen * segLen / 1e10 || 1),
    ),
  );
  const proj = {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
  };
  return haversineDistanceMeters(point.latitude, point.longitude, proj.latitude, proj.longitude);
}

/** Distância mínima (metros) de um ponto à polyline. */
export function distanceToPolylineMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineDistanceMeters(
      point.latitude,
      point.longitude,
      polyline[0].latitude,
      polyline[0].longitude,
    );
  }

  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegmentMeters(point, polyline[i], polyline[i + 1]);
    if (d < min) min = d;
  }
  return min;
}
