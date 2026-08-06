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

/**
 * Projeta lat/lng num plano local em metros, com a longitude corrigida pelo
 * cosseno da latitude de referência.
 *
 * Em escala urbana (poucos km) o erro é desprezível, e é o que permite fazer
 * projeção vetorial em metros — misturar graus de latitude com graus de longitude
 * direto daria peso errado à longitude fora do equador.
 */
function toLocalMeters(point: LatLng, origin: LatLng): { x: number; y: number } {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = metersPerDegLat * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * metersPerDegLng,
    y: (point.latitude - origin.latitude) * metersPerDegLat,
  };
}

export type PolylineProjection = {
  /** Índice do segmento em que o ponto caiu (do vértice `i` ao `i + 1`). */
  segmentIndex: number;
  /** Ponto projetado sobre a rota — o "você está aqui" colado na linha. */
  projected: LatLng;
  /** Distância do ponto até a rota, em metros. */
  distanceFromRouteMeters: number;
};

/**
 * Projeta um ponto na polyline, devolvendo onde ele caiu.
 *
 * Diferente de `distanceToPolylineMeters`, que só responde "quão longe da rota",
 * aqui interessa **em que altura da rota** o ponto está — é o que permite medir
 * progresso e, com ele, distância e tempo restantes sem consultar o provedor.
 */
export function projectOnPolyline(
  point: LatLng,
  polyline: LatLng[],
): PolylineProjection | null {
  if (polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      segmentIndex: 0,
      projected: polyline[0],
      distanceFromRouteMeters: haversineDistanceMeters(
        point.latitude,
        point.longitude,
        polyline[0].latitude,
        polyline[0].longitude,
      ),
    };
  }

  let best: PolylineProjection | null = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const pa = toLocalMeters(point, a);
    const ba = toLocalMeters(b, a);
    const segLenSq = ba.x * ba.x + ba.y * ba.y;

    // Vértices repetidos aparecem em polyline decodificada; o segmento vira ponto.
    const t =
      segLenSq === 0
        ? 0
        : Math.max(0, Math.min(1, (pa.x * ba.x + pa.y * ba.y) / segLenSq));

    const projected: LatLng = {
      latitude: a.latitude + t * (b.latitude - a.latitude),
      longitude: a.longitude + t * (b.longitude - a.longitude),
    };
    const distance = haversineDistanceMeters(
      point.latitude,
      point.longitude,
      projected.latitude,
      projected.longitude,
    );

    if (!best || distance < best.distanceFromRouteMeters) {
      best = { segmentIndex: i, projected, distanceFromRouteMeters: distance };
    }
  }

  return best;
}

/**
 * Distância que ainda falta percorrer até o fim da polyline.
 *
 * É a soma do trecho que resta no segmento atual mais todos os segmentos
 * seguintes — o número que o painel precisa mostrar decrescendo enquanto o
 * entregador anda. Sem isto, restaria exibir a distância total da rota, que não
 * muda até o próximo recálculo.
 */
export function remainingDistanceMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length < 2) return 0;

  const projection = projectOnPolyline(point, polyline);
  if (!projection) return 0;

  let total = haversineDistanceMeters(
    projection.projected.latitude,
    projection.projected.longitude,
    polyline[projection.segmentIndex + 1].latitude,
    polyline[projection.segmentIndex + 1].longitude,
  );

  for (let i = projection.segmentIndex + 1; i < polyline.length - 1; i++) {
    total += haversineDistanceMeters(
      polyline[i].latitude,
      polyline[i].longitude,
      polyline[i + 1].latitude,
      polyline[i + 1].longitude,
    );
  }

  return total;
}

/** Comprimento total da polyline, em metros. */
export function polylineLengthMeters(polyline: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += haversineDistanceMeters(
      polyline[i].latitude,
      polyline[i].longitude,
      polyline[i + 1].latitude,
      polyline[i + 1].longitude,
    );
  }
  return total;
}

/**
 * Distância mínima (metros) de um ponto à polyline — usada para detectar desvio
 * de rota. Reaproveita a projeção de `projectOnPolyline`: antes havia aqui uma
 * projeção própria que dividia produto escalar em graus por comprimento em
 * metros, o que superestimava o desvio e disparava recálculo à toa.
 */
export function distanceToPolylineMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity;
  return projectOnPolyline(point, polyline)?.distanceFromRouteMeters ?? Infinity;
}
