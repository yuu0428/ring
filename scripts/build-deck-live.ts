/**
 * docs/deck-live.src.html → docs/ring-deck-live.pdf ＋ docs/live-slides/*.jpg
 *
 * First Stage の2分収録で画面共有するスライド。提出済みの ring-deck.pdf とは別物で、
 * 話しながら見せることに絞ってある（1枚1メッセージ・QRコード常設・左右比較）。
 * 主張と数字は提出物と一致させる（scripts/check-claims.ts が照合する）。
 *
 * 使い方: npx tsx scripts/build-deck-live.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SRC = 'docs/deck-live.src.html';
const OUT = 'docs/ring-deck-live.pdf';
const SLIDES = 'docs/live-slides';
const W = 1600;
const H = 900;

/** PNG を縮めて JPEG の data URI にする */
function dataUri(png: string, height: number, quality: number): string | null {
  if (!existsSync(png)) { console.warn(`  ! ${png} がありません`); return null; }
  const tmp = mkdtempSync(join(tmpdir(), 'ring-live-'));
  const jpg = join(tmp, 'x.jpg');
  execFileSync('sips', ['-Z', String(height), '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(quality), png, '--out', jpg], { stdio: 'ignore' });
  return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`;
}

function embed(html: string): string {
  // QR は白背景を潰さないよう PNG のまま入れる
  const qr = readFileSync('docs/live-shots/qr.png').toString('base64');
  html = html.replaceAll('{{QR}}', `data:image/png;base64,${qr}`);

  for (const [token, dir, h] of [['LIVE', 'docs/live-shots', 1200], ['IMG', 'docs/screenshots', 1000]] as const) {
    const names = [...new Set([...html.matchAll(new RegExp(`\\{\\{${token}:([\\w-]+)\\}\\}`, 'g'))].map((m) => m[1]))];
    for (const name of names) {
      const uri = dataUri(join(dir, `${name}.png`), h, 84);
      if (!uri) continue;
      html = html.replaceAll(`{{${token}:${name}}}`, uri);
      console.log(`  ✓ ${name}`);
    }
  }
  return html;
}

async function main(): Promise<void> {
  console.log('\n▸ 2分プレゼン用スライドを書き出します');
  const html = embed(readFileSync(SRC, 'utf8'));
  const tmpHtml = join(mkdtempSync(join(tmpdir(), 'ring-live-html-')), 'deck.html');
  writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  // PowerPoint に貼るので 2 倍解像度で描く（1600×900 だと録画時に少し眠くなる）
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // 下端からはみ出しているスライドを検出する（本番で切れるのを防ぐ）
  const overflow = await page.evaluate((h) =>
    Array.from(document.querySelectorAll('.slide')).map((el, i) => {
      const s = el as HTMLElement;
      return { n: i + 1, over: Math.max(0, s.scrollHeight - h) };
    }).filter((x) => x.over > 2), H);
  if (overflow.length) {
    console.log('\n  ⚠ はみ出しているスライド:', overflow.map((o) => `${o.n}枚目 +${o.over}px`).join(' / '));
  } else {
    console.log('\n  ✓ 全12枚、はみ出しなし');
  }

  await page.pdf({ path: OUT, width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '1-12' });

  // 1枚ずつ JPEG にも書き出す（リハーサル用）
  mkdirSync(SLIDES, { recursive: true });
  const slides = page.locator('.slide');
  const n = await slides.count();
  for (let i = 0; i < n; i++) {
    await slides.nth(i).screenshot({ path: join(SLIDES, `${String(i + 1).padStart(2, '0')}.jpg`), quality: 86, type: 'jpeg' });
  }
  await browser.close();
  console.log(`\n✓ ${OUT}（${n} 枚）`);
  console.log(`✓ ${SLIDES}/ に 1 枚ずつの画像`);
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
