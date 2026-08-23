/**
 * 提出物まとめページを組み立てる。
 *
 *   site/
 *     index.html          … 説明 ＋ スライド ＋ 画面キャプチャ ＋ 応募フォームの全質問と回答
 *     explain.html        … 単一ファイル版の解説（配布用にそのまま置く）
 *     assets/slides/*.jpg … プレゼン資料を1枚ずつ画像化したもの
 *     assets/shots/*.jpg  … 画面キャプチャ
 *     assets/ring-deck.pdf
 *
 * 使い方: npx tsx scripts/build-site.ts
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SITE = 'site';
const SLIDES = join(SITE, 'assets/slides');
const SHOTS = join(SITE, 'assets/shots');
const SRC_SHOTS = 'docs/screenshots';

interface Item { q: string; a: string; link?: string }
interface Section {
  title: string;
  items?: Item[];
  table?: { head: string[]; rows: string[][] };
}
interface Submission {
  _form_url: string;
  _captured_at: string;
  sections: Section[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 画像を縮小して JPEG にする（macOS 標準の sips。追加の依存を増やさない） */
function toJpeg(src: string, dest: string, width: number, quality = 82): void {
  execFileSync(
    'sips',
    ['-Z', String(width), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), src, '--out', dest],
    { stdio: 'ignore' },
  );
}

/** deck.src.html の {{IMG:x}} を data URI に置き換える（build-deck と同じ手順） */
function embedDeckImages(html: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'ring-site-'));
  for (const name of new Set([...html.matchAll(/\{\{IMG:([\w-]+)\}\}/g)].map((m) => m[1]))) {
    const png = join(SRC_SHOTS, `${name}.png`);
    if (!existsSync(png)) continue;
    const jpg = join(tmp, `${name}.jpg`);
    toJpeg(png, jpg, 900, 82);
    html = html.replaceAll(`{{IMG:${name}}}`, `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`);
  }
  return html;
}

async function renderSlides(): Promise<number> {
  console.log('\n▸ プレゼン資料を1枚ずつ画像にします');
  mkdirSync(SLIDES, { recursive: true });

  const html = embedDeckImages(readFileSync('docs/deck.src.html', 'utf8'));
  const tmpHtml = join(mkdtempSync(join(tmpdir(), 'ring-deckhtml-')), 'deck.html');
  writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const count = await page.locator('.slide').count();
  const tmpDir = mkdtempSync(join(tmpdir(), 'ring-slidepng-'));
  for (let i = 0; i < count; i++) {
    const n = String(i + 1).padStart(2, '0');
    const png = join(tmpDir, `${n}.png`);
    await page.locator('.slide').nth(i).screenshot({ path: png });
    toJpeg(png, join(SLIDES, `${n}.jpg`), 1400, 80);
    process.stdout.write(`  ✓ ${n}`);
  }
  console.log('');
  await browser.close();
  return count;
}

function copyShots(): string[] {
  mkdirSync(SHOTS, { recursive: true });
  const names = readdirSync(SRC_SHOTS)
    .filter((f) => f.endsWith('.png'))
    .sort();
  for (const f of names) toJpeg(join(SRC_SHOTS, f), join(SHOTS, f.replace(/\.png$/, '.jpg')), 780, 80);
  console.log(`  ✓ 画面キャプチャ ${names.length} 枚`);
  return names.map((f) => f.replace(/\.png$/, ''));
}

