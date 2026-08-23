/**
 * 駐輪場データの統合（spec.md 5.2.3）
 *
 * 区ごとに列名も料金表記も全く異なるため、区ごとにアダプタを書いて 1 つの形に寄せる。
 * 料金は原文のまま保持する（DECISIONS D-10）。誤った数値より正確な原文のほうが役に立つ。
 */
import type { Parking, ParkingCollection, ParkingProps } from '../../src/core/types.js';
import {
  VERIFIED_AT,
  fetchBytes,
  log,
  makeMeta,
  parseCsv,
  toNumber,
  toText,
  validCoord,
  writeJson,
} from './lib.js';
import { SOURCES, type SourceDef } from './sources.js';

type Row = Record<string, string>;

interface Adapter {
  sourceId: string;
  municipality: string;
  operator_type: ParkingProps['operator_type'];
  /** 列名の揺れを吸収して 1 件に変換する。座標が取れなければ null を返す */
  map: (r: Row, i: number) => Omit<ParkingProps, keyof SourceFields> & { lon: number; lat: number } | null;
}

type SourceFields = {
  source_name: string;
  source_url: string;
  license: string;
  verified_at: string;
  id: string;
  municipality: string;
  operator_type: ParkingProps['operator_type'];
};

/** 列名の揺れ（空白・全角）を吸収して値を取る */
function pick(r: Row, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function coords(r: Row): { lon: number; lat: number } | null {
  const lat = toNumber(pick(r, '緯度', '緯度１', '公営駐輪場_緯度'));
  const lon = toNumber(pick(r, '経度', '経度１', '公営駐輪場_経度'));
  if (!validCoord(lon, lat)) return null;
  return { lon: lon as number, lat: lat as number };
}

const ADAPTERS: Adapter[] = [
  // 文京区: 名称,位置,緯度,経度,,最寄駅,台数（台）,説明
  {
    sourceId: 'DS-3',
    municipality: '文京区',
    operator_type: 'public',
    map: (r) => {
      const c = coords(r);
      const name = pick(r, '名称');
      if (!c || !name) return null;
      return {
        name,
        address: toText(pick(r, '位置')),
        capacity_bicycle: toNumber(pick(r, '台数（台）', '台数')),
        capacity_moped: null,
        fee_temporary: null,
        fee_monthly: null,
        hours: null,
        note: toText(pick(r, '説明')),
        ...c,
      };
    },
  },

  // 品川区（区営）: 名称（所在地）,定期利用自転車,定期利用バイク,当日利用自転車,当日利用バイク,緯度,経度
  {
    sourceId: 'DS-4a',
    municipality: '品川区',
    operator_type: 'public',
    map: (r) => {
      const c = coords(r);
      const raw = pick(r, '名称（所在地）', '名称');
      if (!c || !raw) return null;
      const m = raw.match(/^(.*?)（(.*)）$/);
      return {
        name: m ? m[1] : raw,
        address: m ? m[2] : null,
        capacity_bicycle:
          (toNumber(pick(r, '定期利用自転車')) ?? 0) + (toNumber(pick(r, '当日利用自転車')) ?? 0) ||
          null,
        capacity_moped:
          (toNumber(pick(r, '定期利用バイク')) ?? 0) + (toNumber(pick(r, '当日利用バイク')) ?? 0) ||
          null,
        fee_temporary: null,
        fee_monthly: null,
        hours: null,
        note: null,
        ...c,
      };
    },
  },

  // 品川区（民間）: 名称,所在地,(種別),定期利用一カ月,一日利用,問い合わせ先,緯度,経度
  {
    sourceId: 'DS-4b',
    municipality: '品川区',
    operator_type: 'private',
    map: (r) => {
      const c = coords(r);
      const name = pick(r, '名称');
      if (!c || !name) return null;
      return {
        name,
        address: toText(pick(r, '所在地')),
        capacity_bicycle: null,
        capacity_moped: null,
        fee_temporary: toText(pick(r, '一日利用')),
        fee_monthly: toText(pick(r, '定期利用一カ月')),
        hours: null,
        note: toText(pick(r, '問い合わせ先')),
        ...c,
      };
    },
  },

  // 目黒区: 標準的な自治体オープンデータ様式。料金・時間が最も詳しい
  {
    sourceId: 'DS-5',
    municipality: '目黒区',
    operator_type: 'public',
    map: (r) => {
      const c = coords(r);
      const name = pick(r, '名称');
      if (!c || !name) return null;
      const start = pick(r, '開始時間');
      const end = pick(r, '終了時間');
      return {
        name,
        address: toText(pick(r, '住所')),
        capacity_bicycle: toNumber(pick(r, '収容台数_自転車')),
        capacity_moped: toNumber(pick(r, '収容台数_一般原動機付自転車', '収容台数_一般原動機')),
        fee_temporary: toText(pick(r, '一時利用料_自転車')),
        fee_monthly: toText(pick(r, '定期利用料_自転車', '定期利用料_地上_自転車')),
        hours: start && end ? `${start}〜${end}` : null,
        note: toText(pick(r, '備考')),
        ...c,
      };
    },
  },

  // 中野区: wagmap 由来。料金・時間の情報が豊富
  {
    sourceId: 'DS-6',
    municipality: '中野区',
    operator_type: 'public',
    map: (r) => {
      const c = coords(r);
      const name = pick(r, '名称');
      if (!c || !name) return null;
      return {
        name,
        address: toText(pick(r, '所在地')),
        capacity_bicycle: toNumber(pick(r, '収容台数')),
        capacity_moped: null,
        fee_temporary: toText(pick(r, '一時利用料_都度')),
        fee_monthly: toText(pick(r, '定期利用料_1ヶ月')),
        hours: toText(pick(r, '入出庫可能時間')),
        note: toText(pick(r, '利用形態')),
        ...c,
      };
    },
  },

  // 中央区: 二輪車駐車場
  {
    sourceId: 'DS-7',
    municipality: '中央区',
    operator_type: 'public',
    map: (r) => {
      const c = coords(r);
      const name = pick(r, '駐車場名', '名称');
      if (!c || !name) return null;
      return {
        name,
        address: toText(pick(r, '所在地')),
        capacity_bicycle: null,
        capacity_moped: null,
        fee_temporary: toText(pick(r, '駐車料金')),
        fee_monthly: toText(pick(r, '定期駐車')),
        hours: toText(pick(r, '利用時間')),
        note: toText(pick(r, '駐車できる二輪車')),
        ...c,
      };
    },
  },
];

export async function buildParkings(): Promise<Parking[]> {
  log.step('駐輪場データを統合');
  const out: Parking[] = [];

  for (const ad of ADAPTERS) {
    const src: SourceDef = SOURCES[ad.sourceId];
    const buf = await fetchBytes(src.url, { ext: '.csv' });
    if (!buf) {
      log.warn(`${src.provider}「${src.name}」を取得できず、このデータは除外します`);
      continue;
    }
    const rows = parseCsv(buf);
    let ok = 0;
    let skipped = 0;

    rows.forEach((r, i) => {
      let mapped: ReturnType<Adapter['map']>;
      try {
        mapped = ad.map(r, i);
      } catch {
        mapped = null;
      }
      if (!mapped) {
        skipped++;
        return;
      }
      const { lon, lat, ...props } = mapped;
      out.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))] },
        properties: {
          id: `pk-${ad.sourceId}-${i}`,
          municipality: ad.municipality,
          operator_type: ad.operator_type,
          source_name: `${src.provider}「${src.name}」`,
          source_url: src.page_url ?? src.url,
          license: src.license,
          verified_at: VERIFIED_AT,
          ...props,
        } as ParkingProps,
      });
      ok++;
    });

    log.ok(`${src.provider} ${ok} 件${skipped > 0 ? `（座標なし等で除外 ${skipped} 件）` : ''}`);
  }

  log.info(`駐輪場 合計 ${out.length} 件`);
  return out;
}

export async function writeParkings(parkings: Parking[]): Promise<void> {
  const fc: ParkingCollection = {
    type: 'FeatureCollection',
    meta: makeMeta('scripts/etl/parkings.ts'),
    features: parkings,
  };
  await writeJson('parkings.geojson', fc);
}
