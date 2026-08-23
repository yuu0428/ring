/**
 * 「停めるな」で終わらせないための計算（FR-3 / FR-5）。
 */
import { NEARBY_PARKING_M, NEARBY_PARKING_N } from './constants';
import { distanceM } from './geo';
import type { Impound, LngLat, Parking, Station } from './types';

export interface WithDistance<T> {
  item: T;
  distanceM: number;
}

/** 近い順の駐輪場。半径外は返さない（遠すぎる案内は役に立たないため） */
export function nearbyParkings(
  point: LngLat,
  parkings: Parking[],
  limit = NEARBY_PARKING_N,
  radiusM = NEARBY_PARKING_M,
): WithDistance<Parking>[] {
  const out: WithDistance<Parking>[] = [];
  for (const p of parkings) {
    const [lon, lat] = p.geometry.coordinates as LngLat;
    // 粗い矩形で先に落としてから Haversine（地図移動のたびに全件計算しない）
    if (Math.abs(lon - point[0]) > 0.014 || Math.abs(lat - point[1]) > 0.011) continue;
    const d = distanceM(point, [lon, lat]);
    if (d <= radiusM) out.push({ item: p, distanceM: d });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

/**
 * 撤去された場合の行き先。
 * 「その駅を担当する保管所」が分かっていればそれを最優先で返す。
 * 分からなければ同じ区の保管所を距離順で返す。
 */
export function impoundsForStation(
  station: Station | undefined,
  point: LngLat,
  impounds: Impound[],
): WithDistance<Impound>[] {
  const scored = impounds.map((im) => {
    const [lon, lat] = im.geometry.coordinates as LngLat;
    return { item: im, distanceM: distanceM(point, [lon, lat]) };
  });

  if (station) {
    const covering = scored.filter((s) => s.item.properties.covered_stations.includes(station.name));
    if (covering.length > 0) return covering.sort((a, b) => a.distanceM - b.distanceM);

    const sameWard = scored.filter((s) => s.item.properties.municipality === station.municipality);
    if (sameWard.length > 0) return sameWard.sort((a, b) => a.distanceM - b.distanceM);
  }
  return scored.sort((a, b) => a.distanceM - b.distanceM).slice(0, 3);
}

/** 開所ルールから「今日は開いているか」を判定する。ルールが無ければ null（推測しない） */
export function isOpenToday(im: Impound, now = new Date()): boolean | null {
  const rule = im.properties.open_rule;
  if (!rule) return null;

  const dow = now.getDay();
  const dom = now.getDate();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;

  for (const range of rule.closed_ranges) {
    const [from, to] = range.split('..');
    if (!from || !to) continue;
    // 年をまたぐ範囲（12-29..01-03）にも対応する
    const inRange = from <= to ? mmdd >= from && mmdd <= to : mmdd >= from || mmdd <= to;
    if (inRange) return false;
  }

  if (rule.weekdays.includes(dow)) return true;
  if (dow === 0 && rule.nth_sunday) {
    const nth = Math.floor((dom - 1) / 7) + 1;
    if (rule.nth_sunday.includes(nth)) return true;
  }
  return false;
}

/** 「多い / 普通 / 少ない」— 放置台数から取締りの体感を伝える（FR-7.2） */
export function riskLabel(station: Station | undefined): { text: string; level: 0 | 1 | 2 } | null {
  const total = station?.counts?.total;
  if (station?.designated == null || total == null) return null;
  if (total >= 100) return { text: '放置が多い', level: 2 };
  if (total >= 20) return { text: '放置がやや多い', level: 1 };
  return { text: '放置は少なめ', level: 0 };
}
