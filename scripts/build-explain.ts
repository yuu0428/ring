/**
 * explain.src.html → explain.html
 *
 * 「単一の HTML ファイル」で完結させるため、スクリーンショットを JPEG に変換して
 * data URI として埋め込む。生成された explain.html は外部ファイルを一切参照しない。
 *
 * 使い方: npx tsx scripts/build-explain.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = 'explain.src.html';
const OUT = 'explain.html';
const SHOTS = 'docs/screenshots';
/** 埋め込む画像の横幅(px)。大きすぎるとファイルが肥大し、小さすぎると読めない */
const WIDTH = 760;
const QUALITY = 68;

function toDataUri(name: string, tmp: string): string {
  const png = join(SHOTS, `${name}.png`);
  if (!existsSync(png)) {
    console.warn(`  ! スクリーンショットがありません: ${png}`);
    return '';
  }
  const jpg = join(tmp, `${name}.jpg`);
  // macOS 標準の sips で縮小と JPEG 変換を行う（追加の依存を増やさない）
  execFileSync('sips', [
    '-Z', String(WIDTH),
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(QUALITY),
    png, '--out', jpg,
  ], { stdio: 'ignore' });
  const b64 = readFileSync(jpg).toString('base64');
  console.log(`  ✓ ${name}  ${(b64.length / 1024).toFixed(0)}KB`);
  return `data:image/jpeg;base64,${b64}`;
}

function main(): void {
  const tmp = mkdtempSync(join(tmpdir(), 'ring-explain-'));
  let html = readFileSync(SRC, 'utf8');

  const names = [...html.matchAll(/\{\{IMG:([\w-]+)\}\}/g)].map((m) => m[1]);
  console.log(`\n▸ ${names.length} 枚のスクリーンショットを埋め込みます`);

  for (const name of [...new Set(names)]) {
    const uri = toDataUri(name, tmp);
    html = html.replaceAll(`{{IMG:${name}}}`, uri);
  }

  writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`\n✓ ${OUT} を生成しました（${kb}KB / 外部ファイル参照なし）\n`);

  if (html.includes('{{IMG:')) {
    console.error('未置換のプレースホルダが残っています');
    process.exit(1);
  }
}

main();
