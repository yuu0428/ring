/**
 * アプリの状態。地図の中心が動くたびに判定が走るため、
 * 高頻度で変わる値（center / verdict）と、めったに変わらない値（data）を分けて持つ。
 */
import { create } from 'zustand';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../core/constants';
import { judge } from '../core/judge';
import type { LngLat, Verdict } from '../core/types';
import { loadRingData, type LoadedData } from '../data/loader';

export type PanelKind = 'search' | 'impound' | 'changes' | 'sources' | 'request' | null;

interface State {
  status: 'loading' | 'ready' | 'error';
  data: LoadedData | null;
  center: LngLat;
  verdict: Verdict | null;
  panel: PanelKind;
  /** 位置情報の状態。ユーザーへの案内文を出し分けるために持つ */
  geo: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';
  userPos: LngLat | null;
  online: boolean;
  toast: string | null;
  /** 地図へ「ここへ飛べ」と伝えるための値。連番で同じ座標への再指定も検出する */
  flyTo: { center: LngLat; zoom?: number; seq: number } | null;

  init: () => Promise<void>;
  setCenter: (c: LngLat) => void;
  openPanel: (p: PanelKind) => void;
  locate: () => void;
  goTo: (c: LngLat, zoom?: number) => void;
  showToast: (m: string | null) => void;
  setOnline: (v: boolean) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  data: null,
  center: DEFAULT_CENTER,
  verdict: null,
  panel: null,
  geo: 'idle',
  userPos: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  toast: null,
  flyTo: null,

  init: async () => {
    try {
      const data = await loadRingData();
      if (data.zones.length === 0 && data.stations.length === 0) {
        set({ status: 'error' });
        return;
      }
      set({ status: 'ready', data, verdict: judge(get().center, data) });
      get().locate();
    } catch (e) {
      console.error('[Ring] データの読み込みに失敗しました', e);
      set({ status: 'error' });
    }
  },

  setCenter: (c) => {
    const { data } = get();
    set({ center: c, verdict: data ? judge(c, data) : null });
  },

  openPanel: (p) => set({ panel: p }),

  goTo: (center, zoom) =>
    set((s) => ({ flyTo: { center, zoom, seq: (s.flyTo?.seq ?? 0) + 1 }, panel: null })),

  locate: () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      set({ geo: 'unavailable' });
      get().showToast('この端末では位置情報が使えません。地図を動かして調べたい場所に合わせてください。');
      return;
    }
    set({ geo: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: LngLat = [pos.coords.longitude, pos.coords.latitude];
        set({ geo: 'granted', userPos: c });
        get().goTo(c, DEFAULT_ZOOM);
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        set({ geo: denied ? 'denied' : 'unavailable' });
        get().showToast(
          denied
            ? '位置情報が使えないため東京駅を表示しています。地図を動かして、調べたい場所に合わせてください。'
            : '現在地を取得できませんでした。地図を動かして調べたい場所に合わせてください。',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  },

  showToast: (m) => {
    clearTimeout(toastTimer);
    set({ toast: m });
    if (m) toastTimer = setTimeout(() => set({ toast: null }), 6500);
  },

  setOnline: (v) => set({ online: v }),
}));
