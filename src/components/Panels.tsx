/**
 * モーダルの各画面（spec.md 7.4）
 *   検索 / 撤去されたら / 区域変更のお知らせ / データについて / 公開リクエスト
 */
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { formatDistance } from '../core/geo';
import { isOpenToday } from '../core/nearby';
import type { LngLat } from '../core/types';

export function Panels(): React.JSX.Element | null {
  const panel = useStore((s) => s.panel);
  const openPanel = useStore((s) => s.openPanel);
  if (!panel) return null;

  const titles: Record<string, string> = {
    search: '場所をさがす',
    impound: '撤去されてしまったら',
    changes: '区域変更のお知らせ',
    sources: 'このアプリのデータについて',
    request: 'オープンデータの公開をお願いする',
  };

  return (
    <div className="overlay" onClick={() => openPanel(null)} role="dialog" aria-modal="true">
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{titles[panel]}</h2>
          <button className="iconbtn" onClick={() => openPanel(null)} aria-label="閉じる">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="panel-body">
          {panel === 'search' && <SearchPanel />}
          {panel === 'impound' && <ImpoundPanel />}
          {panel === 'changes' && <ChangesPanel />}
          {panel === 'sources' && <SourcesPanel />}
          {panel === 'request' && <RequestPanel />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 検索：外部 API を使わず、同梱データだけで探す（DECISIONS D-14）        */
/* ------------------------------------------------------------------ */

function SearchPanel(): React.JSX.Element {
  const data = useStore((s) => s.data);
  const goTo = useStore((s) => s.goTo);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const query = q.normalize('NFKC').trim().replace(/駅$/, '');
    if (!data || query.length === 0) return [];
    // 極端に長い入力でも落ちないよう上限を切る（7.6）
    const needle = query.slice(0, 60);

    const stations = data.stations
      .filter((s) => s.name.includes(needle))
      .slice(0, 12)
      .map((s) => ({
        key: `st:${s.id}`,
        title: s.display_name,
        sub: `${s.municipality ?? '東京都'} ・ ${s.lines.slice(0, 2).join('、')}`,
        tag: s.designated === true ? '放置禁止区域あり' : null,
        pos: [s.lon, s.lat] as LngLat,
      }));

    const parkings = data.parkings
      .filter((p) => p.properties.name.includes(needle))
      .slice(0, 10)
      .map((p) => ({
        key: `pk:${p.properties.id}`,
        title: p.properties.name,
        sub: `駐輪場 ・ ${p.properties.municipality}`,
        tag: null,
        pos: p.geometry.coordinates as LngLat,
      }));

    return [...stations, ...parkings];
  }, [q, data]);

  return (
    <>
      <input
        className="searchbox"
        placeholder="駅名や駐輪場名を入力（例：渋谷）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        enterKeyHint="search"
        aria-label="場所の検索"
      />
      <p className="p" style={{ marginTop: 10, fontSize: 12 }}>
        通信を使わず、アプリの中のデータだけで探します。
      </p>
      {q.trim().length > 0 && results.length === 0 && (
        <div className="empty">「{q.slice(0, 20)}」に一致する場所はありませんでした。</div>
      )}
      {results.map((r) => (
        <button key={r.key} className="row" onClick={() => goTo(r.pos, 17)}>
          <div className="row-main">
            <div className="row-title">{r.title}</div>
            <div className="row-sub">{r.sub}</div>
            {r.tag && (
              <div className="chips">
                <span className="chip" style={{ color: 'var(--c-likely)' }}>
                  {r.tag}
                </span>
              </div>
            )}
          </div>
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 撤去されたら（FR-5）                                                 */
/* ------------------------------------------------------------------ */

function ImpoundPanel(): React.JSX.Element {
  const data = useStore((s) => s.data);
  const verdict = useStore((s) => s.verdict);
  const center = useStore((s) => s.center);
  const goTo = useStore((s) => s.goTo);

  const list = useMemo(() => {
    if (!data) return [];
    const station = verdict?.station;
    return data.impounds
      .map((im) => {
        const [lon, lat] = im.geometry.coordinates as LngLat;
        const dx = (lon - center[0]) * 91_000;
        const dy = (lat - center[1]) * 111_320;
        return {
          im,
          d: Math.hypot(dx, dy),
          covers: station ? im.properties.covered_stations.includes(station.name) : false,
        };
      })
      .sort((a, b) => Number(b.covers) - Number(a.covers) || a.d - b.d);
  }, [data, verdict?.station, center]);

  const wardLinks = data?.wardLinks.filter((w) => w.impound_url) ?? [];

  return (
    <>
      <p className="p">
        撤去された自転車は、区ごとに決められた保管所へ運ばれます。
        どこへ運ばれるかは<b>撤去された場所</b>で決まり、開いている曜日と時間も区ごとに違います。
      </p>

      {list.length === 0 && (
        <div className="empty">保管所のデータをまだ読み込めていません。</div>
      )}

      {list.map(({ im, d, covers }) => {
        const p = im.properties;
        const open = isOpenToday(im);
        return (
          <div key={p.id} className="row" style={{ display: 'block', cursor: 'default' }}>
            <div className="row-title">
              {p.name}
              {covers && (
                <span className="chip" style={{ marginLeft: 6, color: 'var(--c-warn)' }}>
                  この駅の担当
                </span>
              )}
            </div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {p.municipality} {p.address}（約 {formatDistance(d)}）
            </div>
            <dl className="metrics" style={{ marginTop: 8 }}>
              <div className="metric">
                <dt>開いている時間</dt>
                <dd style={{ fontSize: 14 }}>{p.open_hours}</dd>
              </div>
              <div className="metric">
                <dt>開いている日</dt>
                <dd style={{ fontSize: 13, lineHeight: 1.4 }}>{p.open_days}</dd>
              </div>
            </dl>
            <div className="chips" style={{ marginTop: 8 }}>
              {open !== null && (
                <span className="chip" style={{ color: open ? 'var(--c-safe)' : 'var(--c-warn)' }}>
                  {open ? '今日は開いています' : '今日は閉まっています'}
                </span>
              )}
              {p.tel && <span className="chip">☎ {p.tel}</span>}
              {p.capacity != null && <span className="chip">収容 {p.capacity}台</span>}
            </div>

            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--fg-1)' }}>
              <b style={{ color: 'var(--fg-0)' }}>持っていくもの</b>
              <div>{p.required_items.join(' ／ ')}</div>
              {p.fee_bicycle && <div style={{ marginTop: 4 }}>自転車の返還手数料：{p.fee_bicycle}</div>}
            </div>

            {p.covered_area_text && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-2)' }}>
                対応する撤去場所：{p.covered_area_text}
              </div>
            )}

            <button
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() => goTo(im.geometry.coordinates as LngLat, 17)}
            >
              地図で見る
            </button>
            <div className="evidence-meta" style={{ marginTop: 6 }}>
              出典：
              <a href={p.source_url} target="_blank" rel="noopener noreferrer">
                {p.source_name}
              </a>{' '}
              ／ 最終確認 {p.verified_at}
            </div>
          </div>
        );
      })}

      <div className="section">
        <h3 className="section-title">ほかの区で撤去された場合</h3>
        <p className="p" style={{ fontSize: 12.5 }}>
          保管所をオープンデータで公開している区が限られているため、Ring が持っているのは上の区だけです。
          ほかの区は各区のページで確認してください。
        </p>
        {wardLinks.map((w) => (
          <a
            key={w.municipality}
            className="row"
            href={w.impound_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="row-main">
              <div className="row-title">{w.municipality}</div>
              <div className="row-sub">区の撤去・返還のページを開く</div>
            </div>
            <div className="row-dist">→</div>
          </a>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 区域変更のお知らせ（FR-4.3）                                          */
/* ------------------------------------------------------------------ */

function ChangesPanel(): React.JSX.Element {
  const data = useStore((s) => s.data);
  const goTo = useStore((s) => s.goTo);
  const today = new Date().toISOString().slice(0, 10);

  const changes = useMemo(
    () => [...(data?.changes ?? [])].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [data],
  );

  return (
    <>
      <p className="p">
        放置禁止区域は変わります。昨日まで大丈夫だった場所が、今日から撤去対象になることがあります。
        現地の標識では気づけないため、ここにまとめています。
      </p>

      {changes.length === 0 && <div className="empty">記録されている区域変更はありません。</div>}

      {changes.map((c) => {
        const future = c.effective_from > today;
        const st = data?.stations.find((s) => s.name === c.affected_stations[0]);
        return (
          <div key={c.id} className="notice" style={{ marginTop: 0, marginBottom: 10 }}>
            <div className="notice-date">
              {c.effective_from.replace(/-/g, '/')}
              <span style={{ fontSize: 12, marginLeft: 6, fontWeight: 700 }}>
                {future ? 'から' : '施行済み'}
              </span>
            </div>
            <div className="notice-title">
              {c.municipality} ・ {c.title}
            </div>
            <p className="notice-body">{c.summary}</p>
            <div className="chips" style={{ marginTop: 8 }}>
              {c.affected_stations.map((s) => (
                <span key={s} className="chip">
                  {s}駅
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {st && (
                <button className="btn" onClick={() => goTo([st.lon, st.lat], 16)}>
                  地図で見る
                </button>
              )}
              <a className="btn" href={c.source_url} target="_blank" rel="noopener noreferrer">
                区の告知を見る
              </a>
            </div>
          </div>
        );
      })}

      <div className="caution" style={{ marginTop: 20 }}>
        <span aria-hidden="true">ℹ︎</span>
        <span>
          区域変更はオープンデータとして公開されていないため、区の告知を人が確認して記録しています。
          抜けがある可能性があります。
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* データについて（FR-8.2）                                             */
/* ------------------------------------------------------------------ */

function SourcesPanel(): React.JSX.Element {
  const data = useStore((s) => s.data);
  const openPanel = useStore((s) => s.openPanel);
  const sources = data?.sources ?? [];

  const designated = data?.stations.filter((s) => s.designated === true).length ?? 0;

  return (
    <>
      <p className="p">
        Ring はすべて公開されているオープンデータで動いています。
        位置情報はこの端末の中だけで使われ、どこにも送られません。
      </p>

      <dl className="metrics" style={{ marginBottom: 18 }}>
        <div className="metric">
          <dt>放置禁止区域の指定がある駅</dt>
          <dd>
            {designated}
            <small>駅</small>
          </dd>
        </div>
        <div className="metric">
          <dt>駐輪場</dt>
          <dd>
            {data?.parkings.length ?? 0}
            <small>件</small>
          </dd>
        </div>
        <div className="metric">
          <dt>保管所</dt>
          <dd>
            {data?.impounds.length ?? 0}
            <small>件</small>
          </dd>
        </div>
      </dl>

      <div className="section" style={{ marginTop: 0 }}>
        <h3 className="section-title">区域データについて大切なこと</h3>
        <div className="evidence">
          放置禁止区域の<b>正確な形（ポリゴン）は、どこにも公開されていません</b>。
          東京都オープンデータカタログを調べても 1 件も見つからず、各区は区域を地図の画像でしか出していません。
          <br />
          <br />
          そこで Ring は、東京都の資料にある「放置禁止区域に指定」という印と駅の位置から、
          区域を<b>円で推定</b>しています。実際の境界の形とは異なります。
          「推定」と表示されている判定は、この方法によるものです。
        </div>
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => openPanel('request')}>
          区に、区域データの公開をお願いする
        </button>
      </div>

      <div className="section">
        <h3 className="section-title">使っているデータ（{sources.length}件）</h3>
        {sources.map((s) => (
          <a
            key={s.id}
            className="row"
            href={s.page_url ?? s.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="row-main">
              <div className="row-title">{s.name}</div>
              <div className="row-sub">{s.provider}</div>
              <div className="chips">
                <span className="chip">{s.format}</span>
                <span className="chip">{s.license}</span>
                {s.record_count > 0 && <span className="chip">{s.record_count}件</span>}
              </div>
            </div>
            <div className="row-dist">→</div>
          </a>
        ))}
      </div>

      <div className="caution">
        <span aria-hidden="true">⚠︎</span>
        <span>
          Ring が示すのは参考情報です。<b>最終的な判断は、必ず現地の標識で行ってください。</b>
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 公開リクエスト文面の生成（FR-9）                                      */
/* ------------------------------------------------------------------ */

function RequestPanel(): React.JSX.Element {
  const data = useStore((s) => s.data);
  const showToast = useStore((s) => s.showToast);

  const wards = useMemo(() => {
    const set = new Set<string>();
    for (const s of data?.stations ?? []) if (s.municipality) set.add(s.municipality);
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [data]);

  const [ward, setWard] = useState('');
  const target = ward || '（区市町村名）';
  const link = data?.wardLinks.find((w) => w.municipality === ward);

  const text = `${target} 御中

自転車等の放置禁止区域データの公開についてのお願い

いつも自転車対策に取り組んでいただきありがとうございます。
一利用者として、放置禁止区域のデータ公開をお願いしたくご連絡しました。

【お願いしたいこと】
${target}が指定している自転車等の放置禁止区域を、地図として機械が読み取れる形式（GeoJSON または Shapefile）で、オープンデータとして公開していただけないでしょうか。

【理由】
現在、放置禁止区域は${link?.zone_map_url ? '区のホームページに掲載された地図の画像' : '地図の画像や紙の案内図'}としてのみ公開されています。
そのため、
・区域の境界がどこなのかを事前に調べる手段がない
・区をまたいで確認する方法がない
・区域が変更されたことに気づけない
という状況になっています。

利用者は、標識を見つけられずに区域内へ停めてしまい、撤去され、平日昼間に保管所へ取りに行くことになります。区にとっても撤去と保管の負担が生じています。

区域のデータが機械可読な形で公開されれば、地図アプリや案内サービスが「その場所は撤去対象です」と事前に伝えられるようになり、放置そのものを減らすことができます。

【補足】
東京都は「東京都オープンデータカタログサイト」でのデータ公開を推進しており、同カタログには既に多くの区が駐輪場や保管所のデータを登録しています。
一方で、放置禁止区域のデータは 2026 年 8 月時点で 1 件も登録されていません。
区がすでに区域図をお持ちである以上、形式を変えて公開いただくだけで、大きな公益が生まれると考えます。

ご検討のほど、どうぞよろしくお願いいたします。
`;

  return (
    <>
      <p className="p">
        区域データが公開されれば、Ring は推定ではなく<b>正確な境界</b>で答えられるようになります。
        下の文面をコピーして、区の意見・要望フォームや担当課へ送ってください。送信は行いません。
      </p>

      <select className="select" value={ward} onChange={(e) => setWard(e.target.value)} aria-label="区市町村を選ぶ">
        <option value="">区市町村を選んでください</option>
        {wards.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      <textarea className="textarea" value={text} readOnly aria-label="リクエスト文面" />

      <button
        className="btn btn-primary"
        style={{ marginTop: 10 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            showToast('文面をコピーしました。区の意見フォームに貼り付けてください。');
          } catch {
            showToast('コピーできませんでした。文面を長押しして選択してください。');
          }
        }}
      >
        文面をコピーする
      </button>

      {link?.zone_map_url && (
        <a className="btn" style={{ marginTop: 8 }} href={link.zone_map_url} target="_blank" rel="noopener noreferrer">
          {ward}の現在の区域図を見る →
        </a>
      )}
    </>
  );
}
