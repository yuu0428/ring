/**
 * 判定エンジン（spec.md 6章）— このアプリの心臓部。
 *
 * UI に一切依存しない純粋関数として実装する。
 * 変更するときは tests/judge.test.ts の T-1〜T-15 を必ず通すこと。
 *
 * 設計の核（DECISIONS D-05 / D-06 / D-07 / D-08）:
 *   - 精度の高いデータが常に勝つ。Tier A が覆う駅に Tier B の推定を重ねない。
 *   - データが無い場所を「停めてよい」と断定しない。
 *   - すべての判定に出典を添える。evidence が空の Verdict を返してはならない。
 */
import { WARN_DISTANCE_M, RECENT_CHANGE_DAYS, TOKYO_BBOX } from './constants';
import { distanceM, inExpandedBbox, isInside, nearestBoundary, zoneBbox } from './geo';
import type {
  Confidence,
  Evidence,
  LngLat,
  RingData,
  Station,
  Verdict,
  Zone,
  ZoneChange,
} from './types';

/** 区域から出典情報を作る */
function zoneEvidence(z: Zone): Evidence {
  return {
    label: z.properties.source_name,
    url: z.properties.source_url,
    verifiedAt: z.properties.verified_at,
    accuracy: z.properties.accuracy,
  };
}

function accuracyToConfidence(z: Zone): Confidence {
  switch (z.properties.accuracy) {
    case 'traced':
      return 'high';
    case 'described':
      return 'medium';
    default:
      return 'low';
  }
}

/** 施行日・廃止日を見て、その時点で有効な区域か判定する */
function isEffective(z: Zone, today: string): boolean {
  if (z.properties.status !== 'active') return false;
  if (z.properties.effective_from > today) return false;
  if (z.properties.effective_to != null && z.properties.effective_to <= today) return false;
  return true;
}

