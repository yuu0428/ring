/**
 * 駅マスタの生成（spec.md 5.2.2）
 *
 * DS-1「駅別放置自転車の状況（令和7年度）」× DS-2「国土数値情報 N02 鉄道データ」
 *
 * DS-1 の意義:
 *   放置禁止区域のポリゴンは東京都オープンデータカタログに存在しない（2026-08-23 確認）。
 *   しかしこの Excel には駅ごとに「＊＝放置禁止区域に指定」のフラグが入っており、
 *   これが全都を網羅する唯一の公式・機械可読な指定情報である。
 *   Ring の全都カバーはこのデータに立脚している。
 */
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import type { Station, StationFile } from '../../src/core/types.js';
import {
  VERIFIED_AT,
  decodeText,
  fetchBytes,
  inTokyo,
  log,
  makeMeta,
  normalizeStationName,
  readManualJson,
  toNumber,
  writeJson,
} from './lib.js';
import { SOURCES } from './sources.js';

interface N02Station {
  name: string;
  lon: number;
  lat: number;
  lines: Set<string>;
  operators: Set<string>;
}

/** DS-1 の 1 行 */
interface HouchiRow {
  municipality: string;
  designated: boolean;
  label: string;
  names: string[];
  counts: { bicycle: number; moped: number; small_moped: number; motorcycle: number; total: number };
  capacity: { bicycle: number; moped: number; total: number };
}

// ---------------------------------------------------------------------------
// DS-2: 国土数値情報から東京都域の駅を抽出する
// ---------------------------------------------------------------------------

async function loadN02Stations(): Promise<Map<string, N02Station>> {
  const buf = await fetchBytes(SOURCES['DS-2'].url, { ext: '.zip' });
  if (!buf) throw new Error('国土数値情報 N02 を取得できませんでした');

  const files = unzipSync(buf, {
    filter: (f) => f.name.endsWith('UTF-8/N02-24_Station.geojson'),
  });
  const entry = Object.values(files)[0];
  if (!entry) throw new Error('N02 の駅 GeoJSON が zip 内に見つかりません');

  const gj = JSON.parse(decodeText(entry)) as {
    features: {
      geometry: { type: string; coordinates: number[][] | number[][][] };
      properties: Record<string, string>;
    }[];
  };

  const map = new Map<string, N02Station>();
  for (const f of gj.features) {
    // 駅はプラットフォームの線分として格納されている。重心を駅位置とする
    const raw = f.geometry.coordinates as unknown as number[][];
    const pts: number[][] =
      f.geometry.type === 'LineString' ? raw : (raw as unknown as number[][][]).flat();
    if (pts.length === 0) continue;
    const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (!inTokyo(lon, lat)) continue;

    const name = f.properties['N02_005'];
    if (!name) continue;
    const key = normalizeStationName(name);
    const prev = map.get(key);
    if (prev) {
      // 同名の別路線。座標を平均して 1 駅に集約する
      const n = prev.lines.size + 1;
      prev.lon = (prev.lon * (n - 1) + lon) / n;
      prev.lat = (prev.lat * (n - 1) + lat) / n;
      if (f.properties['N02_003']) prev.lines.add(f.properties['N02_003']);
      if (f.properties['N02_004']) prev.operators.add(f.properties['N02_004']);
    } else {
      map.set(key, {
        name,
        lon,
        lat,
        lines: new Set(f.properties['N02_003'] ? [f.properties['N02_003']] : []),
        operators: new Set(f.properties['N02_004'] ? [f.properties['N02_004']] : []),
      });
    }
  }
  log.ok(`国土数値情報から東京都域の駅 ${map.size} 件を抽出`);
  return map;
}

// ---------------------------------------------------------------------------
// DS-1: 東京都の Excel を読む
// ---------------------------------------------------------------------------

async function loadHouchiRows(): Promise<HouchiRow[]> {
  const buf = await fetchBytes(SOURCES['DS-1'].url, { ext: '.xlsx' });
  if (!buf) throw new Error('東京都「駅別放置自転車の状況」を取得できませんでした');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buf) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel にシートがありません');

  const rows: HouchiRow[] = [];
  let currentMunicipality = '';

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 5) return; // 1〜5 行目は見出しと総数

    const cell = (i: number): string => {
      const v = row.getCell(i).value;
      if (v == null) return '';
      if (typeof v === 'object' && 'richText' in v) {
        return (v.richText as { text: string }[]).map((t) => t.text).join('');
      }
      if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
      return String(v);
    };

    const colA = cell(1).replace(/\s/g, '');
    const label = cell(3).replace(/\s/g, '');

    // この Excel は印刷ページごとに見出し行を繰り返す（実測 28 回）。
    // 見出しを駅名として拾うと自治体の対応まで崩れるため、最優先で弾く。
    if (/駅名|放置禁止区域に指定|放置台数|実収容台数|収容能力|乗入台数/.test(colA + label)) return;

    // 注記行。この Excel は印刷ページごとに注記も繰り返すため、
    // 恒久フラグを立てず「その行を飛ばして自治体の継続を切る」だけにする。
    if (colA.startsWith('（注') || colA.startsWith('(注') || label.startsWith('（注')) {
      currentMunicipality = '';
      return;
    }

    if (colA) {
      // 「区部計」「市部計」「総数」は集計行
      if (/計$|^総数$/.test(colA)) {
        currentMunicipality = '';
        return;
      }
      // 自治体名は必ず 区/市/町/村 で終わる。それ以外は自治体名ではない
      if (/[区市町村]$/.test(colA)) currentMunicipality = colA;
    }
    if (currentMunicipality === '') return;
    if (!label) return;

    // 台数列がすべて空の行は駅データではない（注記や区切り行）
    if (toNumber(cell(4)) == null && toNumber(cell(8)) == null) return;

    const names = label
      .split(/[、,・]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    rows.push({
      municipality: currentMunicipality,
      designated: cell(2).includes('*') || cell(2).includes('＊'),
      label,
      names,
      counts: {
        bicycle: toNumber(cell(4)) ?? 0,
        moped: toNumber(cell(5)) ?? 0,
        small_moped: toNumber(cell(6)) ?? 0,
        motorcycle: toNumber(cell(7)) ?? 0,
        total: toNumber(cell(8)) ?? 0,
      },
      capacity: {
        bicycle: Math.round(toNumber(cell(12)) ?? 0),
        moped: Math.round(toNumber(cell(13)) ?? 0),
        total: Math.round(toNumber(cell(14)) ?? 0),
      },
    });
  });

  log.ok(`東京都 Excel から ${rows.length} 行を読み取り（指定あり ${rows.filter((r) => r.designated).length} 行）`);
  return rows;
}

