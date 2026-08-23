/**
 * docs/deck.src.html → docs/ring-deck.pdf
 *
 * 応募フォームに添付するプレゼン資料。1600×900（16:9）で PDF 化する。
 * スクリーンショットは data URI として埋め込むので、PDF は完全に自己完結する。
 *
 * 使い方: npx tsx scripts/build-deck.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SRC = 'docs/deck.src.html';
const OUT = 'docs/ring-deck.pdf';
const SHOTS = 'docs/screenshots';
const W = 1600;
const H = 900;

function embedImages(html: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'ring-deck-'));
  const names = [...new Set([...html.matchAll(/\{\{IMG:([\w-]+)\}\}/g)].map((m) => m[1]))];
  for (const name of names) {
    const png = join(SHOTS, `${name}.png`);
    if (!existsSync(png)) {
      console.warn(`  ! ${png} がありません`);
      continue;
    }
    const jpg = join(tmp, `${name}.jpg`);
    execFileSync(
      'sips',
      ['-Z', '900', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', jpg],
      { stdio: 'ignore' },
    );
    const b64 = readFileSync(jpg).toString('base64');
    html = html.replaceAll(`{{IMG:${name}}}`, `data:image/jpeg;base64,${b64}`);
    console.log(`  ✓ ${name} を埋め込み`);
  }
  return html;
}

async function main(): Promise<void> {
  console.log('\n▸ プレゼン資料を PDF にします');
  const html = embedImages(readFileSync(SRC, 'utf8'));

  const tmpHtml = join(mkdtempSync(join(tmpdir(), 'ring-deck-html-')), 'deck.html');
  writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  // フォントの適用が終わってから印刷する
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.pdf({
    path: OUT,
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    pageRanges: '1-',
  });

  // 表紙画像（応募フォームの画面キャプチャ用にも使える）
  await page.screenshot({ path: 'docs/deck-cover.png', clip: { x: 0, y: 0, width: W, height: H } });

  await browser.close();

  const kb = (readFileSync(OUT).length / 1024).toFixed(0);
  const slides = (html.match(/class="slide/g) ?? []).length;
  console.log(`\n✓ ${OUT}（${slides} 枚 / ${kb}KB）`);
  console.log(`✓ docs/deck-cover.png\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
