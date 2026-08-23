import { chromium } from 'playwright';
const URL = 'https://ring-submission.pages.dev/';
const b = await chromium.launch();
const errs: string[] = [];
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)); });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(2500);
const r = await p.evaluate(() => ({
  imgs: document.images.length,
  broken: Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).length,
  slides: document.querySelectorAll('.slide-thumb').length,
  shots: document.querySelectorAll('.shot-card').length,
  qa: document.querySelectorAll('dl.qa dt').length,
  dataRows: document.querySelectorAll('#submission table tr').length - 1,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  video: !!document.querySelector('#video iframe'),
}));
console.log('デスクトップ:', JSON.stringify(r));
await p.evaluate(() => document.getElementById('slides')?.scrollIntoView());
await p.waitForTimeout(1200);
await p.screenshot({ path: 'docs/site-slides.png' });
await p.evaluate(() => document.getElementById('submission')?.scrollIntoView());
await p.waitForTimeout(1200);
await p.screenshot({ path: 'docs/site-qa.png' });

const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
await m.goto(URL, { waitUntil: 'networkidle' });
await m.waitForTimeout(1500);
const mo = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('スマホ幅の横あふれ:', mo);
await m.screenshot({ path: 'docs/site-mobile.png' });
console.log('コンソールエラー:', errs.length ? errs.slice(0, 3) : 'なし');
await b.close();