// ---------------------------------------------------------------------------
// 結合
// ---------------------------------------------------------------------------

export async function buildStations(): Promise<Station[]> {
  log.step('駅マスタを生成（DS-1 × DS-2）');

  const [n02, houchi, aliasRaw] = await Promise.all([
    loadN02Stations(),
    loadHouchiRows(),
    readManualJson<Record<string, string>>('station-aliases.json', {}),
  ]);

  const aliases = new Map(
    Object.entries(aliasRaw)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => [normalizeStationName(k), normalizeStationName(v)]),
  );

  const source = {
    name: `${SOURCES['DS-1'].provider}「${SOURCES['DS-1'].name}」`,
    url: SOURCES['DS-1'].page_url ?? SOURCES['DS-1'].url,
    fiscal_year: '令和7年度',
    verified_at: VERIFIED_AT,
  };

  const stations = new Map<string, Station>();
  const unmatched: string[] = [];

  // まず N02 の全駅を土台として入れる（都資料に無い駅も地図上には存在する）
  for (const [key, s] of n02) {
    stations.set(key, {
      id: `st-${key}`,
      name: s.name,
      display_name: `${s.name}駅`,
      lon: Number(s.lon.toFixed(6)),
      lat: Number(s.lat.toFixed(6)),
      lines: [...s.lines].sort(),
      operators: [...s.operators].sort(),
      municipality: null,
      designated: null,
      group_label: null,
      counts: null,
      capacity: null,
      source: null,
    });
  }

  // 都資料の情報を重ねる
  for (const row of houchi) {
    // 行の台数はグループ全体の合計なので、駅数で割らずそのまま各駅に付ける。
    // グループであることは group_label で分かるようにする。
    for (const rawName of row.names) {
      const norm = normalizeStationName(rawName);
      const key = aliases.get(norm) ?? norm;
      const st = stations.get(key);
      if (!st) {
        unmatched.push(`${row.municipality}/${rawName}`);
        continue;
      }
      // 都の注記にある通り「東京駅」のように複数の区市町村に計上される駅がある。
      // 上書きすると最後の区の値だけが残り、実態より極端に小さい台数になるため合算する。
      const first = st.municipality == null;
      if (first) st.municipality = row.municipality;
      else if (!st.municipality!.includes(row.municipality)) {
        st.municipality = `${st.municipality}・${row.municipality}`;
      }
      // 指定ありを優先する（安全側に倒す）
      st.designated = st.designated === true ? true : row.designated;
      st.group_label = row.names.length > 1 ? row.label : st.group_label;
      st.counts = first
        ? row.counts
        : {
            bicycle: (st.counts?.bicycle ?? 0) + row.counts.bicycle,
            moped: (st.counts?.moped ?? 0) + row.counts.moped,
            small_moped: (st.counts?.small_moped ?? 0) + row.counts.small_moped,
            motorcycle: (st.counts?.motorcycle ?? 0) + row.counts.motorcycle,
            total: (st.counts?.total ?? 0) + row.counts.total,
          };
      st.capacity = first
        ? row.capacity
        : {
            bicycle: (st.capacity?.bicycle ?? 0) + row.capacity.bicycle,
            moped: (st.capacity?.moped ?? 0) + row.capacity.moped,
            total: (st.capacity?.total ?? 0) + row.capacity.total,
          };
      st.source = source;
    }
  }

  const list = [...stations.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const designated = list.filter((s) => s.designated === true).length;
  const known = list.filter((s) => s.designated !== null).length;

  log.info(`駅 ${list.length} 件（うち都資料に該当 ${known} 件 / 放置禁止区域の指定あり ${designated} 件）`);
  if (unmatched.length > 0) {
    log.warn(`未突合 ${unmatched.length} 件: ${unmatched.slice(0, 12).join(', ')}`);
    log.info('→ data/manual/station-aliases.json に別名を追加すると解消します');
  }
  return list;
}

export async function writeStations(stations: Station[]): Promise<void> {
  const file: StationFile = { meta: makeMeta('scripts/etl/stations.ts'), stations };
  await writeJson('stations.json', file);
}
