/**
 * 主張の照合（数字が資料ごとに食い違っていないかの見張り番）
 *
 * public/data/ の実データから件数を数え直し、資料・提出内容・READMEに書いた
 * 数字と突き合わせる。1 件でも食い違ったら失敗で終わる。
 *
 * 「収録やプレゼンで、資料に書いた数字をそのまま口に出して間違える」を防ぐのが目的。
 *
 * 使い方: npx tsx scripts/check-claims.ts
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

interface Feature { properties?: Record<string, unknown> }
interface Collection { features?: Feature[] }

function load(path: string): Feature[] {
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (Array.isArray(raw)) return raw as Feature[];
  return (raw as Collection).features ?? [];
}

/** 自治体名の入っていそうな項目を総当たりで拾う */
function municipalities(items: Feature[]): string[] {
  const keys = ['municipality', 'ward', 'city', 'owner', '自治体', '区'];
  const set = new Set<string>();
  for (const f of items) {
    const p = f.properties ?? (f as Record<string, unknown>);
    for (const k of keys) {
      const v = p[k as keyof typeof p];
      if (typeof v === 'string' && v.trim()) {
        // 「文京区・品川区」のような連結にも対応する
        for (const one of v.split(/[・,、\/]/)) if (one.trim()) set.add(one.trim());
      }
    }
  }
  return [...set].sort();
}

// --- 実データを数え直す -------------------------------------------------
const zones = load('public/data/zones.geojson');
const parkings = load('public/data/parkings.geojson');
const impounds = load('public/data/impounds.geojson');
// stations.json は { meta, stations: [...] } の形
interface StationFile { stations?: { designated?: boolean; counts?: { total?: number } }[] }
const stationFile: StationFile = existsSync('public/data/stations.json')
  ? (JSON.parse(readFileSync('public/data/stations.json', 'utf-8')) as StationFile)
  : {};
const allStations = stationFile.stations ?? [];
const stationCount = allStations.length;
const designatedCount = allStations.filter((s) => s.designated).length;

const facts = {
  zones: zones.length,
  stations: stationCount,
  parkings: parkings.length,
  parkingWards: municipalities(parkings).length,
  impounds: impounds.length,
  impoundWards: municipalities(impounds).length,
  designatedStations: designatedCount,
  abandonedAtDesignated: allStations.reduce((a, s) => a + (s.designated ? (s.counts?.total ?? 0) : 0), 0),
  tierBZones: zones.filter((f) => f.properties?.tier === 'B').length,
  tierAZones: zones.filter((f) => f.properties?.tier === 'A').length,
};

// 指定駅の数と生成した区域の数は一致していなければならない（1駅1リング）
if (facts.designatedStations !== facts.zones) {
  console.log(`\x1b[31m✗ 指定駅 ${facts.designatedStations} 件に対し区域 ${facts.zones} 件。1駅1リングの前提が崩れています\x1b[0m`);
  process.exitCode = 1;
}

console.log('\x1b[1m▸ 実データから数え直した事実\x1b[0m');
for (const [k, v] of Object.entries(facts)) console.log(`    ${k.padEnd(16)} ${v}`);
console.log(`    駐輪場の区        ${municipalities(parkings).join('・')}`);
console.log(`    保管所の区        ${municipalities(impounds).join('・')}`);

