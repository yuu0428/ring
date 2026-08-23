/**
 * 判定カード（spec.md 7.2 / 7.3）。
 * このアプリで最も読まれる画面。上から「答え・理由・距離・代替・根拠」の順に置く。
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { formatDistance } from '../core/geo';
import { impoundsForStation, isOpenToday, nearbyParkings, riskLabel } from '../core/nearby';
import type { Verdict } from '../core/types';

type SheetState = 'peek' | 'half' | 'full';

const CONFIDENCE_LABEL: Record<Verdict['confidence'], string> = {
  high: '区の区域図から作図',
  medium: '公開文書から作図',
  low: '推定',
};

export function VerdictSheet(): React.JSX.Element {
  const verdict = useStore((s) => s.verdict);
  const data = useStore((s) => s.data);
  const center = useStore((s) => s.center);
  const goTo = useStore((s) => s.goTo);
  const openPanel = useStore((s) => s.openPanel);

  const [state, setState] = useState<SheetState>('peek');
  const drag = useRef<{ y: number; state: SheetState } | null>(null);
  const prevLevel = useRef<string | null>(null);

  // 撤去対象に変わった瞬間だけシートを持ち上げる（見落とさせない / 7.2）
  useEffect(() => {
    if (!verdict) return;
    if (prevLevel.current !== null && prevLevel.current !== verdict.level) {
      if (verdict.level === 'inside' && state === 'peek') setState('half');
    }
    prevLevel.current = verdict.level;
  }, [verdict, state]);

  const parkings = useMemo(
    () => (data ? nearbyParkings(center, data.parkings) : []),
    [center, data],
  );
  const impounds = useMemo(
    () => (data ? impoundsForStation(verdict?.station, center, data.impounds) : []),
    [center, data, verdict?.station],
  );
  const risk = riskLabel(verdict?.station);
  const wardLink = useMemo(() => {
    const ward = verdict?.zone?.properties.municipality ?? verdict?.station?.municipality;
    return data?.wardLinks.find((w) => w.municipality === ward && w.zone_map_url) ?? null;
  }, [data, verdict]);

  const height = state === 'peek' ? 'var(--sheet-peek)' : state === 'half' ? '52vh' : '88vh';

  const onDown = (e: React.PointerEvent): void => {
    drag.current = { y: e.clientY, state };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent): void => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    if (Math.abs(dy) < 34) return;
    const order: SheetState[] = ['peek', 'half', 'full'];
    const i = order.indexOf(drag.current.state);
    const next = order[Math.min(order.length - 1, Math.max(0, i + (dy > 0 ? 1 : -1)))];
    setState(next);
    drag.current = null;
  };
  const onUp = (): void => {
    drag.current = null;
  };

  if (!verdict) {
    return (
      <div className="sheet" style={{ height: 'var(--sheet-peek)' }}>
        <div className="grip">
          <span />
        </div>
        <div className="sheet-body">
          <p className="detail">判定を準備しています…</p>
        </div>
      </div>
    );
  }

  const dist = verdict.distanceToBoundaryM ?? verdict.exitDistanceM;
  const change = verdict.upcoming?.change ?? verdict.relatedChange;
  const isFuture = change ? change.effective_from > new Date().toISOString().slice(0, 10) : false;

  return (
    <section className="sheet" style={{ height }} aria-live="polite">
      <div
        className="grip"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="button"
        tabIndex={0}
        aria-label="カードの高さを変える"
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') setState(state === 'peek' ? 'half' : 'full');
          if (e.key === 'ArrowDown') setState(state === 'full' ? 'half' : 'peek');
        }}
      >
        <span />
      </div>

      <div className="sheet-body">
        {/* --- 答え --- */}
        <div className="verdict-head">
          <h2 className="headline">{renderHeadline(verdict)}</h2>
          {verdict.confidence === 'low' && <span className="badge">推定</span>}
        </div>
        <p className="detail">{verdict.detail}</p>

        {/* --- 数字 --- */}
        <dl className="metrics">
          {dist != null && (
            <div className="metric">
              <dt>{verdict.level === 'inside' || verdict.level === 'likely' ? '区域の外まで' : '区域の境界まで'}</dt>
              <dd>{formatDistance(dist)}</dd>
            </div>
          )}
          {verdict.station && (
            <div className="metric">
              <dt>最寄り駅</dt>
              <dd style={{ fontSize: 16 }}>
                {verdict.station.display_name}
                {verdict.distanceToStationM != null && (
                  <small>{formatDistance(verdict.distanceToStationM)}</small>
                )}
              </dd>
            </div>
          )}
          {risk && verdict.station?.counts && (
            <div className="metric">
              <dt>この駅の放置台数（令和7年度）</dt>
              <dd>
                {verdict.station.counts.total}
                <small>台 · {risk.text}</small>
              </dd>
            </div>
          )}
        </dl>

        {/* --- 区域変更のお知らせ（FR-4.2）--- */}
        {change && (
          <div className="notice">
            <div className="notice-date">
              {formatJaDate(change.effective_from)}
              {isFuture ? ' から' : ' に変わりました'}
            </div>
            <div className="notice-title">{change.title}</div>
            <p className="notice-body">{change.summary}</p>
          </div>
        )}

        {/* --- 代替の提示（FR-3）--- */}
        {state !== 'peek' && (
          <>
            {parkings.length > 0 ? (
              <div className="section">
                <h3 className="section-title">近くの駐輪場</h3>
                {parkings.map(({ item, distanceM }) => (
                  <button
                    key={item.properties.id}
                    className="row"
                    onClick={() => goTo(item.geometry.coordinates as [number, number], 18)}
                  >
                    <div className="row-main">
                      <div className="row-title">{item.properties.name}</div>
                      <div className="row-sub">
                        {item.properties.address ?? item.properties.municipality}
                      </div>
                      <div className="chips">
                        {item.properties.capacity_bicycle != null && (
                          <span className="chip">{item.properties.capacity_bicycle}台</span>
                        )}
                        {item.properties.fee_temporary && (
                          <span className="chip">{item.properties.fee_temporary}</span>
                        )}
                        {item.properties.hours && <span className="chip">{item.properties.hours}</span>}
                        {item.properties.operator_type === 'private' && (
                          <span className="chip">民間</span>
                        )}
                      </div>
                    </div>
                    <div className="row-dist">{formatDistance(distanceM)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="section">
                <h3 className="section-title">近くの駐輪場</h3>
                <p className="detail">
                  この付近 800m 以内に、Ring が持っているデータの駐輪場はありません。
                  駐輪場のオープンデータを公開している区が限られているためで、実際には存在する場合があります。
                </p>
              </div>
            )}

            {/* --- 撤去された後（FR-5）--- */}
            {impounds.length > 0 && (
              <div className="section">
                <h3 className="section-title">撤去されてしまったら</h3>
                {impounds.slice(0, 2).map(({ item, distanceM }) => {
                  const open = isOpenToday(item);
                  return (
                    <button
                      key={item.properties.id}
                      className="row"
                      onClick={() => openPanel('impound')}
                    >
                      <div className="row-main">
                        <div className="row-title">{item.properties.name}</div>
                        <div className="row-sub">{item.properties.open_hours}</div>
                        <div className="chips">
                          {open !== null && (
                            <span
                              className="chip"
                              style={{ color: open ? 'var(--c-safe)' : 'var(--c-warn)' }}
                            >
                              {open ? '今日は開いています' : '今日は閉まっています'}
                            </span>
                          )}
                          {item.properties.tel && <span className="chip">{item.properties.tel}</span>}
                        </div>
                      </div>
                      <div className="row-dist">{formatDistance(distanceM)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* --- 根拠（FR-8）--- */}
        {state === 'full' && (
          <div className="section">
            <h3 className="section-title">この判定の根拠</h3>
            <div className="evidence">
              {verdict.evidence.map((e, i) => (
                <div key={i} style={{ marginBottom: i < verdict.evidence.length - 1 ? 10 : 0 }}>
                  <a href={e.url} target="_blank" rel="noopener noreferrer">
                    {e.label}
                  </a>
                  <div className="evidence-meta">
                    最終確認 {e.verifiedAt}
                    {e.accuracy && ` ・ 精度: ${CONFIDENCE_LABEL[verdict.confidence]}`}
                  </div>
                </div>
              ))}
              {verdict.zone?.properties.radius_m != null && (
                <div className="evidence-meta" style={{ marginTop: 8 }}>
                  この区域は、東京都の資料にある「放置禁止区域に指定」の印と駅の位置から、
                  半径 {verdict.zone.properties.radius_m}m の円として推定したものです。
                  実際の境界の形とは異なります。
                </div>
              )}
            </div>

            {wardLink?.zone_map_url && (
              <a
                className="btn"
                style={{ marginTop: 10 }}
                href={wardLink.zone_map_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {wardLink.municipality}の区域図を開く →
              </a>
            )}
          </div>
        )}

        <div className="caution">
          <span aria-hidden="true">⚠︎</span>
          <span>
            Ring が示すのは参考情報です。<b>最終的な判断は、必ず現地の標識で行ってください。</b>
          </span>
        </div>
      </div>
    </section>
  );
}

/** 見出しの数字だけ大きく見せる */
function renderHeadline(v: Verdict): React.ReactNode {
  const m = v.headline.match(/^(あと)(\d+)(mで撤去対象)$/);
  if (m) {
    return (
      <>
        {m[1]}
        <span className="num">{m[2]}</span>
        {m[3]}
      </>
    );
  }
  return v.headline;
}

function formatJaDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}
