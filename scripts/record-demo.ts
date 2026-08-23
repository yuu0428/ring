/**
 * デモ操作の録画。
 * 実際のアプリをスマホ幅の実ブラウザで操作し、その様子を動画として記録する。
 * 出力: video/public/demo.webm（Remotion がこれを読み込んで動画に仕上げる）
 *
 * 使い方: npx tsx scripts/record-demo.ts [URL]
 *
 * 各場面の開始フレームを video/public/demo-cues.json に書き出すので、
 * Remotion 側は「何秒で何が起きるか」を推測せずに字幕を合わせられる。
 */
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const URL = process.argv[2] ?? 'https://yuu0428.github.io/ring/';
const OUT_DIR = 'video/public';
const SIZE = { width: 390, height: 844 };
/** 東京駅（放置禁止区域の指定あり） */
const START = { longitude: 139.7671, latitude: 35.6812 };

interface Cue {
  /** 録画開始からの経過ミリ秒 */
  atMs: number;
  title: string;
  body: string;
}

const cues: Cue[] = [];
let t0 = 0;

function cue(title: string, body: string): void {
  cues.push({ atMs: Date.now() - t0, title, body });
  console.log(`  ${(((Date.now() - t0) / 1000)).toFixed(1)}s  ${title}`);
}

/** ゆっくり地図をドラッグする（早すぎると何をしたか伝わらない） */
async function slowDrag(page: Page, dx: number, dy: number, steps = 40): Promise<void> {
  const cx = SIZE.width / 2;
  const cy = 300;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    isMobile: true,
    hasTouch: true,
    geolocation: START,
    permissions: ['geolocation'],
    recordVideo: { dir: OUT_DIR, size: SIZE },
  });
  const page = await ctx.newPage();

  console.log(`\n▸ ${URL} のデモを録画します\n`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sheet .headline', { timeout: 30_000 });
  // 地図タイルが出そろってから計測を始める
  await page.waitForTimeout(5000);
  t0 = Date.now();

  // ---- 1. 起動：いまいる場所の判定が最初から出ている ----
  cue('開いた瞬間に、答えが出ている', '東京駅。放置禁止区域に指定された駅の周辺です。');
  await page.waitForTimeout(3200);

  // ---- 2. 輪の存在 ----
  cue('赤い輪が、放置禁止区域', '駅を囲む輪。この内側に停めると、警告のうえ即日撤去されます。');
  await page.waitForTimeout(3000);

  // ---- 3. 境界へ近づく → 判定が変わる ----
  cue('地図を動かすと、判定が追いかけてくる', '中央の十字が判定点。指を動かすだけで境界の位置が分かります。');
  await slowDrag(page, -150, -70);
  await page.waitForTimeout(1600);
  await slowDrag(page, -130, -60);
  await page.waitForTimeout(2600);

  // ---- 4. 区域の外 ----
  cue('輪の外に出ると、色が変わる', '「撤去対象ではありません」。境界までの距離も出ます。');
  await page.waitForTimeout(2800);

  // ---- 5. カードを引き上げる：代替と根拠 ----
  cue('停めるな、で終わらせない', '近くの駐輪場、撤去された場合の保管所、そして判定の根拠。');
  const grip = page.locator('.grip').first();
  await grip.press('ArrowUp');
  await page.waitForTimeout(2600);
  await page.mouse.move(SIZE.width / 2, 640);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 90);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(2400);

  // ---- 6. 根拠の開示 ----
  cue('すべての判定に、出典を添える', '出典・最終確認日・データの精度。根拠を示せないものは表示しません。');
  await grip.press('ArrowUp');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 110);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(2600);
  await grip.press('ArrowDown');
  await grip.press('ArrowDown');
  await page.waitForTimeout(900);

  // ---- 7. 検索：どこでも調べられる ----
  cue('行く前に、調べておける', '駅名で検索。通信を使わず、端末の中のデータだけで探します。');
  await page.locator('button[aria-label="場所をさがす"]').click();
  await page.waitForSelector('.searchbox');
  await page.waitForTimeout(600);
  // press() は日本語文字を扱えないため、1 文字ずつ値を積んで入力を再現する
  for (const ch of '渋谷') {
    await page.locator('.searchbox').type(ch, { delay: 0 });
    await page.waitForTimeout(340);
  }
  await page.waitForTimeout(1600);
  await page.locator('.panel-body .row').first().click();
  await page.waitForTimeout(4200);

  // ---- 8. 区域変更のお知らせ ----
  cue('区域は、動く', '渋谷区は原宿・神宮前を2025年10月、渋谷駅周辺を2026年4月に拡大しました。');
  await page.locator('button[aria-label="区域変更のお知らせ"]').click();
  await page.waitForSelector('.panel');
  await page.waitForTimeout(3600);
  await page.mouse.move(SIZE.width / 2, 600);
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(2200);
  await page.locator('button[aria-label="閉じる"]').click();
  await page.waitForTimeout(700);

  // ---- 9. データについて → 公開リクエスト ----
  cue('区域データは、どこにも公開されていない', '東京都のカタログに0件。区は地図を画像でしか出していません。');
  await page.locator('button[aria-label="データについて"]').click();
  await page.waitForSelector('.panel');
  await page.waitForTimeout(1000);
  await page.mouse.move(SIZE.width / 2, 600);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2800);

  cue('だから、公開を頼む機能まで作った', '区あての依頼文面を生成します。送るのは人の行為として残しました。');
  await page.locator('button:has-text("区に、区域データの公開をお願いする")').click();
  await page.waitForSelector('.textarea');
  await page.selectOption('.select', { index: 1 });
  await page.waitForTimeout(1400);
  await page.mouse.move(SIZE.width / 2, 600);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(3400);
  await page.locator('button[aria-label="閉じる"]').click();
  await page.waitForTimeout(2200);

  const totalMs = Date.now() - t0;
  console.log(`\n  録画時間 ${(totalMs / 1000).toFixed(1)} 秒`);

  await ctx.close();
  await browser.close();

  // Playwright は乱数のファイル名で書き出すので、決まった名前に直す
  const files = await readdir(OUT_DIR);
  const webm = files.filter((f) => f.endsWith('.webm') && f !== 'demo.webm');
  if (webm.length === 0) throw new Error('録画ファイルが見つかりません');
  webm.sort();
  await rename(join(OUT_DIR, webm[webm.length - 1]), join(OUT_DIR, 'demo.webm'));

  await writeFile(
    join(OUT_DIR, 'demo-cues.json'),
    JSON.stringify({ totalMs, cues }, null, 2) + '\n',
    'utf8',
  );

  console.log(`✓ ${OUT_DIR}/demo.webm`);
  console.log(`✓ ${OUT_DIR}/demo-cues.json（${cues.length} 場面）\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