function inTokyo(p: LngLat): boolean {
  return p[0] >= TOKYO_BBOX[0] && p[0] <= TOKYO_BBOX[2] && p[1] >= TOKYO_BBOX[1] && p[1] <= TOKYO_BBOX[3];
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** 判定点に関係する区域変更（施行前 or 最近施行された）を探す */
function findRelevantChange(
  station: Station | undefined,
  zone: Zone | undefined,
  changes: ZoneChange[],
  today: string,
): ZoneChange | undefined {
  const names = new Set<string>();
  if (station) names.add(station.name);
  if (zone) for (const s of zone.properties.stations) names.add(s);
  if (names.size === 0) return undefined;

  const related = changes.filter((c) => c.affected_stations.some((s) => names.has(s)));
  if (related.length === 0) return undefined;

  // 施行前のものを最優先。無ければ最近施行されたもの
  const upcoming = related
    .filter((c) => c.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (upcoming.length > 0) return upcoming[0];

  const recent = related
    .filter((c) => daysBetween(c.effective_from, today) <= RECENT_CHANGE_DAYS)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return recent[0];
}

const OUTSIDE_CAVEAT =
  '放置禁止区域ではありませんが、歩行者の通行を妨げる場所や私有地には停められません。';

export interface JudgeOptions {
  /** テストのために現在日を固定できるようにする。YYYY-MM-DD */
  today?: string;
}

/**
 * 判定の本体。
 * どんな入力でも必ず Verdict を返す（例外を投げない）。路上のどこを指しても答えを返すため。
 */
export function judge(point: LngLat, data: RingData, opts: JudgeOptions = {}): Verdict {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const zones = data.zones ?? [];
  const stations = data.stations ?? [];
  const changes = data.changes ?? [];

  // ---- STEP 0: 施行前の区域（事前通知）------------------------------------
  let upcoming: Verdict['upcoming'];
  for (const z of zones) {
    if (z.properties.status !== 'planned') continue;
    if (z.properties.effective_from <= today) continue;
    if (!inExpandedBbox(point, zoneBbox(z), 0)) continue;
    if (isInside(point, z)) {
      const change = changes.find((c) => c.zone_ids.includes(z.properties.id)) ?? null;
      upcoming = { change, zone: z };
      break;
    }
  }

  // 有効な Tier A / Tier B を分ける
  const activeZones = zones.filter((z) => isEffective(z, today));
  const tierA = activeZones.filter((z) => z.properties.tier === 'A');
  const tierB = activeZones.filter((z) => z.properties.tier === 'B');

  // ---- STEP 1: Tier A の内側か ------------------------------------------
  for (const z of tierA) {
    if (!inExpandedBbox(point, zoneBbox(z), 0)) continue;
    if (!isInside(point, z)) continue;
    const exit = nearestBoundary(point, z);
    return finish({
      level: 'inside',
      confidence: accuracyToConfidence(z),
      headline: 'ここは撤去対象です',
      detail: `${z.properties.name}の内側です。警告のうえ即日撤去されることがあります。`,
      zone: z,
      exitDistanceM: exit?.distanceM,
      boundaryPoint: exit?.point,
      evidence: [zoneEvidence(z)],
      upcoming,
      changes,
      today,
    });
  }

  // ---- STEP 2: Tier A の境界ぎわか --------------------------------------
  let nearestA: { zone: Zone; d: number; pt: LngLat } | null = null;
  for (const z of tierA) {
    if (!inExpandedBbox(point, zoneBbox(z), 600)) continue;
    const nb = nearestBoundary(point, z);
    if (!nb) continue;
    if (!nearestA || nb.distanceM < nearestA.d) nearestA = { zone: z, d: nb.distanceM, pt: nb.point };
  }

  if (nearestA && nearestA.d <= WARN_DISTANCE_M) {
    return finish({
      level: 'near',
      confidence: accuracyToConfidence(nearestA.zone),
      headline: `あと${Math.round(nearestA.d)}mで撤去対象`,
      detail: `${nearestA.zone.properties.name}のすぐ外側です。境界は目印がないため、少し進むだけで対象になります。`,
      zone: nearestA.zone,
      distanceToBoundaryM: nearestA.d,
      boundaryPoint: nearestA.pt,
      evidence: [zoneEvidence(nearestA.zone)],
      upcoming,
      changes,
      today,
    });
  }

  // ---- STEP 3: Tier B（駅指定リング）------------------------------------
  // Tier A が覆っている駅は対象外にする（DECISIONS D-05）
  const coveredByA = new Set(tierA.flatMap((z) => z.properties.stations));

  let hitB: { zone: Zone; station: Station | undefined; d: number } | null = null;
  let nearestB: { zone: Zone; d: number; pt: LngLat } | null = null;

  for (const z of tierB) {
    if (z.properties.stations.some((s) => coveredByA.has(s))) continue;
    if (!inExpandedBbox(point, zoneBbox(z), 600)) continue;

    if (isInside(point, z)) {
      const st = stations.find((s) => s.name === z.properties.stations[0]);
      const d = st ? distanceM(point, [st.lon, st.lat]) : 0;
      if (!hitB || d < hitB.d) hitB = { zone: z, station: st, d };
      continue;
    }
    const nb = nearestBoundary(point, z);
    if (!nb) continue;
    if (!nearestB || nb.distanceM < nearestB.d) nearestB = { zone: z, d: nb.distanceM, pt: nb.point };
  }

  if (hitB) {
    const z = hitB.zone;
    const exit = nearestBoundary(point, z);
    const st = hitB.station;
    return finish({
      level: 'likely',
      confidence: 'low',
      headline: '撤去対象の可能性が高い場所です',
      detail: st
        ? `${st.display_name}は放置禁止区域に指定されています。ここは駅から約${Math.round(hitB.d)}mで、区域の内側にあたる可能性が高い場所です。`
        : 'この付近は放置禁止区域に指定された駅の周辺です。',
      zone: z,
      station: st,
      distanceToStationM: st ? hitB.d : undefined,
      exitDistanceM: exit?.distanceM,
      boundaryPoint: exit?.point,
      evidence: [zoneEvidence(z)],
      upcoming,
      changes,
      today,
    });
  }

  // ---- STEP 4: 区域外 / 判定不能 ----------------------------------------
  if (!inTokyo(point)) {
    return finish({
      level: 'unknown',
      confidence: 'low',
      headline: 'この付近は判定できません',
      detail: 'Ring が対応しているのは東京都内です。都外のデータは持っていません。',
      evidence: [
        {
          label: '東京都都民安全総合対策本部「駅別放置自転車の状況（令和7年度）」',
          url: 'https://www.tomin-anzen.metro.tokyo.lg.jp/kotsu/jitensha/houchi/0000001962',
          verifiedAt: '2026-08-23',
        },
      ],
      upcoming,
      changes,
      today,
    });
  }

  const nearest = pickNearer(nearestA, nearestB);
  const nearestStation = findNearestStation(point, stations);

  return finish({
    level: 'outside',
    confidence: nearest && nearest.d < 400 ? 'medium' : 'low',
    headline: '撤去対象区域ではありません',
    detail: OUTSIDE_CAVEAT,
    zone: nearest?.zone,
    distanceToBoundaryM: nearest?.d,
    boundaryPoint: nearest?.pt,
    station: nearestStation?.station,
    distanceToStationM: nearestStation?.d,
    evidence: nearest
      ? [zoneEvidence(nearest.zone)]
      : [
          {
            label: '東京都都民安全総合対策本部「駅別放置自転車の状況（令和7年度）」',
            url: 'https://www.tomin-anzen.metro.tokyo.lg.jp/kotsu/jitensha/houchi/0000001962',
            verifiedAt: '2026-08-23',
            accuracy: 'estimated',
          },
        ],
    upcoming,
    changes,
    today,
  });
}

function pickNearer(
  a: { zone: Zone; d: number; pt: LngLat } | null,
  b: { zone: Zone; d: number; pt: LngLat } | null,
): { zone: Zone; d: number; pt: LngLat } | null {
  if (!a) return b;
  if (!b) return a;
  return a.d <= b.d ? a : b;
}

function findNearestStation(
  point: LngLat,
  stations: Station[],
): { station: Station; d: number } | undefined {
  let best: { station: Station; d: number } | undefined;
  for (const s of stations) {
    // 粗い矩形で先に落とす（931 件に対して毎回 Haversine を回さない）
    if (Math.abs(s.lon - point[0]) > 0.03 || Math.abs(s.lat - point[1]) > 0.025) continue;
    const d = distanceM(point, [s.lon, s.lat]);
    if (!best || d < best.d) best = { station: s, d };
  }
  return best;
}

/** 仕上げ：区域変更の紐付けと、evidence が空でないことの保証 */
function finish(
  v: Omit<Verdict, 'evidence'> & {
    evidence: Evidence[];
    changes: ZoneChange[];
    today: string;
  },
): Verdict {
  const { changes, today, ...rest } = v;
  const verdict: Verdict = { ...rest };

  if (!verdict.upcoming) {
    const c = findRelevantChange(verdict.station, verdict.zone, changes, today);
    if (c && verdict.zone) verdict.upcoming = { change: c, zone: verdict.zone };
    else if (c) verdict.relatedChange = c;
  }

  // evidence が空の Verdict を返さない（DECISIONS D-07）
  if (verdict.evidence.length === 0) {
    verdict.evidence = [
      {
        label: 'Ring のデータ出典一覧',
        url: 'https://github.com/yuu0428/ring/blob/main/docs/DATA.md',
        verifiedAt: '2026-08-23',
      },
    ];
  }
  return verdict;
}
