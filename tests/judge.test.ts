/**
 * 判定エンジンのテスト（spec.md 6.6 の T-1〜T-15）
 *
 * このアプリは「撤去されるか」を答える。誤った判定は利用者に実損害を与えるため、
 * 境界ケースをフィクスチャで固定して守る。実データには依存させない。
 */
import { describe, expect, it } from 'vitest';
import { judge } from '../src/core/judge';
import type { LngLat, RingData, Station, Zone, ZoneChange } from '../src/core/types';

const TODAY = '2026-08-23';

// ---------------------------------------------------------------------------
// フィクスチャ
// ---------------------------------------------------------------------------

/** 経度・緯度を中心に、およそ radiusM の正方形ポリゴンを作る（テスト用の素朴な作図） */
function squareZone(
  center: LngLat,
  halfSideM: number,
  props: Partial<Zone['properties']> = {},
): Zone {
  const dy = halfSideM / 111_320;
  const dx = halfSideM / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  const [x, y] = center;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x - dx, y - dy],
          [x + dx, y - dy],
          [x + dx, y + dy],
          [x - dx, y + dy],
          [x - dx, y - dy],
        ],
      ],
    },
    properties: {
      id: 'zone-test',
      tier: 'A',
      name: 'テスト区域',
      municipality: 'テスト区',
      stations: ['テスト'],
      status: 'active',
      effective_from: '2020-01-01',
      effective_to: null,
      accuracy: 'traced',
      source_name: 'テスト出典',
      source_url: 'https://example.com',
      source_format: 'テスト',
      verified_at: TODAY,
      ...props,
    },
  };
}

/** 中心に穴のあるドーナツ状の区域（T-15 用） */
function donutZone(center: LngLat, outerM: number, innerM: number): Zone {
  const ring = (m: number): number[][] => {
    const dy = m / 111_320;
    const dx = m / (111_320 * Math.cos((center[1] * Math.PI) / 180));
    const [x, y] = center;
    return [
      [x - dx, y - dy],
      [x + dx, y - dy],
      [x + dx, y + dy],
      [x - dx, y + dy],
      [x - dx, y - dy],
    ];
  };
  const z = squareZone(center, outerM, { id: 'zone-donut' });
  (z.geometry as { coordinates: number[][][] }).coordinates = [ring(outerM), ring(innerM)];
  return z;
}

function station(name: string, lonlat: LngLat, designated: boolean | null): Station {
  return {
    id: `st-${name}`,
    name,
    display_name: `${name}駅`,
    lon: lonlat[0],
    lat: lonlat[1],
    lines: ['テスト線'],
    operators: ['テスト鉄道'],
    municipality: 'テスト区',
    designated,
    group_label: null,
    counts: { bicycle: 100, moped: 5, small_moped: 0, motorcycle: 2, total: 107 },
    capacity: { bicycle: 500, moped: 20, total: 520 },
    source: { name: 'テスト出典', url: 'https://example.com', verified_at: TODAY },
  };
}

