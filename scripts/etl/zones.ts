/**
 * 放置禁止区域データの生成（spec.md 5.2.1 / 3.3）
 *
 * ■ 前提となる事実（2026-08-23 調査）
 *   放置禁止区域のポリゴンは、東京都オープンデータカタログに 1 件も存在しない。
 *   千代田区・文京区・港区の公式ページを確認したところ、区域は「駅ごとの地図画像」
 *   としてのみ公開されており、町丁目や街路名による文章記述も、条例別表もない。
 *   （唯一カタログに登録されていた杉並区のデータは URL が 404）
 *
 * ■ したがって Ring は 2 階層で持つ
 *   Tier A … 公式区域図から作図したポリゴン。精度 traced / described。
 *             現時点では入手可能な作図元が無く 0 件。data/manual/zones-traced.geojson に
 *             追加されれば自動的に取り込まれる。
 *   Tier B … 東京都「駅別放置自転車の状況」の指定フラグ＋駅座標から生成する推定リング。
 *             精度 estimated。全都 702 駅を網羅する。
 *
 * ■ Tier B の半径モデル（重要：これは推定であり実測ではない）
 *   区域の広がりは駅の自転車利用規模と相関する（大きな駅ほど広い）。
 *   都 Excel から得られる乗入台数（放置台数＋実収容台数）を用いて
 *       r = clamp(BASE + K * sqrt(乗入台数), MIN, MAX)
 *   とする。各区の区域図がおおむね駅から 120〜400m の範囲を指定していることに合わせた。
 *   固定半径にしないのは、秋葉原と小さな駅を同じ円で塗るのが実態から遠いため。
 */
import circle from '@turf/circle';
import type {
  Station,
  Zone,
  ZoneChange,
  ZoneChangeFile,
  ZoneCollection,
  ZoneProps,
} from '../../src/core/types.js';
import { VERIFIED_AT, log, makeMeta, readManualJson, writeJson } from './lib.js';
import { SOURCES } from './sources.js';

// --- Tier B 半径モデルの係数（spec.md 6.4／変更時は docs/DECISIONS.md に記録すること）---
const RING_MIN_M = 120;
const RING_MAX_M = 400;
const RING_BASE_M = 100;
const RING_K = 3.0;

export function ringRadiusM(station: Station): number {
  const inflow = (station.counts?.total ?? 0) + (station.capacity?.total ?? 0);
  const r = RING_BASE_M + RING_K * Math.sqrt(Math.max(0, inflow));
  return Math.round(Math.min(RING_MAX_M, Math.max(RING_MIN_M, r)));
}

interface WardLink {
  municipality: string;
  zone_map_url: string | null;
  zone_map_title: string | null;
  impound_url: string | null;
  areas: string[];
}

interface ManualChange {
  id: string;
  municipality: string;
  title: string;
  kind: ZoneChange['kind'];
  effective_from: string;
  affected_stations: string[];
  summary: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  verified_at: string;
}

