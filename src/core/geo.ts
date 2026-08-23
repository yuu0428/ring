/**
 * 地理演算のうすい層。Turf をここだけに閉じ込め、判定ロジックからは意味のある名前で呼ぶ。
 * 高頻度（地図移動のたび）に呼ばれるため、bbox による粗い絞り込みを必ず通す。
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import distance from '@turf/distance';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import polygonToLine from '@turf/polygon-to-line';
import type { Feature, LineString, MultiLineString, Position } from 'geojson';
import type { LngLat, Zone } from './types';

/** 2 点間の距離(m)。Haversine。東京の緯度では実用上の誤差は無視できる */
export function distanceM(a: LngLat, b: LngLat): number {
  return distance(a, b, { units: 'meters' });
}

/** 点が区域の内側にあるか。穴（MultiPolygon の内側リング）も正しく扱う */
export function isInside(point: LngLat, zone: Zone): boolean {
  return booleanPointInPolygon(point, zone.geometry);
}

// 区域ごとの bbox と境界線をキャッシュする。
// 地図移動のたびに全区域を再計算すると 500 件規模で確実に重くなる。
const bboxCache = new WeakMap<object, [number, number, number, number]>();
const lineCache = new WeakMap<object, Feature<LineString | MultiLineString>>();

export function zoneBbox(zone: Zone): [number, number, number, number] {
  const cached = bboxCache.get(zone);
  if (cached) return cached;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const [x, y] = coords as Position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(coords)) for (const c of coords) walk(c);
  };
  walk(zone.geometry.coordinates);
  const bb: [number, number, number, number] = [minX, minY, maxX, maxY];
  bboxCache.set(zone, bb);
  return bb;
}

function zoneLine(zone: Zone): Feature<LineString | MultiLineString> {
  const cached = lineCache.get(zone);
  if (cached) return cached;
  const line = polygonToLine(zone.geometry) as Feature<LineString | MultiLineString>;
  lineCache.set(zone, line);
  return line;
}

/**
 * 点から最も近い区域境界上の点と、その距離(m)。
 * FR-2.3 の「境界まで線を引く」描画に必要。
 */
export function nearestBoundary(
  point: LngLat,
  zone: Zone,
): { point: LngLat; distanceM: number } | null {
  const line = zoneLine(zone);
  if (line.geometry.type === 'MultiLineString') {
    let best: { point: LngLat; distanceM: number } | null = null;
    for (const coords of line.geometry.coordinates) {
      if (coords.length < 2) continue;
      const snapped = nearestPointOnLine(
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        point,
        { units: 'meters' },
      );
      const d = snapped.properties.dist ?? Infinity;
      if (!best || d < best.distanceM) {
        best = { point: snapped.geometry.coordinates as LngLat, distanceM: d };
      }
    }
    return best;
  }
  if (line.geometry.coordinates.length < 2) return null;
  const snapped = nearestPointOnLine(line, point, { units: 'meters' });
  return {
    point: snapped.geometry.coordinates as LngLat,
    distanceM: snapped.properties.dist ?? Infinity,
  };
}

/**
 * 緯度を考慮した「おおよそ何メートル分の度数か」。
 * bbox を広げて候補を絞るために使う（厳密でなくてよい）。
 */
export function metersToDegrees(meters: number, lat: number): { dx: number; dy: number } {
  const dy = meters / 111_320;
  const dx = meters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  return { dx, dy };
}

/** bbox を margin メートル分だけ広げた範囲に点が入るか */
export function inExpandedBbox(
  point: LngLat,
  bbox: [number, number, number, number],
  marginM: number,
): boolean {
  const { dx, dy } = metersToDegrees(marginM, point[1]);
  return (
    point[0] >= bbox[0] - dx &&
    point[0] <= bbox[2] + dx &&
    point[1] >= bbox[1] - dy &&
    point[1] <= bbox[3] + dy
  );
}

/** 距離を日本語で読みやすく整える。「12m」「1.2km」 */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** 方位（北=0, 東=90）。境界の方向を矢印で示すのに使う */
export function bearing(from: LngLat, to: LngLat): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const φ1 = toRad(from[1]);
  const φ2 = toRad(to[1]);
  const Δλ = toRad(to[0] - from[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** 方位を「北」「北東」…の日本語にする */
export function bearingToJa(deg: number): string {
  const names = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return names[Math.round(deg / 45) % 8];
}
