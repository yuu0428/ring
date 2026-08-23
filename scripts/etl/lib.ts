/**
 * ETL の共通処理：取得・キャッシュ・文字コード変換・出力。
 *
 * 設計方針（DECISIONS D-09）:
 *   公式データの URL は 404・ホスト移転・curl 拒否が頻繁に起きる。
 *   したがって取得結果を .cache/ に保存し、取得できなかった場合はキャッシュで継続する。
 *   出力 JSON は public/data/ にコミットし、ビルド時に外部取得しない。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import { parse as parseCsvSync } from 'csv-parse/sync';
import type { Meta } from '../../src/core/types.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = join(ROOT, '.cache');
export const OUT_DIR = join(ROOT, 'public/data');
export const MANUAL_DIR = join(ROOT, 'data/manual');

export const SPEC_VERSION = '1.0.0';
/** データ取得・確認を行った日。画面に「最終確認日」として出る */
export const VERIFIED_AT = '2026-08-23';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// ログ
// ---------------------------------------------------------------------------

export const log = {
  step: (m: string) => console.log(`\n\x1b[1m▸ ${m}\x1b[0m`),
  ok: (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  warn: (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`),
  fail: (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`),
  info: (m: string) => console.log(`    ${m}`),
};

// ---------------------------------------------------------------------------
// 取得（キャッシュ付き）
// ---------------------------------------------------------------------------

function cachePath(url: string, ext: string): string {
  const h = createHash('sha1').update(url).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${h}${ext}`);
}

/**
 * URL からバイト列を取得する。
 * 成功したらキャッシュに保存し、失敗したらキャッシュを返す。
 * どちらも無ければ null（呼び出し側が「そのデータ無しで続行」を判断する）。
 */
export async function fetchBytes(
  url: string,
  opts: { ext?: string; force?: boolean } = {},
): Promise<Uint8Array | null> {
  const ext = opts.ext ?? '.bin';
  const cp = cachePath(url, ext);

  if (!opts.force && existsSync(cp)) {
    return new Uint8Array(await readFile(cp));
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'ja,en;q=0.9' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());

    // HTML が返ってきた場合はエラーページとみなす（IIS の 404 など）
    const head = Buffer.from(buf.slice(0, 200)).toString('latin1').toLowerCase();
    if (ext !== '.html' && (head.includes('<!doctype html') || head.includes('<html'))) {
      throw new Error('HTML が返された（エラーページの可能性）');
    }

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cp, buf);
    log.ok(`取得 ${url.slice(0, 78)} (${(buf.length / 1024).toFixed(1)}KB)`);
    return buf;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (existsSync(cp)) {
      log.warn(`取得失敗のためキャッシュを使用: ${msg} — ${url.slice(0, 60)}`);
      return new Uint8Array(await readFile(cp));
    }
    log.fail(`取得できず ${msg} — ${url.slice(0, 70)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 文字コード
// ---------------------------------------------------------------------------

/** UTF-8 / UTF-8 BOM / CP932 を自動判別してデコードする */
export function decodeText(buf: Uint8Array): string {
  const b = Buffer.from(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
  const utf8 = b.toString('utf8');
  // U+FFFD が現れたら UTF-8 ではない
  if (!utf8.includes('�')) return utf8;
  return iconv.decode(b, 'cp932');
}

/** CSV を「ヘッダ名 → 値」のレコード配列にする。空行は捨てる */
export function parseCsv(buf: Uint8Array): Record<string, string>[] {
  const text = decodeText(buf);
  const rows = parseCsvSync(text, {
    columns: (header: string[]) =>
      header.map((h, i) => {
        const name = (h ?? '').replace(/\s/g, '').trim();
        return name === '' ? `_col${i}` : name;
      }),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[];
  return rows.filter((r) => Object.values(r).some((v) => (v ?? '').trim() !== ''));
}

// ---------------------------------------------------------------------------
// 値の正規化
// ---------------------------------------------------------------------------

/** 全角・空白・記号を吸収して数値にする。取れなければ null */
export function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s台㎡]/g, '');
  if (s === '' || s === '-' || s === '－' || s === '―') return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 空文字・ハイフンのみ・空白のみを null にする */
export function toText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  if (s === '' || s === '-' || s === '－' || s === '―' || s === '−') return null;
  return s;
}

/** 駅名の正規化。突合キーに使う（spec.md 5.2.2） */
export function normalizeStationName(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/駅$/, '')
    .replace(/ケ/g, 'ヶ')
    .replace(/之/g, 'ノ')
    .trim();
}

/** 東京都域の bbox（spec.md 6.4） */
export const TOKYO_BBOX = { minX: 138.9, minY: 35.48, maxX: 139.95, maxY: 35.92 };

export function inTokyo(lon: number, lat: number): boolean {
  return (
    lon > TOKYO_BBOX.minX && lon < TOKYO_BBOX.maxX && lat > TOKYO_BBOX.minY && lat < TOKYO_BBOX.maxY
  );
}

/** 東京付近として妥当な緯度経度かを検査する。異常値はデータ側の誤りとして落とす */
export function validCoord(lon: number | null, lat: number | null): lon is number {
  return (
    lon != null &&
    lat != null &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon > 138.5 &&
    lon < 140.5 &&
    lat > 35.0 &&
    lat < 36.5
  );
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

export function makeMeta(generator: string): Meta {
  return {
    generated_at: new Date().toISOString(),
    generator,
    spec_version: SPEC_VERSION,
    license_note: '出典ごとに properties.source_name / source_url を参照',
  };
}

/** 差分レビューできるよう整形して書き出す（NFR-8） */
export async function writeJson(name: string, data: unknown): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const p = join(OUT_DIR, name);
  await writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const size = (JSON.stringify(data).length / 1024).toFixed(0);
  log.ok(`出力 public/data/${name} (${size}KB)`);
}

export async function readManualJson<T>(name: string, fallback: T): Promise<T> {
  const p = join(MANUAL_DIR, name);
  if (!existsSync(p)) {
    log.warn(`手作業データが見つかりません: data/manual/${name}`);
    return fallback;
  }
  return JSON.parse(await readFile(p, 'utf8')) as T;
}
