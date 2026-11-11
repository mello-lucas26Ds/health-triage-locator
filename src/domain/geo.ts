// Geolocalização — cálculo de distância (regra de negócio pura)

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Distância Haversine entre dois pontos, em quilômetros.
 * Precisão suficiente para ordenar unidades por proximidade (erro < 0,5%).
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Arredonda para 1 casa decimal (distâncias exibidas ao usuário). */
export function roundDistance(km: number): number {
  return Math.round(km * 10) / 10;
}
