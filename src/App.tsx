import { useEffect, useState } from 'react';
import { MapView } from './components/MapView';
import { VerdictSheet } from './components/VerdictSheet';
import { Panels } from './components/Panels';
import { useStore } from './store/useStore';

export default function App(): React.JSX.Element {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const verdict = useStore((s) => s.verdict);
  const openPanel = useStore((s) => s.openPanel);
  const locate = useStore((s) => s.locate);
  const geo = useStore((s) => s.geo);
  const online = useStore((s) => s.online);
  const setOnline = useStore((s) => s.setOnline);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  if (status === 'loading') return <Boot />;
  if (status === 'error') return <LoadError onRetry={() => void init()} />;

  const level = verdict?.level ?? 'unknown';

  return (
    <div className="app" data-level={level}>
      <MapView />
      <Crosshair />
      <Vignette on={level === 'inside'} />

      <header className="header">
        <div className="brand">
          <RingMark />
          RING
        </div>
        {!online && (
          <span className="offline-badge">
            <span aria-hidden="true">●</span> オフライン
          </span>
        )}
        <div className="spacer" />
        <button className="iconbtn" onClick={() => openPanel('search')} aria-label="場所をさがす">
          <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2" />
        </button>
        <button className="iconbtn" onClick={() => openPanel('changes')} aria-label="区域変更のお知らせ">
          <Icon d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0" />
        </button>
        <button className="iconbtn" onClick={() => openPanel('sources')} aria-label="データについて">
          <Icon d="M12 3v18M3 12h18" />
        </button>
      </header>

      {toast && <div className="toast">{toast}</div>}

      <button
        className="iconbtn locate"
        style={{ bottom: 'calc(var(--sheet-peek) + 14px)' }}
        onClick={locate}
        aria-label="現在地へ移動"
        title="現在地へ移動"
      >
        {geo === 'locating' ? (
          <span className="boot-ring" style={{ width: 18, height: 18, borderWidth: 2 }} />
        ) : (
          <Icon d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3" />
        )}
      </button>

      <VerdictSheet />
      <Panels />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Crosshair(): React.JSX.Element {
  return (
    <div className="crosshair" aria-hidden="true">
      <svg viewBox="0 0 76 76">
        <circle className="ch-pulse" cx="38" cy="38" r="14" />
        <circle className="ch-ring" cx="38" cy="38" r="14" />
        <line className="ch-cross" x1="38" y1="10" x2="38" y2="24" />
        <line className="ch-cross" x1="38" y1="52" x2="38" y2="66" />
        <line className="ch-cross" x1="10" y1="38" x2="24" y2="38" />
        <line className="ch-cross" x1="52" y1="38" x2="66" y2="38" />
        <circle className="ch-dot" cx="38" cy="38" r="2.6" />
      </svg>
    </div>
  );
}

function Vignette({ on }: { on: boolean }): React.JSX.Element {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!on) {
      setFlash(false);
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [on]);
  return <div className="vignette" data-on={String(flash)} aria-hidden="true" />;
}

function RingMark(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--accent, #FF3B3B)" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="2" fill="var(--accent, #FF3B3B)" />
    </svg>
  );
}

function Icon({ d }: { d: string }): React.JSX.Element {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Boot(): React.JSX.Element {
  return (
    <div className="boot">
      <div className="boot-ring" />
      <h1>RING</h1>
      <p>東京都のオープンデータを読み込んでいます…</p>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <div className="boot">
      <h1>RING</h1>
      <p>
        データを読み込めませんでした。通信環境を確認して、もう一度お試しください。
      </p>
      <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 28px' }} onClick={onRetry}>
        もう一度読み込む
      </button>
    </div>
  );
}