export async function buildZones(
  stations: Station[],
): Promise<{ zones: Zone[]; changes: ZoneChange[]; wardLinks: WardLink[] }> {
  log.step('放置禁止区域を生成（Tier A / Tier B）');

  const wardFile = await readManualJson<{ wards: WardLink[] }>('ward-links.json', { wards: [] });
  const wardLinks = wardFile.wards ?? [];
  const wardByName = new Map(wardLinks.map((w) => [w.municipality, w]));

  // ---------------------------------------------------------------------
  // Tier A: 作図済みポリゴン（あれば取り込む）
  // ---------------------------------------------------------------------
  const traced = await readManualJson<{ features?: Zone[] }>('zones-traced.geojson', {
    features: [],
  });
  const tierA: Zone[] = (traced.features ?? []).map((f) => ({
    ...f,
    properties: { ...f.properties, tier: 'A' as const },
  }));
  if (tierA.length > 0) log.ok(`Tier A（作図ポリゴン）${tierA.length} 件`);
  else
    log.warn(
      'Tier A は 0 件です。各区が区域を画像でしか公開していないため作図元が無く、現在は Tier B のみで判定します',
    );

  // Tier A が覆う駅は Tier B の対象から外す（DECISIONS D-05）
  const coveredByA = new Set(tierA.flatMap((z) => z.properties.stations));

  // ---------------------------------------------------------------------
  // Tier B: 駅指定リング
  // ---------------------------------------------------------------------
  const src = SOURCES['DS-1'];
  const tierB: Zone[] = [];

  for (const st of stations) {
    if (st.designated !== true) continue;
    if (coveredByA.has(st.name)) continue;

    const radius = ringRadiusM(st);
    const ward = st.municipality ? wardByName.get(st.municipality) : undefined;

    const geom = circle([st.lon, st.lat], radius, { steps: 48, units: 'meters' });
    const props: ZoneProps = {
      id: `zone-b-${st.id}`,
      tier: 'B',
      name: `${st.display_name}周辺（推定）`,
      municipality: st.municipality ?? '東京都内',
      stations: [st.name],
      status: 'active',
      effective_from: '2025-04-01',
      effective_to: null,
      accuracy: 'estimated',
      source_name: `${src.provider}「${src.name}」`,
      source_url: ward?.zone_map_url ?? src.page_url ?? src.url,
      source_format: '都Excelの指定フラグ（＊印）＋駅座標から生成',
      verified_at: VERIFIED_AT,
      radius_m: radius,
      notes: ward?.zone_map_url
        ? `正確な境界は${st.municipality}の区域図で確認できます`
        : '正確な境界は現地の標識で確認してください',
    };
    tierB.push({ type: 'Feature', geometry: geom.geometry, properties: props });
  }

  const radii = tierB.map((z) => z.properties.radius_m ?? 0);
  log.ok(
    `Tier B（駅指定リング）${tierB.length} 件 / 半径 ${Math.min(...radii)}〜${Math.max(...radii)}m（中央値 ${
      radii.sort((a, b) => a - b)[Math.floor(radii.length / 2)]
    }m）`,
  );

  // ---------------------------------------------------------------------
  // 区域変更（FR-4）：予定分は planned 区域としても持つ
  // ---------------------------------------------------------------------
  const changeFile = await readManualJson<{ changes: ManualChange[] }>('zone-changes.json', {
    changes: [],
  });
  const stationByName = new Map(stations.map((s) => [s.name, s]));
  const changes: ZoneChange[] = [];
  const planned: Zone[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const c of changeFile.changes ?? []) {
    const zoneIds: string[] = [];

    // 施行前の変更のみ planned 区域を作る（施行済みは既に Tier B に含まれる）
    if (c.effective_from > today && (c.kind === 'expand' || c.kind === 'new')) {
      for (const name of c.affected_stations) {
        const st = stationByName.get(name);
        if (!st) {
          log.warn(`区域変更 ${c.id}: 駅「${name}」が駅マスタに見つかりません`);
          continue;
        }
        // 拡大後の想定範囲は、現行リングより一回り大きい円として表す（推定）
        const radius = Math.min(RING_MAX_M + 120, ringRadiusM(st) + 120);
        const id = `zone-p-${c.id}-${st.id}`;
        zoneIds.push(id);
        planned.push({
          type: 'Feature',
          geometry: circle([st.lon, st.lat], radius, { steps: 48, units: 'meters' }).geometry,
          properties: {
            id,
            tier: 'B',
            name: c.title,
            municipality: c.municipality,
            stations: [st.name],
            status: 'planned',
            effective_from: c.effective_from,
            effective_to: null,
            accuracy: 'estimated',
            source_name: c.source_name,
            source_url: c.source_url,
            source_format: '区の告知（範囲は推定）',
            verified_at: c.verified_at,
            radius_m: radius,
            notes: c.summary,
          },
        });
      }
    }

    changes.push({
      id: c.id,
      municipality: c.municipality,
      title: c.title,
      kind: c.kind,
      effective_from: c.effective_from,
      affected_stations: c.affected_stations,
      summary: c.summary,
      zone_ids: zoneIds,
      source_name: c.source_name,
      source_url: c.source_url,
      published_at: c.published_at,
      verified_at: c.verified_at,
    });
  }

  if (planned.length > 0) log.ok(`施行前の区域変更 ${planned.length} 件を planned 区域として追加`);
  log.info(`区域変更の記録 ${changes.length} 件`);

  return { zones: [...tierA, ...tierB, ...planned], changes, wardLinks };
}

export async function writeZones(zones: Zone[], changes: ZoneChange[]): Promise<void> {
  const fc: ZoneCollection = {
    type: 'FeatureCollection',
    meta: makeMeta('scripts/etl/zones.ts'),
    features: zones,
  };
  await writeJson('zones.geojson', fc);

  const cf: ZoneChangeFile = { meta: makeMeta('scripts/etl/zones.ts'), changes };
  await writeJson('zone-changes.json', cf);
}