// --- 資料の主張と突き合わせる -------------------------------------------
interface Claim { file: string; label: string; pattern: RegExp; expect: number }
const claims: Claim[] = [
  { file: 'docs/deck.src.html', label: '駐輪場の区数', pattern: /駐輪場（(\d+)区・\d+件）/, expect: facts.parkingWards },
  { file: 'docs/deck.src.html', label: '駐輪場の件数', pattern: /駐輪場（\d+区・(\d+)件）/, expect: facts.parkings },
  { file: 'docs/DATA.md', label: '駐輪場の件数', pattern: /駐輪場（(\d+) 件/, expect: facts.parkings },
  { file: 'docs/DATA.md', label: '駐輪場の区数', pattern: /駐輪場（\d+ 件 \/ (\d+) 区）/, expect: facts.parkingWards },
  { file: 'docs/STATUS.md', label: '駐輪場の件数', pattern: /駐輪場データ \| (\d+) 件/, expect: facts.parkings },
  { file: 'docs/STATUS.md', label: '駐輪場の区数', pattern: /駐輪場データ \| \d+ 件・(\d+) 区/, expect: facts.parkingWards },
  { file: 'explain.src.html', label: '駐輪場の件数', pattern: /(\d+) 件（\d+ 区）にとどまります/, expect: facts.parkings },
  { file: 'explain.src.html', label: '駐輪場の区数', pattern: /\d+ 件（(\d+) 区）にとどまります/, expect: facts.parkingWards },
  { file: 'README.md', label: '駐輪場の件数', pattern: /駐輪場（(\d+)件）/, expect: facts.parkings },
  { file: 'docs/GOAL-COMPLETION.md', label: '区域の件数', pattern: /放置禁止区域 (\d+)/, expect: facts.zones },
  { file: 'docs/GOAL-COMPLETION.md', label: '駐輪場の件数', pattern: /駐輪場 (\d+)/, expect: facts.parkings },
  { file: 'docs/GOAL-COMPLETION.md', label: '保管所の件数', pattern: /保管所 (\d+)/, expect: facts.impounds },
  { file: 'docs/GOAL-COMPLETION.md', label: '駅の件数', pattern: /駅 (\d+)／/, expect: facts.stations },
  { file: 'data/manual/submission.json', label: '区域の件数', pattern: /全都(\d+)駅/, expect: facts.zones },
  // 資料に出す放置台数は、指定駅の合計と一致していなければならない（出所不明の数字を載せない）
  { file: 'docs/deck.src.html', label: '放置台数', pattern: /<b>([\d,]+)台<\/b>/, expect: facts.abandonedAtDesignated },
];

console.log('\n\x1b[1m▸ 資料に書いた数字との照合\x1b[0m');
let bad = 0;
for (const c of claims) {
  if (!existsSync(c.file)) { console.log(`  \x1b[33m-\x1b[0m ${c.file}（無し）`); continue; }
  const text = readFileSync(c.file, 'utf-8');
  const m = c.pattern.exec(text);
  if (!m) { console.log(`  \x1b[33m?\x1b[0m ${c.file} … ${c.label} が見つからない（書き方が変わった可能性）`); bad++; continue; }
  const got = Number(m[1].replace(/,/g, ''));
  const ok = got === c.expect;
  if (!ok) bad++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${c.file} … ${c.label} 記載${got} / 実データ${c.expect}`);
}

// --- GitHub Issue の状態と STATUS.md の集計が一致しているか ---------------
const status = existsSync('docs/STATUS.md') ? readFileSync('docs/STATUS.md', 'utf-8') : '';
// 状態表の行だけを数える（優先度 P0〜P3 の列を持つ行が状態表）
const rows = status.split('\n').filter((l) => l.startsWith('|') && /\/issues\/\d+/.test(l) && /\|\s*P[0-3]\s*\|/.test(l));
const done = rows.filter((l) => l.includes('✅')).length;
const wip = rows.filter((l) => l.includes('🔶')).length;
const todo = rows.filter((l) => l.includes('⬜')).length;
const headerMatch = /全 (\d+) 件： ✅ 完了 (\d+) ／ 🔶 着手中 (\d+) ／ ⬜ 未着手 (\d+)/.exec(status);
console.log('\n\x1b[1m▸ 実装状況表の自己整合\x1b[0m');
console.log(`    表の実数: 全${rows.length} 件 ✅${done} 🔶${wip} ⬜${todo}`);
if (headerMatch) {
  const [, t, d, w, u] = headerMatch.map(Number) as unknown as number[];
  const ok = t === rows.length && d === done && w === wip && u === todo;
  if (!ok) bad++;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} 見出しの集計: 全${t} 件 ✅${d} 🔶${w} ⬜${u}`);
} else { console.log('  \x1b[33m?\x1b[0m 見出しの集計行が見つからない'); bad++; }

writeFileSync('docs/claims.json', JSON.stringify({ facts, checkedAt: process.env.RING_DATE ?? '' }, null, 2) + '\n');

const total = claims.length + (headerMatch ? 1 : 0);
console.log(`\n\x1b[1m━━━ 照合結果 ${total - bad}/${total} 一致 ━━━\x1b[0m`);
if (bad > 0) { console.log('\x1b[31m食い違いがあります。話す前に直してください。\x1b[0m'); process.exit(1); }
console.log('\x1b[32m資料の数字はすべて実データと一致しています。\x1b[0m');
