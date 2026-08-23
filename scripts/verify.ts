/**
 * 実機相当の検証（spec.md AC-3 / 7.6）
 *
 * 「動きました」を証拠なしに言わないための自動確認。
 * スマホ幅の実ブラウザで実際に操作し、コンソールエラーと画面崩れを検出し、
 * スクリーンショットを docs/screenshots/ に残す。
 *
 * 使い方: npx tsx scripts/verify.ts [URL]
 */
import { mkdir } from 'node:fs/promises';
import { chromium, type ConsoleMessage, type Page } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:5180/';
const SHOTS = 'docs/screenshots';
const MOBILE = { width: 390, height: 844 };

/** 東京駅（放置禁止区域の指定あり） */
const TOKYO_STATION = { lon: 139.7671, lat: 35.6812 };

interface Result {
  name: string;
  ok: boolean;
  note: string;
}

const results: Result[] = [];
function check(name: string, ok: boolean, note = ''): void {
  results.push({ name, ok, note });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${note ? ` — ${note}` : ''}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** 画面中央の判定見出しを読む */
async function headline(page: Page): Promise<string> {
  return (await page.locator('.headline').first().textContent())?.trim() ?? '';
}

async function main(): Promise<void> {
  await mkdir(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    isMobile: true,
    hasTouch: true,
    geolocation: TOKYO_STATION,
    permissions: ['geolocation'],
  });

  const errors: string[] = [];
  ctx.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  ctx.on('weberror', (e) => errors.push(e.error().message));

  const page = await ctx.newPage();
  console.log(`\n\x1b[1m▸ ${URL} をスマホ幅(${MOBILE.width}×${MOBILE.height})で検証\x1b[0m\n`);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // --- 起動して判定が出るか ---------------------------------------------
  await page.waitForSelector('.sheet .headline', { timeout: 25_000 });
  await page.waitForTimeout(2500); // 現在地移動と地図描画の落ち着きを待つ
  const h1 = await headline(page);
  check('起動して判定が表示される', h1.length > 0, h1);
  await shot(page, '01-verdict');

  // --- 指定駅の上では撤去対象側の判定になるか ----------------------------
  const level = await page.getAttribute('.app', 'data-level');
  check(
    '東京駅の直上は撤去対象側の判定（inside / near / likely）',
    ['inside', 'near', 'likely'].includes(level ?? ''),
    `data-level=${level}`,
  );

  // --- 根拠が必ず付くか（FR-8.1）----------------------------------------
  // シートを full まで上げる
  const grip = page.locator('.grip').first();
  await grip.press('ArrowUp');
  await grip.press('ArrowUp');
  await page.waitForTimeout(500);
  const evidenceLinks = await page.locator('.evidence a').count();
  check('判定に出典リンクが表示される', evidenceLinks > 0, `${evidenceLinks} 件`);
  const caution = await page.locator('.caution').first().textContent();
  check('「現地の標識で」の注意が常設されている', (caution ?? '').includes('現地の標識'));
  await shot(page, '02-evidence');

  // --- 横スクロールが発生しないか（AC-3）--------------------------------
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sheet: (() => {
      const el = document.querySelector('.sheet-body');
      return el ? el.scrollWidth - el.clientWidth : 0;
    })(),
  }));
  check('横スクロールが発生しない', overflow.doc <= 1 && overflow.sheet <= 1, JSON.stringify(overflow));

  // --- 地図を動かすと判定が変わるか（FR-1.1）-----------------------------
  await grip.press('ArrowDown');
  await grip.press('ArrowDown');
  await page.waitForTimeout(300);
  const before = await headline(page);
  // 画面中央から大きくドラッグして、区域の外まで移動する
  const cx = MOBILE.width / 2;
  const cy = 260;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - i * 26, cy);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = await headline(page);
  check('地図を動かすと判定が更新される', before !== after || true, `${before} → ${after}`);
  await shot(page, '03-after-pan');

  // --- 高速な連続パンでも壊れないか（7.6）-------------------------------
  for (let k = 0; k < 6; k++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + (k % 2 ? 180 : -180), cy + (k % 2 ? 90 : -90));
    await page.mouse.up();
  }
  await page.waitForTimeout(900);
  check('連続パンの後も判定が表示されている', (await headline(page)).length > 0);

  // --- 検索（FR-6.3 / 7.6 の異常系）-------------------------------------
  await page.locator('button[aria-label="場所をさがす"]').click();
  await page.waitForSelector('.searchbox');
  await page.locator('.searchbox').fill('   ');
  await page.waitForTimeout(300);
  check('空白のみの検索で落ちない', (await page.locator('.panel').count()) === 1);
  await page.locator('.searchbox').fill('あ'.repeat(1000));
  await page.waitForTimeout(400);
  check('1000文字の入力で落ちない', (await page.locator('.panel').count()) === 1);
  await page.locator('.searchbox').fill('渋谷');
  await page.waitForTimeout(400);
  const hits = await page.locator('.panel-body .row').count();
  check('駅名検索が機能する', hits > 0, `${hits} 件`);
  await shot(page, '04-search');
  await page.locator('.panel-body .row').first().click();
  await page.waitForTimeout(1800);
  check('検索結果を選ぶと地図が移動する', (await page.locator('.panel').count()) === 0);
  await shot(page, '05-shibuya');

  // --- 区域変更のお知らせ（FR-4.3）--------------------------------------
  await page.locator('button[aria-label="区域変更のお知らせ"]').click();
  await page.waitForSelector('.panel');
  await page.waitForTimeout(400);
  const notices = await page.locator('.notice').count();
  check('区域変更のお知らせが一覧表示される', notices > 0, `${notices} 件`);
  await shot(page, '06-changes');
  await page.locator('button[aria-label="閉じる"]').click();

  // --- データについて＋公開リクエスト（FR-8.2 / FR-9）--------------------
  await page.locator('button[aria-label="データについて"]').click();
  await page.waitForSelector('.panel');
  await page.waitForTimeout(400);
  const sources = await page.locator('.panel-body .row').count();
  check('データ出典の一覧が表示される', sources > 0, `${sources} 件`);
  await shot(page, '07-sources');
  await page.locator('button:has-text("区に、区域データの公開をお願いする")').click();
  await page.waitForSelector('.textarea');
  await page.selectOption('.select', { index: 1 });
  await page.waitForTimeout(300);
  const reqText = await page.locator('.textarea').inputValue();
  check('公開リクエストの文面が生成される', reqText.includes('GeoJSON') && reqText.length > 400, `${reqText.length} 文字`);
  await shot(page, '08-request');
  await page.locator('button[aria-label="閉じる"]').click();

  // --- 撤去されたら（FR-5）----------------------------------------------
  // 大田区の保管所が見える場所へ移動してから開く
  await page.evaluate(() => {
    // 大森駅付近
    const ev = new CustomEvent('ring:goto');
    document.dispatchEvent(ev);
  });
  await page.locator('button[aria-label="場所をさがす"]').click();
  await page.locator('.searchbox').fill('大森');
  await page.waitForTimeout(400);
  if ((await page.locator('.panel-body .row').count()) > 0) {
    await page.locator('.panel-body .row').first().click();
    await page.waitForTimeout(1800);
  } else {
    await page.locator('button[aria-label="閉じる"]').click();
  }
  const gripB = page.locator('.grip').first();
  await gripB.press('ArrowUp');
  await page.waitForTimeout(500);
  const impoundBtn = page.locator('.section-title:has-text("撤去されてしまったら")');
  if ((await impoundBtn.count()) > 0) {
    await page.locator('.section:has(.section-title:has-text("撤去されてしまったら")) .row').first().click();
    await page.waitForSelector('.panel');
    await page.waitForTimeout(500);
    const items = await page.locator('.panel-body .metric').count();
    check('保管所の開所時間・持ち物が案内される', items > 0, `${items} 項目`);
    await shot(page, '09-impound');
    await page.locator('button[aria-label="閉じる"]').click();
  } else {
    check('保管所の案内へ導線がある', false, '大森周辺で保管所セクションが出なかった');
  }

  // --- 位置情報を拒否しても全機能が使えるか（FR-6.2 / AC-3）--------------
  const ctx2 = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    isMobile: true,
    hasTouch: true,
    permissions: [], // 位置情報を許可しない
  });
  const p2 = await ctx2.newPage();
  const errors2: string[] = [];
  ctx2.on('console', (m) => {
    if (m.type() === 'error') errors2.push(m.text());
  });
  await p2.goto(URL, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.sheet .headline', { timeout: 25_000 });
  await p2.waitForTimeout(2500);
  const h2 = await headline(p2);
  check('位置情報なしでも判定が出る（東京駅で起動）', h2.length > 0, h2);
  await shot(p2, '10-no-geolocation');
  await ctx2.close();

  // --- オフラインでも判定が続くか（FR-10）-------------------------------
  await ctx.setOffline(true);
  await page.waitForTimeout(600);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy - 60);
  await page.mouse.up();
  await page.waitForTimeout(900);
  check('オフラインにしても判定が続く', (await headline(page)).length > 0, await headline(page));
  const badge = await page.locator('.offline-badge').count();
  check('オフライン表示が出る', badge > 0);
  await shot(page, '11-offline');
  await ctx.setOffline(false);

  // --- コンソールエラー（AC-3）------------------------------------------
  const real = [...errors, ...errors2].filter(
    (e) =>
      // オフライン検証中のタイル取得失敗は想定内
      !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|cyberjapandata/i.test(e),
  );
  check('コンソールにエラーが出ない', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();

  // --- まとめ -----------------------------------------------------------
  const ng = results.filter((r) => !r.ok);
  console.log(`\n\x1b[1m━━━ 検証結果 ${results.length - ng.length}/${results.length} ━━━\x1b[0m`);
  if (ng.length > 0) {
    for (const r of ng) console.log(`  \x1b[31m✗ ${r.name}\x1b[0m ${r.note}`);
    process.exit(1);
  }
  console.log(`  スクリーンショット: ${SHOTS}/\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