/** 駅を中心とした Tier B リング */
function ringZone(st: Station, radiusM: number, extra: Partial<Zone['properties']> = {}): Zone {
  const pts: number[][] = [];
  const dy = radiusM / 111_320;
  const dx = radiusM / (111_320 * Math.cos((st.lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    pts.push([st.lon + dx * Math.cos(t), st.lat + dy * Math.sin(t)]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [pts] },
    properties: {
      id: `zone-b-${st.id}`,
      tier: 'B',
      name: `${st.display_name}周辺（推定）`,
      municipality: 'テスト区',
      stations: [st.name],
      status: 'active',
      effective_from: '2020-01-01',
      effective_to: null,
      accuracy: 'estimated',
      source_name: '東京都テスト出典',
      source_url: 'https://example.com',
      source_format: '推定',
      verified_at: TODAY,
      radius_m: radiusM,
      ...extra,
    },
  };
}

function makeData(partial: Partial<RingData>): RingData {
  return {
    zones: [],
    stations: [],
    parkings: [],
    impounds: [],
    changes: [],
    sources: [],
    ...partial,
  };
}

/** 中心から東へ meters 動かした点 */
function eastOf(p: LngLat, meters: number): LngLat {
  return [p[0] + meters / (111_320 * Math.cos((p[1] * Math.PI) / 180)), p[1]];
}

const CENTER: LngLat = [139.7, 35.68];
const OPTS = { today: TODAY };

// ---------------------------------------------------------------------------
// T-1 〜 T-15
// ---------------------------------------------------------------------------

describe('判定エンジン', () => {
  it('T-1: ポリゴン中心の点は inside', () => {
    const z = squareZone(CENTER, 100);
    const v = judge(CENTER, makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('inside');
    expect(v.confidence).toBe('high');
    expect(v.zone?.properties.id).toBe('zone-test');
  });

  it('T-2: 境界の 1m 外は near で、境界までの距離がおよそ 1m', () => {
    const z = squareZone(CENTER, 100);
    const v = judge(eastOf(CENTER, 101), makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('near');
    expect(v.distanceToBoundaryM).toBeGreaterThan(0);
    expect(v.distanceToBoundaryM).toBeLessThan(3);
    expect(v.boundaryPoint).toBeDefined();
  });

  it('T-3: 境界の 29m 外は near', () => {
    const z = squareZone(CENTER, 100);
    const v = judge(eastOf(CENTER, 129), makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('near');
  });

  it('T-4: 境界の 31m 外（他に区域なし）は outside', () => {
    const z = squareZone(CENTER, 100);
    const v = judge(eastOf(CENTER, 131), makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('outside');
    expect(v.detail).toContain('通行を妨げる');
  });

  it('T-5: Tier A が覆う駅では、区域外の点を Tier B の推定で塗り潰さない', () => {
    const st = station('テスト', CENTER, true);
    const a = squareZone(CENTER, 100, { stations: ['テスト'] });
    const b = ringZone(st, 300);
    // 区域 A の外（150m）だが、リング B の内側（300m）にある点
    const p = eastOf(CENTER, 150);
    const v = judge(p, makeData({ zones: [a, b], stations: [st] }), OPTS);
    expect(v.level).toBe('outside');
    expect(v.level).not.toBe('likely');
  });

  it('T-6: Tier A の無い指定駅から 150m は likely（確度 low）', () => {
    const st = station('テスト', CENTER, true);
    const b = ringZone(st, 200);
    const v = judge(eastOf(CENTER, 150), makeData({ zones: [b], stations: [st] }), OPTS);
    expect(v.level).toBe('likely');
    expect(v.confidence).toBe('low');
    expect(v.station?.name).toBe('テスト');
  });

  it('T-7: Tier A の無い指定駅から 250m（リング外）は outside', () => {
    const st = station('テスト', CENTER, true);
    const b = ringZone(st, 200);
    const v = judge(eastOf(CENTER, 250), makeData({ zones: [b], stations: [st] }), OPTS);
    expect(v.level).toBe('outside');
  });

  it('T-8: 指定の無い駅の近くは outside', () => {
    const st = station('テスト', CENTER, false);
    const v = judge(eastOf(CENTER, 50), makeData({ zones: [], stations: [st] }), OPTS);
    expect(v.level).toBe('outside');
  });

  it('T-9: 東京都域外は unknown', () => {
    const v = judge([139.62, 35.46], makeData({}), OPTS); // 横浜あたり
    expect(v.level).toBe('unknown');
    expect(v.detail).toContain('東京都内');
  });

  it('T-10: 施行前の区域内なら、現在は outside でも upcoming が付く', () => {
    const planned = squareZone(CENTER, 100, {
      id: 'zone-planned',
      status: 'planned',
      effective_from: '2027-04-01',
    });
    const change: ZoneChange = {
      id: 'chg-1',
      municipality: 'テスト区',
      title: 'テスト区域を拡大',
      kind: 'expand',
      effective_from: '2027-04-01',
      affected_stations: ['テスト'],
      summary: 'テスト',
      zone_ids: ['zone-planned'],
      source_name: 'テスト',
      source_url: 'https://example.com',
      published_at: null,
      verified_at: TODAY,
    };
    const v = judge(CENTER, makeData({ zones: [planned], changes: [change] }), OPTS);
    expect(v.level).toBe('outside');
    expect(v.upcoming).toBeDefined();
    expect(v.upcoming?.change?.effective_from).toBe('2027-04-01');
  });

  it('T-11: effective_from が未来の active 区域は無視する', () => {
    const z = squareZone(CENTER, 100, { effective_from: '2099-01-01' });
    const v = judge(CENTER, makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('outside');
  });

  it('T-12: effective_to を過ぎた区域は無視する', () => {
    const z = squareZone(CENTER, 100, { effective_to: '2020-01-01' });
    const v = judge(CENTER, makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('outside');
  });

  it('T-13: 区域データが空でも例外を投げない', () => {
    expect(() => judge(CENTER, makeData({}), OPTS)).not.toThrow();
    const v = judge(CENTER, makeData({}), OPTS);
    expect(['outside', 'unknown']).toContain(v.level);
  });

  it('T-14: すべての判定に出典が付く', () => {
    const st = station('テスト', CENTER, true);
    const cases: LngLat[] = [
      CENTER,
      eastOf(CENTER, 101),
      eastOf(CENTER, 131),
      eastOf(CENTER, 5000),
      [139.62, 35.46],
    ];
    const data = makeData({ zones: [squareZone(CENTER, 100), ringZone(st, 200)], stations: [st] });
    for (const p of cases) {
      const v = judge(p, data, OPTS);
      expect(v.evidence.length, `${v.level} に出典が無い`).toBeGreaterThan(0);
      expect(v.evidence[0].url).toBeTruthy();
      expect(v.evidence[0].verifiedAt).toBeTruthy();
    }
  });

  it('T-15: ポリゴンの穴の中は inside にならない', () => {
    const z = donutZone(CENTER, 200, 80);
    const v = judge(CENTER, makeData({ zones: [z] }), OPTS);
    expect(v.level).not.toBe('inside');
  });
});

describe('判定の付随情報', () => {
  it('inside のときは区域外までの距離が出る（10m 戻れば安全、と言えるように）', () => {
    const z = squareZone(CENTER, 100);
    const v = judge(eastOf(CENTER, 90), makeData({ zones: [z] }), OPTS);
    expect(v.level).toBe('inside');
    expect(v.exitDistanceM).toBeGreaterThan(0);
    expect(v.exitDistanceM).toBeLessThan(20);
  });

  it('最近施行された区域変更が relatedChange として付く', () => {
    const st = station('テスト', CENTER, true);
    const change: ZoneChange = {
      id: 'chg-recent',
      municipality: 'テスト区',
      title: '最近拡大した',
      kind: 'expand',
      effective_from: '2026-04-01',
      affected_stations: ['テスト'],
      summary: 'テスト',
      zone_ids: [],
      source_name: 'テスト',
      source_url: 'https://example.com',
      published_at: null,
      verified_at: TODAY,
    };
    const v = judge(eastOf(CENTER, 150), makeData({ zones: [ringZone(st, 200)], stations: [st], changes: [change] }), OPTS);
    expect(v.level).toBe('likely');
    expect(v.upcoming?.change?.id ?? v.relatedChange?.id).toBe('chg-recent');
  });

  it('Tier B の判定は必ず「推定」の精度で出る（事実として断定しない）', () => {
    const st = station('テスト', CENTER, true);
    const v = judge(CENTER, makeData({ zones: [ringZone(st, 200)], stations: [st] }), OPTS);
    expect(v.level).toBe('likely');
    expect(v.evidence[0].accuracy).toBe('estimated');
  });
});
