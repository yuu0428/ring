/**
 * 撤去自転車保管所データの生成（spec.md 5.2.4 / FR-5）
 *
 * 「撤去されたあと、どこへ、何時に、何を持って行けばいいか」を答えるためのデータ。
 * 開所時間は原文が「月曜日～土曜日／第2・第4日曜日」のような日本語なので、
 * 機械判定用の open_rule は手作業で構造化したものだけが持つ（DECISIONS D-11）。
 * open_rule が無い保管所では「今日は開いているか」を表示しない。推測は害になる。
 */
import type { Impound, ImpoundCollection, ImpoundProps, OpenRule } from '../../src/core/types.js';
import {
  VERIFIED_AT,
  fetchBytes,
  log,
  makeMeta,
  normalizeStationName,
  parseCsv,
  toNumber,
  toText,
  validCoord,
  writeJson,
} from './lib.js';
import { SOURCES } from './sources.js';

/** 返還時に必要なものは、どの区でもほぼ共通（区のページで確認済みの共通項） */
const COMMON_REQUIRED_ITEMS = ['自転車の鍵', '本人確認ができるもの（運転免許証・保険証など）', '返還手数料'];

/**
 * 開所時間の構造化。
 * 原文の日本語から機械的に導けないため、確認できたものだけをここに書く。
 * ここに無い保管所は open_rule = null となり「今日開いているか」は表示されない。
 */
const OPEN_RULES: Record<string, OpenRule> = {
  // 大田区：11時〜19時、祝日・振替休日・年末年始休み
  '大田区:default': {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start: '11:00',
    end: '19:00',
    closed_holidays: true,
    closed_ranges: ['12-29..01-03'],
  },
  // 中野区：月〜土＋第2・第4日曜、正午〜午後8時
  '中野区:default': {
    weekdays: [1, 2, 3, 4, 5, 6],
    nth_sunday: [2, 4],
    start: '12:00',
    end: '20:00',
    closed_holidays: true,
    closed_ranges: ['12-29..01-03'],
  },
};

/** 「大森駅、北千束駅、…」のような文字列から駅名の配列を作る */
function splitStations(text: string | null): string[] {
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(/[、,・／/]/)
        .map((s) => normalizeStationName(s.replace(/周辺$/, '')))
        .filter((s) => s.length > 0 && s.length < 20),
    ),
  ];
}

export async function buildImpounds(): Promise<Impound[]> {
  log.step('撤去自転車保管所データを生成');
  const out: Impound[] = [];
  const seen = new Set<string>();

  // ---- 大田区（DS-10）: 撤去駅と保管所の対応が入っている貴重なデータ ----
  {
    const src = SOURCES['DS-10'];
    const buf = await fetchBytes(src.url, { ext: '.csv' });
    if (buf) {
      const rows = parseCsv(buf);
      rows.forEach((r, i) => {
        const lat = toNumber(r['緯度１'] ?? r['緯度']);
        const lon = toNumber(r['経度１'] ?? r['経度']);
        const name = toText(r['名称']);
        if (!validCoord(lon, lat) || !name) return;
        const key = `大田区:${name}`;
        if (seen.has(key)) return;
        seen.add(key);

        const props: ImpoundProps = {
          id: `im-ota-${i}`,
          name,
          municipality: '大田区',
          address: toText(r['所在地']),
          tel: toText(r['連絡先']),
          open_days: toText(r['休業日']) ? `休業日: ${toText(r['休業日'])}` : '毎日',
          open_hours: toText(r['営業時間']) ?? '不明',
          open_rule: OPEN_RULES['大田区:default'],
          closed_days: toText(r['休業日']),
          covered_stations: splitStations(toText(r['撤去駅（区域内撤去）'])),
          covered_area_text:
            toText(r['撤去エリア（区域外撤去）']) ?? toText(r['撤去駅（区域内撤去）']),
          capacity: toNumber(r['収容台数']),
          fee_bicycle: '3,000円（区の案内で最新額を確認してください）',
          fee_moped: '5,000円（区の案内で最新額を確認してください）',
          required_items: COMMON_REQUIRED_ITEMS,
          source_name: `${src.provider}「${src.name}」`,
          source_url: src.page_url ?? src.url,
          verified_at: toText(r['最終確認日']) ?? VERIFIED_AT,
        };
        out.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number((lon as number).toFixed(6)), Number((lat as number).toFixed(6))],
          },
          properties: props,
        });
      });
      log.ok(`大田区 ${out.length} 件`);
    } else {
      log.warn('大田区の保管所データを取得できませんでした');
    }
  }

  // ---- 中野区（DS-11）: 撤去区域と保管所の対応 ----
  {
    const src = SOURCES['DS-11'];
    const before = out.length;
    const buf = await fetchBytes(src.url, { ext: '.csv' });
    if (buf) {
      const rows = parseCsv(buf);
      rows.forEach((r, i) => {
        const lat = toNumber(r['緯度']);
        const lon = toNumber(r['経度']);
        const name = toText(r['名称']);
        if (!validCoord(lon, lat) || !name) return;
        const key = `中野区:${name}`;
        if (seen.has(key)) return; // 同じ保管所が重複して入っている行がある
        seen.add(key);

        const props: ImpoundProps = {
          id: `im-nakano-${i}`,
          name,
          municipality: '中野区',
          address: toText(r['所在地']),
          tel: toText(r['連絡先']),
          open_days: toText(r['開所日']) ?? '不明',
          open_hours: toText(r['開所日時']) ?? '不明',
          open_rule: OPEN_RULES['中野区:default'],
          closed_days: null,
          covered_stations: splitStations(toText(r['撤去区域'])),
          covered_area_text: toText(r['撤去区域']),
          capacity: null,
          fee_bicycle: '区の案内で確認してください',
          fee_moped: '区の案内で確認してください',
          required_items: COMMON_REQUIRED_ITEMS,
          source_name: `${src.provider}「${src.name}」`,
          source_url: src.page_url ?? src.url,
          verified_at: VERIFIED_AT,
        };
        out.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number((lon as number).toFixed(6)), Number((lat as number).toFixed(6))],
          },
          properties: props,
        });
      });
      log.ok(`中野区 ${out.length - before} 件`);
    } else {
      log.warn('中野区の保管所データを取得できませんでした');
    }
  }

  log.info(`保管所 合計 ${out.length} 件（対応駅が判明している保管所 ${out.filter((f) => f.properties.covered_stations.length > 0).length} 件）`);
  return out;
}

export async function writeImpounds(impounds: Impound[]): Promise<void> {
  const fc: ImpoundCollection = {
    type: 'FeatureCollection',
    meta: makeMeta('scripts/etl/impounds.ts'),
    features: impounds,
  };
  await writeJson('impounds.geojson', fc);
}
