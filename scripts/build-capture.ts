/**
 * 応募フォームに添付する画面キャプチャを 1 枚にまとめる。
 * 出力: docs/ring-capture.png（1800×1000）
 *
 * 使い方: npx tsx scripts/build-capture.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SHOTS = [
  { name: '01-verdict', caption: '判定：赤い輪が放置禁止区域' },
  { name: '02-evidence', caption: '代替の提示と判定の根拠' },
  { name: '06-changes', caption: '区域変更のお知らせ' },
  { name: '08-request', caption: 'オープンデータの公開リクエスト' },
];

function dataUri(name: string, tmp: string): string {
  const jpg = join(tmp, `${name}.jpg`);
  execFileSync(
    'sips',
    ['-Z', '900', '-s', 'format', 'jpeg', '-s', 'formatOptions', '86',
     join('docs/screenshots', `${name}.png`), '--out', jpg],
    { stdio: 'ignore' },
  );
  return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`;
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'ring-cap-'));
  const cards = SHOTS.map(
    (s) => `<figure>
      <img src="${dataUri(s.name, tmp)}" alt="${s.caption}">
      <figcaption>${s.caption}</figcaption>
    </figure>`,
  ).join('');

  const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1800px;height:1000px;background:#0E1116;color:#F2F5F8;
  font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
  padding:46px 60px;position:relative;overflow:hidden;
  -webkit-print-color-adjust:exact}
body::before{content:"";position:absolute;inset:0;
  background:radial-gradient(1200px 700px at 82% 6%,rgba(255,59,59,.16),transparent 62%)}
header{position:relative;display:flex;align-items:center;gap:18px;margin-bottom:8px}
.logo{font-size:30px;font-weight:800;letter-spacing:.24em}
.tag{font-size:25px;font-weight:800;color:#B9C2CD}
.sub{position:relative;font-size:19px;color:#7D8794;margin-bottom:30px}
.row{position:relative;display:flex;gap:34px;justify-content:center;align-items:flex-start}
figure{width:312px}
figure img{width:100%;border-radius:22px;border:1px solid rgba(255,255,255,.2);
  box-shadow:0 26px 60px rgba(0,0,0,.6);display:block}
figcaption{font-size:17px;color:#B9C2CD;margin-top:14px;text-align:center}
</style></head><body>
<header>
  <svg width="34" height="34" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="#FF3B3B" stroke-width="2.6"/>
    <circle cx="12" cy="12" r="2.1" fill="#FF3B3B"/>
  </svg>
  <span class="logo">RING</span>
  <span class="tag">駅を囲む、見えない輪。</span>
</header>
<div class="sub">自転車を停める前に、その場所に停めたら撤去されるのかを教えるブラウザアプリ　／　東京都のオープンデータを使用　／　yuu0428.github.io/ring</div>
<div class="row">${cards}</div>
</body></html>`;

  const p = join(tmp, 'cap.html');
  writeFileSync(p, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`file://${p}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/ring-capture.png' });
  await browser.close();

  console.log('✓ docs/ring-capture.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
