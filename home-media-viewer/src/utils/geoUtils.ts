const R = 6371e3; // Earth radius

export const haversineDistanceBetweenPoints = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const deltaLon = lon2 - lon1;
  const deltaLambda = (deltaLon * Math.PI) / 180;
  const d = Math.acos(Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(deltaLambda)) * R;

  return d;
};

export const getSquareAroundCoordinate = (
  latitude: number,
  longitude: number,
  distanceInMeter: number,
): { latMin: number; latMax: number; lonMin: number; lonMax: number } => {
  const latUnitDistance = (R * Math.PI) / 180;
  const lonUnitDistance = ((R * Math.PI) / 180) * Math.cos((latitude * Math.PI) / 180);

  const latTreshold = (1 / latUnitDistance) * distanceInMeter;
  const lonTreshold = (1 / lonUnitDistance) * distanceInMeter;

  return {
    latMin: latitude - latTreshold,
    latMax: latitude + latTreshold,
    lonMin: longitude - lonTreshold,
    lonMax: longitude + lonTreshold,
  };
};
