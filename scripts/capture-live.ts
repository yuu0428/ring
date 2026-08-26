/**
 * 2分プレゼン用スライドに載せる画面キャプチャを撮る。
 * 判定パネルを開いた状態で、数値まで読める形で残す。
 *
 * 使い方: npx tsx scripts/capture-live.ts [URL]
 */
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

const URL = process.argv[2] ?? 'https://ring-5oq.pages.dev';
const OUT = 'docs/live-shots';
const V = { width: 420, height: 900 };
const TOKYO = { longitude: 139.7671, latitude: 35.6812 };
/** 中野駅。駐輪場27件・保管所4件があり、代替の案内まで実演できる */
const NAKANO = { longitude: 139.665705, latitude: 35.705771 };

async function open(page: Page, times = 2): Promise<void> {
  const grip = page.locator('.grip').first();
  await grip.focus();
  for (let i = 0; i < times; i++) { await grip.press('ArrowUp'); await page.waitForTimeout(260); }
}
const shot = (p: Page, n: string) => p.screenshot({ path: `${OUT}/${n}.png` });

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: V, deviceScaleFactor: 3, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    isMobile: true, hasTouch: true, geolocation: TOKYO, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  // ① 東京駅前：撤去対象
  await open(page, 1);
  await page.waitForTimeout(700);
  console.log('  ①', (await page.locator('.headline').first().textContent())?.trim(),
              '|', (await page.locator('.metrics').first().textContent())?.trim().slice(0, 40));
  await shot(page, 'a-tokyo');

  // ② 西へ約400m：対象外になる
  const cx = V.width / 2, cy = 240;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - i * 26, cy);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  console.log('  ②', (await page.locator('.headline').first().textContent())?.trim(),
              '|', (await page.locator('.metrics').first().textContent())?.trim().slice(0, 40));
  await shot(page, 'b-out');

  // ③ 中野駅：駐輪場も保管所も持っている区。ここで代替の案内を見せる
  await ctx.setGeolocation(NAKANO);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  await open(page, 2);
  await page.waitForTimeout(900);
  await shot(page, 'c-full');
  // 下までスクロールして代替と出典
  const sheet = page.locator('.panel-body, .sheet, .panel').first();
  await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.42; }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, 'd-parking');
  await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.78; }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, 'e-impound');
  await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, 'f-sources');

  await b.close();
  console.log(`\n✓ ${OUT}/ に保存しました`);
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
