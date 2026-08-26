/**
 * 推定リングの妥当性と、社会的な効果の見積り
 *
 * 推定は「推定」と表示するのが最低限だが、それだけでは
 * 「その推定はどれくらい当たっているのか」に答えられない。
 * ここでは判定に使っていない独立のデータ（駐輪場の実座標）を突き合わせ、
 * 推定リングが現実とどれだけ噛み合っているかを数値で出す。
 *
 * 使い方: npx tsx scripts/analyze-model.ts
 * 出力  : docs/model-validation.md
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Pt { lon: number; lat: number }
interface Station { id: string; name: string; lon: number; lat: number; municipality: string; designated?: boolean; counts?: { total?: number }; capacity?: { total?: number } }
interface Zone { properties: { id: string; municipality: string; stations: string[] }; geometry: { coordinates: number[][][] } }
interface Parking { properties: { id: string; municipality: string }; geometry: { coordinates: number[] } }

const R = 6378137;
function distM(a: Pt, b: Pt): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lon - a.lon) * Math.PI) / 180;
  const lat = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  return Math.hypot(dLng * Math.cos(lat), dLat) * R;
}

const stations = (JSON.parse(readFileSync('public/data/stations.json', 'utf-8')) as { stations: Station[] }).stations;
const zones = (JSON.parse(readFileSync('public/data/zones.geojson', 'utf-8')) as { features: Zone[] }).features;
const parkings = (JSON.parse(readFileSync('public/data/parkings.geojson', 'utf-8')) as { features: Parking[] }).features;

// --- 1. リング半径の実測（生成物から読み取る）------------------------------
const byStation = new Map(stations.map((s) => [s.name, s]));
const radii: { zone: string; r: number; municipality: string; center: Pt }[] = [];
for (const z of zones) {
  const st = byStation.get(z.properties.stations[0]);
  if (!st) continue;
  const c: Pt = { lon: st.lon, lat: st.lat };
  const ring = z.geometry.coordinates[0];
  const r = ring.reduce((acc, [lon, lat]) => acc + distM(c, { lon, lat }), 0) / ring.length;
  radii.push({ zone: z.properties.id, r, municipality: z.properties.municipality, center: c });
}
const rs = radii.map((x) => x.r).sort((a, b) => a - b);
const pct = (p: number): number => rs[Math.floor((rs.length - 1) * p)];
const meanR = rs.reduce((a, b) => a + b, 0) / rs.length;

// --- 2. 独立データとの突き合わせ（判定に使っていない駐輪場座標）-------------
// 自治体は放置禁止区域の内側か、すぐ外側に駐輪場を置く。
// 推定リングが的外れなら、駐輪場はリングから大きく離れた位置に散らばるはず。
const wardsWithParking = new Set(parkings.map((p) => p.properties.municipality));
const relevantRings = radii.filter((x) => wardsWithParking.has(x.municipality));
function nearestRing(p: Pt): { d: number; r: number } | null {
  let best: { d: number; r: number } | null = null;
  for (const x of relevantRings) {
    const d = distM(p, x.center);
    if (!best || d < best.d) best = { d, r: x.r };
  }
  return best;
}
let inside = 0, within100 = 0, far = 0;
const gaps: number[] = [];
for (const pk of parkings) {
  const [lon, lat] = pk.geometry.coordinates;
  const n = nearestRing({ lon, lat });
  if (!n) continue;
  const gap = n.d - n.r;      // 正ならリングの外、負ならリングの内側
  gaps.push(gap);
  if (gap <= 0) inside++;
  else if (gap <= 100) within100++;
  else far++;
}
const checked = gaps.length;
const insidePct = (inside / checked) * 100;
const near = inside + within100;

// --- 3. 半径をずらしたときに判定が変わる割合（感度）------------------------
function insideCountAt(delta: number): number {
  return gaps.filter((g) => g + delta <= 0).length;   // 半径を delta 広げる = gap が delta 縮む
}
const sens = [-50, -25, 0, 25, 50].map((d) => ({ d, n: insideCountAt(d), pct: (insideCountAt(d) / checked) * 100 }));

// --- 4. 社会的な効果の見積り（仮定を全部書く）------------------------------
const totalAbandoned = stations.filter((s) => s.designated).reduce((a, s) => a + (s.counts?.total ?? 0), 0);
const FEE = 3000;                       // 返還手数料（区により2,000〜5,000円。低い側に寄せた保守値）
const scenarios = [
  { name: '低', use: 0.01, avoid: 0.3 },
  { name: '中', use: 0.05, avoid: 0.4 },
  { name: '高', use: 0.10, avoid: 0.5 },
];

const f = (n: number, d = 0): string => n.toLocaleString('ja-JP', { maximumFractionDigits: d });
const md = `# 推定リングの妥当性と効果の見積り

自動生成: \`npx tsx scripts/analyze-model.ts\`

推定であることを表示するだけでは「その推定はどれくらい当たっているのか」に答えられない。
判定に一切使っていない独立のデータと突き合わせて、数値で確かめた記録。

## 1. 生成したリングの大きさ

| | 半径 |
|---|---|
| 最小 | ${f(rs[0])} m |
| 25%点 | ${f(pct(0.25))} m |
| 中央値 | ${f(pct(0.5))} m |
| 75%点 | ${f(pct(0.75))} m |
| 最大 | ${f(rs[rs.length - 1])} m |
| 平均 | ${f(meanR)} m |

対象 ${f(radii.length)} 件。半径は \`r = clamp(100 + 3.0×√乗入台数, 120m, 400m)\` で決めている。

## 2. 独立データとの突き合わせ

判定には使っていない **駐輪場 ${f(parkings.length)} 件の実座標**（${[...wardsWithParking].join('・')}／${wardsWithParking.size} 区の公開データ）を使う。
自治体は放置禁止区域の内側かすぐ外側に駐輪場を置く。推定リングが的外れなら、駐輪場はリングから大きく離れて散らばるはずである。

| 位置 | 件数 | 割合 |
|---|---|---|
| リングの内側 | ${f(inside)} | ${f(insidePct, 1)}% |
| リングの外側 100m 以内 | ${f(within100)} | ${f((within100 / checked) * 100, 1)}% |
| それより遠い | ${f(far)} | ${f((far / checked) * 100, 1)}% |

**内側＋100m以内で ${f((near / checked) * 100, 1)}%**（${f(near)}/${f(checked)} 件）。
リングは実際の駐輪場の分布とおおむね重なっており、位置と大きさが極端に外れてはいないことを示す。

これは境界線そのものの正解データではないので、区域の形が正しいことの証明ではない。
「区域がありそうな場所を、実データの裏づけつきで指せている」という範囲の主張にとどめる。

## 3. 半径を変えたときの感度

| 半径の増減 | 内側になる駐輪場 | 割合 |
|---|---|---|
${sens.map((x) => `| ${x.d >= 0 ? '+' : ''}${x.d} m | ${f(x.n)} 件 | ${f(x.pct, 1)}% |`).join('\n')}

半径を ±50m 動かすと内側判定は ${f(Math.abs(sens[4].pct - sens[0].pct), 1)} ポイント動く。
つまり判定は半径の取り方に敏感で、だからアプリは断定せず「推定」と表示し、
境界付近では距離をメートルで示して利用者自身が余裕を取れるようにしている。

## 4. 効果の見積り（仮定を明示したシナリオ）

前提として置いた数字：

- 放置台数 **${f(totalAbandoned)} 台**（放置禁止区域に指定された駅の合計。東京都「駅別放置自転車の状況（令和7年度）」）
  これは**ある調査日の駅前の放置台数**であって年間の撤去台数ではない。混同しない。
- 返還手数料 **${f(FEE)} 円**（区により 2,000〜5,000 円。低い側に寄せた）

| シナリオ | 利用率 | 回避率 | 撤去を避けられる台数 | 金額 |
|---|---|---|---|---|
${scenarios.map((s) => {
  const n = totalAbandoned * s.use * s.avoid;
  return `| ${s.name} | ${f(s.use * 100)}% | ${f(s.avoid * 100)}% | ${f(n)} 台 | ${f(n * FEE)} 円 |`;
}).join('\n')}

「利用率」は放置しようとした人のうち Ring を開いた割合、「回避率」はそのうち実際に停める場所を変えた割合。
どちらも実測値ではなく仮定である。返還にかかる平日昼間の時間は根拠となる調査が見つからなかったため金額換算していない。

## 5. この数値の限界

- 区域の正解ポリゴンが公開されていないため、境界の一致率は測れていない。測れるのは「リングと実データの噛み合い方」まで。
- 駐輪場データがある ${wardsWithParking.size} 区に限った検証で、東京全域の代表性はない。
- 効果の見積りは仮定を置いたシナリオであり、実績ではない。
`;

writeFileSync('docs/model-validation.md', md);
console.log(md.replace(/^#.*$/gm, (m) => `\x1b[1m${m}\x1b[0m`));
console.log('\n\x1b[32m✓ docs/model-validation.md に保存しました\x1b[0m');
