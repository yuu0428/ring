/**
 * ETL の入口。`npm run etl` で実行する。
 *
 * 出力（すべて public/data/ にコミットされ、ビルド時に外部取得しない）:
 *   stations.json      駅マスタ（放置禁止区域の指定有無つき）
 *   zones.geojson      放置禁止区域（Tier A / Tier B / planned）
 *   parkings.geojson   駐輪場
 *   impounds.geojson   撤去自転車保管所
 *   zone-changes.json  区域変更の予定
 *   sources.json       出典台帳
 */
import type { Source, SourceFile } from '../../src/core/types.js';
import { VERIFIED_AT, log, makeMeta, writeJson } from './lib.js';
import { SOURCES } from './sources.js';
import { buildStations, writeStations } from './stations.js';
import { buildParkings, writeParkings } from './parkings.js';
import { buildImpounds, writeImpounds } from './impounds.js';
import { buildZones, writeZones } from './zones.js';

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log('\n\x1b[1m━━━ Ring データパイプライン ━━━\x1b[0m');

  const stations = await buildStations();
  await writeStations(stations);

  const { zones, changes, wardLinks } = await buildZones(stations);
  await writeZones(zones, changes);

  const parkings = await buildParkings();
  await writeParkings(parkings);

  const impounds = await buildImpounds();
  await writeImpounds(impounds);

  // --- 出典台帳（FR-8.2 の画面と応募資料の両方がこれを参照する）---
  log.step('出典台帳を生成');
  const counts: Record<string, number> = {
    'DS-1': stations.filter((s) => s.designated !== null).length,
    'DS-2': stations.length,
    'DS-15': zones.filter((z) => z.properties.tier === 'A').length,
  };
  const sources: Source[] = Object.values(SOURCES).map((s) => ({
    id: s.id,
    name: s.name,
    provider: s.provider,
    url: s.url,
    page_url: s.page_url,
    format: s.format,
    license: s.license,
    fetched_at: VERIFIED_AT,
    used_for: s.used_for,
    record_count:
      counts[s.id] ??
      (s.id.startsWith('DS-1') && s.id.length > 5
        ? impounds.filter((i) => i.properties.source_name.includes(s.provider)).length
        : parkings.filter((p) => p.properties.source_name.includes(s.name)).length),
  }));
  const sf: SourceFile = { meta: makeMeta('scripts/etl/index.ts'), sources };
  await writeJson('sources.json', sf);

  // --- 区の区域図リンク（判定に添えて出す導線）---
  await writeJson('ward-links.json', { meta: makeMeta('scripts/etl/index.ts'), wards: wardLinks });

  // --- まとめ ---
  const designated = stations.filter((s) => s.designated === true).length;
  console.log('\n\x1b[1m━━━ 完了 ━━━\x1b[0m');
  console.log(`  駅               ${stations.length} 件（放置禁止区域の指定あり ${designated} 件）`);
  console.log(`  放置禁止区域      ${zones.length} 件（Tier A ${zones.filter((z) => z.properties.tier === 'A').length} / Tier B ${zones.filter((z) => z.properties.tier === 'B' && z.properties.status === 'active').length} / 施行前 ${zones.filter((z) => z.properties.status === 'planned').length}）`);
  console.log(`  駐輪場            ${parkings.length} 件`);
  console.log(`  保管所            ${impounds.length} 件`);
  console.log(`  区域変更の記録    ${changes.length} 件`);
  console.log(`  出典              ${sources.length} 件`);
  console.log(`  所要              ${((Date.now() - t0) / 1000).toFixed(1)} 秒\n`);
}

main().catch((e) => {
  console.error('\n\x1b[31mETL が失敗しました\x1b[0m');
  console.error(e);
  process.exit(1);
});