function submissionHtml(sub: Submission): string {
  const parts: string[] = [];
  for (const sec of sub.sections) {
    parts.push(`<h3>${esc(sec.title)}</h3>`);
    if (sec.items) {
      parts.push('<dl class="qa">');
      for (const it of sec.items) {
        const a = it.link
          ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.a)}</a>`
          : esc(it.a);
        parts.push(`<dt>${esc(it.q)}</dt><dd>${a}</dd>`);
      }
      parts.push('</dl>');
    }
    if (sec.table) {
      parts.push('<div class="scroll"><table><tr>');
      for (const h of sec.table.head) parts.push(`<th>${esc(h)}</th>`);
      parts.push('</tr>');
      for (const row of sec.table.rows) {
        parts.push(
          `<tr><td><strong>${esc(row[0])}</strong></td><td><a href="${esc(row[1])}" target="_blank" rel="noopener">${esc(row[1])}</a></td></tr>`,
        );
      }
      parts.push('</table></div>');
    }
  }
  return parts.join('\n');
}

async function main(): Promise<void> {
  mkdirSync(join(SITE, 'assets'), { recursive: true });

  const slideCount = await renderSlides();
  const shots = copyShots();
  copyFileSync('docs/ring-deck.pdf', join(SITE, 'assets/ring-deck.pdf'));
  copyFileSync('explain.html', join(SITE, 'explain.html'));

  const sub = JSON.parse(readFileSync('data/manual/submission.json', 'utf8')) as Submission;

  // 解説（explain）の中身を再利用する。画像は data URI ではなくファイル参照にする
  const src = readFileSync('explain.src.html', 'utf8');
  const style = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  let body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>'));
  body = body.replace(/\{\{IMG:([\w-]+)\}\}/g, 'assets/shots/$1.jpg');
  // まとめページ側で用意する見出しと重複するため、解説のヒーローと目次と結びは落とす
  body = body.slice(body.indexOf('<!-- ============')); // 最初の section から
  body = body.slice(0, body.lastIndexOf('<footer>'));

  const slides = Array.from({ length: slideCount }, (_, i) => String(i + 1).padStart(2, '0'));
  const gallery = slides
    .map(
      (n) =>
        `<a class="slide-thumb" href="assets/slides/${n}.jpg" target="_blank" rel="noopener">
          <img src="assets/slides/${n}.jpg" alt="プレゼン資料 ${n} 枚目" loading="lazy">
          <span>${n}</span>
        </a>`,
    )
    .join('\n');

  const shotCards = shots
    .map(
      (n) =>
        `<a class="shot-card" href="assets/shots/${n}.jpg" target="_blank" rel="noopener">
          <img src="assets/shots/${n}.jpg" alt="${esc(n)}" loading="lazy">
          <span>${esc(n)}</span>
        </a>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ring — 提出物まとめ</title>
<meta name="description" content="都知事杯オープンデータ・ハッカソン2026 提出作品 Ring の説明・プレゼン資料・画面キャプチャ・応募フォームの回答をまとめたページ。">
<style>
${style}

/* ---- まとめページで足したもの ---- */
.hub-hero{position:relative;overflow:hidden;padding:76px 0 56px;
  background:radial-gradient(1100px 520px at 50% -10%,rgba(255,59,59,.20),transparent 62%)}
.hub-hero::after{content:"";position:absolute;left:50%;top:-300px;width:820px;height:820px;
  margin-left:-410px;border-radius:50%;border:1.5px solid rgba(255,59,59,.24);pointer-events:none}
.badge-line{display:inline-block;font-size:12.5px;font-weight:800;letter-spacing:.13em;
  color:var(--fg2);border:1px solid var(--line);border-radius:100px;padding:7px 15px;margin-bottom:20px}
.hub-grid{display:grid;gap:12px;margin-top:26px}
@media(min-width:760px){.hub-grid{grid-template-columns:repeat(2,1fr)}}
.hub-card{display:flex;gap:14px;align-items:flex-start;text-decoration:none;
  background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.hub-card:hover{border-color:var(--line2)}
.hub-card .ico{flex:0 0 auto;width:38px;height:38px;border-radius:10px;background:var(--bg3);
  display:grid;place-items:center;font-size:18px}
.hub-card b{display:block;font-size:15px;margin-bottom:3px}
.hub-card span{font-size:13px;color:var(--fg2);line-height:1.6}

.slides{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(min-width:720px){.slides{grid-template-columns:repeat(3,1fr)}}
.slide-thumb{position:relative;display:block;border-radius:10px;overflow:hidden;
  border:1px solid var(--line);background:#000}
.slide-thumb img{width:100%;display:block}
.slide-thumb span{position:absolute;right:7px;bottom:6px;font-size:11px;font-weight:800;
  color:var(--fg1);background:rgba(0,0,0,.65);padding:2px 7px;border-radius:5px}

.shots-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(min-width:720px){.shots-grid{grid-template-columns:repeat(4,1fr)}}
.shot-card{display:block;text-decoration:none}
.shot-card img{width:100%;border-radius:12px;border:1px solid var(--line);display:block}
.shot-card span{display:block;font-size:11.5px;color:var(--fg2);margin-top:7px;text-align:center;
  word-break:break-all}

.video-wrap{position:relative;padding-top:56.25%;border-radius:var(--r);overflow:hidden;
  border:1px solid var(--line);background:#000}
.video-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}

dl.qa{margin:0 0 26px}
dl.qa dt{font-size:14px;font-weight:800;color:var(--fg);margin:18px 0 6px;
  padding-left:11px;border-left:3px solid var(--danger)}
dl.qa dd{margin:0;font-size:14.5px;line-height:1.9;color:var(--fg1)}
dl.qa dd a{color:#8FC3FF;word-break:break-all}
</style>
</head>
<body>

<header class="hub-hero">
  <div class="wrap">
    <div class="badge-line">都知事杯オープンデータ・ハッカソン2026 ／ 提出作品</div>
    <div class="mark">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="#FF3B3B" stroke-width="2.4"/>
        <circle cx="12" cy="12" r="2" fill="#FF3B3B"/>
      </svg>
      RING
    </div>
    <h1>駅を囲む、<br><em>見えない輪。</em></h1>
    <p class="lead">
      自転車を停める前に、<strong>その場所に停めたら撤去されるのか</strong>を教えるブラウザアプリ。
      このページに、成果物・説明・提出資料・応募フォームの回答をすべてまとめています。
    </p>

    <div class="hub-grid">
      <a class="hub-card" href="https://ring-5oq.pages.dev" target="_blank" rel="noopener">
        <span class="ico">🗺️</span>
        <span><b>アプリを開く</b><span>ring-5oq.pages.dev ／ スマホのブラウザでそのまま動きます</span></span>
      </a>
      <a class="hub-card" href="https://github.com/yuu0428/ring" target="_blank" rel="noopener">
        <span class="ico">📦</span>
        <span><b>ソースコードと仕様書</b><span>github.com/yuu0428/ring ／ spec.md・決定台帳・実装状況</span></span>
      </a>
      <a class="hub-card" href="#slides">
        <span class="ico">📊</span>
        <span><b>プレゼン資料（全${slideCount}枚）</b><span>このページ内で1枚ずつ見られます／PDFもあります</span></span>
      </a>
      <a class="hub-card" href="#submission">
        <span class="ico">📝</span>
        <span><b>応募フォームの回答</b><span>提出した全質問と回答をそのまま掲載</span></span>
      </a>
    </div>
  </div>
</header>

<div class="wrap" style="padding-top:26px">
  <ul class="toc">
    <li><a href="#video">デモ動画</a></li>
    <li><a href="#why">なぜ作ったか</a></li>
    <li><a href="#what">何ができるか</a></li>
    <li><a href="#wall">ぶつかった壁</a></li>
    <li><a href="#how">どう作ったか</a></li>
    <li><a href="#judge">判定のしくみ</a></li>
    <li><a href="#use">使い方</a></li>
    <li><a href="#data">使ったデータ</a></li>
    <li><a href="#slides">プレゼン資料</a></li>
    <li><a href="#shots">画面キャプチャ</a></li>
    <li><a href="#submission">フォームの回答</a></li>
    <li><a href="#honest">できないこと</a></li>
  </ul>
</div>

<section id="video">
  <div class="wrap">
    <p class="kicker">デモ</p>
    <h2>実際に動かしたところ</h2>
    <p>実機（スマートフォン幅）で操作した様子です。音声はありません。</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube.com/embed/JiUnAOXeMrU" title="Ring デモ操作動画"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen loading="lazy"></iframe>
    </div>
  </div>
</section>

${body}

<section id="slides">
  <div class="wrap">
    <p class="kicker">提出資料</p>
    <h2>プレゼン資料（全${slideCount}枚）</h2>
    <p>画像をクリックすると原寸で開きます。
      <a href="assets/ring-deck.pdf" target="_blank" rel="noopener">PDF でまとめて見る</a>（1600×900）。</p>
    <div class="slides">
${gallery}
    </div>
  </div>
</section>

<section id="shots">
  <div class="wrap">
    <p class="kicker">提出資料</p>
    <h2>画面キャプチャ</h2>
    <p>スマートフォン幅（390×844）の実ブラウザで自動操作しながら撮影したものです。
      検証スクリプトが毎回この画像を残します。</p>
    <div class="shots-grid">
${shotCards}
    </div>
  </div>
</section>

<section id="submission">
  <div class="wrap">
    <p class="kicker">応募フォーム</p>
    <h2>提出した内容のすべて</h2>
    <p>
      <a href="${esc(sub._form_url)}" target="_blank" rel="noopener">都知事杯オープンデータ・ハッカソン2026 作品提出フォーム</a>
      に提出した内容です（${esc(sub._captured_at)} 送信済み）。
    </p>
${submissionHtml(sub)}
  </div>
</section>

<footer>
  <div class="wrap">
    <p style="color:var(--fg1);font-size:15px;margin-bottom:18px">
      <strong>Ring</strong> — 駅を囲む、見えない輪。
    </p>
    <p>
      アプリ：<a href="https://ring-5oq.pages.dev">ring-5oq.pages.dev</a><br>
      ソースコードと仕様書：<a href="https://github.com/yuu0428/ring">github.com/yuu0428/ring</a><br>
      解説（単一 HTML ファイル）：<a href="explain.html">explain.html</a><br>
      コード MIT ライセンス ／ 生成した区域データ CC BY 4.0
    </p>
    <p style="margin-top:18px;font-size:12px">
      出典：東京都都民安全総合対策本部「駅別放置自転車の状況（令和7年度）」、国土交通省「国土数値情報（鉄道データ）」、
      文京区・品川区・目黒区・中野区・中央区・大田区の各オープンデータ、国土地理院「地理院タイル」
    </p>
  </div>
</footer>

</body>
</html>
`;

  writeFileSync(join(SITE, 'index.html'), html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`\n✓ ${SITE}/index.html（${kb}KB）`);
  console.log(`✓ スライド ${slideCount} 枚 / 画面キャプチャ ${shots.length} 枚 / explain.html / ring-deck.pdf\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
