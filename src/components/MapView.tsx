/**
 * 地図。MapLibre GL JS ＋ 地理院タイル（DECISIONS D-12）。
 *
 * 見た目の方針（spec.md 7.7）:
 *   基図は raster-* の paint プロパティで暗いアスファルト色まで落とす。
 *   CSS filter ではなく paint を使うのは、CSS だと上に乗せる区域や線まで着色されるため。
 *   区域は塗りを弱く、境界線を強く描く。「輪」を見せるのがこのアプリの主題。
 */
import { useEffect, useRef } from 'react';
import maplibregl, { type LngLatLike, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store/useStore';
import { DEFAULT_ZOOM } from '../core/constants';
import type { LngLat } from '../core/types';

const GSI_ATTRIB =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export function MapView(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const raf = useRef<number | null>(null);

  const data = useStore((s) => s.data);
  const verdict = useStore((s) => s.verdict);
  const flyTo = useStore((s) => s.flyTo);
  const userPos = useStore((s) => s.userPos);
  const setCenter = useStore((s) => s.setCenter);

  // --- 初期化（一度だけ）-------------------------------------------------
  useEffect(() => {
    if (!ref.current || map.current) return;

    const m = new maplibregl.Map({
      container: ref.current,
      center: useStore.getState().center as LngLatLike,
      zoom: DEFAULT_ZOOM,
      minZoom: 9,
      maxZoom: 19,
      attributionControl: { compact: true },
      // 判定は指した 1 点に対して行う。回転や傾きは誤解を生むので固定する
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      style: {
        version: 8,
        sources: {
          gsi: {
            type: 'raster',
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 18,
            attribution: GSI_ATTRIB,
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#0E1116' } },
          {
            id: 'gsi',
            type: 'raster',
            source: 'gsi',
            paint: {
              // 淡色地図を暗いアスファルトに落とす。道路の形は残しつつ主役を譲る
              'raster-saturation': -0.85,
              'raster-brightness-min': 0.02,
              'raster-brightness-max': 0.42,
              'raster-contrast': 0.12,
              'raster-opacity': 0.95,
            },
          },
        ],
      },
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;

    m.on('load', () => {
      m.addSource('zones', { type: 'geojson', data: EMPTY });
      m.addSource('planned', { type: 'geojson', data: EMPTY });
      m.addSource('boundary', { type: 'geojson', data: EMPTY });
      m.addSource('parkings', { type: 'geojson', data: EMPTY });
      m.addSource('me', { type: 'geojson', data: EMPTY });

      // 区域：塗りは弱く
      m.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': '#FF3B3B',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.06, 16, 0.13],
        },
      });
      // 区域：境界線を強く。外側にぼかしを重ねて「輪」が光って見えるようにする
      m.addLayer({
        id: 'zone-glow',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': '#FF3B3B', 'line-width': 9, 'line-opacity': 0.16, 'line-blur': 7 },
      });
      m.addLayer({
        id: 'zone-line',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': '#FF5A5A',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 2.6],
          'line-opacity': 0.95,
        },
      });

      // 施行前の区域：破線で区別する（FR-4.1）
      m.addLayer({
        id: 'planned-line',
        type: 'line',
        source: 'planned',
        paint: {
          'line-color': '#FFB020',
          'line-width': 2.2,
          'line-dasharray': [2.4, 1.8],
          'line-opacity': 0.9,
        },
      });

      // 駐輪場
      m.addLayer({
        id: 'parking-dot',
        type: 'circle',
        source: 'parkings',
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 6.5],
          'circle-color': '#22C08A',
          'circle-stroke-color': '#06110C',
          'circle-stroke-width': 1.4,
          'circle-opacity': 0.95,
        },
      });

      // 判定点から最近傍の境界へ引く線。このアプリの象徴（FR-2.3）
      m.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: 'boundary',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-dasharray': [1.4, 1.2],
          'line-opacity': 0.95,
        },
      });
      m.addLayer({
        id: 'boundary-point',
        type: 'circle',
        source: 'boundary',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#0E1116',
          'circle-stroke-width': 2,
        },
      });
      // 距離の数字は地図に描かず判定カードに出す。
      // MapLibre の symbol レイヤは glyphs の配信元を必要とし、外部依存が増えるため（NFR-4）。

      // 現在地
      m.addLayer({
        id: 'me-halo',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 15, 'circle-color': '#4C8DFF', 'circle-opacity': 0.18 },
      });
      m.addLayer({
        id: 'me-dot',
        type: 'circle',
        source: 'me',
        paint: {
          'circle-radius': 6,
          'circle-color': '#4C8DFF',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        },
      });

      pushData();
    });

    // 地図が動いたら判定を更新する。
    // 1 フレームに 1 回へ間引く（連打・高速パンでも最新の 1 件だけを反映する / FR-7.6）
    const onMove = (): void => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const c = m.getCenter();
        setCenter([c.lng, c.lat]);
      });
    };
    m.on('move', onMove);

    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- データを地図へ流し込む -------------------------------------------
  const pushData = (): void => {
    const m = map.current;
    const d = useStore.getState().data;
    if (!m || !d || !m.isStyleLoaded()) return;
    const today = new Date().toISOString().slice(0, 10);

    const active = d.zones.filter(
      (z) => z.properties.status === 'active' && z.properties.effective_from <= today,
    );
    const planned = d.zones.filter((z) => z.properties.status === 'planned');

    (m.getSource('zones') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: active,
    });
    (m.getSource('planned') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: planned,
    });
    (m.getSource('parkings') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: d.parkings,
    });
  };

  useEffect(() => {
    if (!data) return;
    const m = map.current;
    if (!m) return;
    if (m.isStyleLoaded()) pushData();
    else m.once('load', pushData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // --- 境界への線 ---------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const src = m.getSource('boundary') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const bp = verdict?.boundaryPoint;
    const dist = verdict?.distanceToBoundaryM ?? verdict?.exitDistanceM;
    if (!bp || dist == null || !verdict) {
      src.setData(EMPTY);
      return;
    }
    const from = useStore.getState().center;
    const color =
      verdict.level === 'inside'
        ? '#FF6B6B'
        : verdict.level === 'near'
          ? '#FFB020'
          : verdict.level === 'likely'
            ? '#FF8A3D'
            : '#22C08A';
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { color },
          geometry: { type: 'LineString', coordinates: [from, bp] },
        },
        { type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: bp } },
      ],
    });
  }, [verdict]);

  // --- 現在地 -------------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const src = m.getSource('me') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      userPos
        ? {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: userPos } },
            ],
          }
        : EMPTY,
    );
  }, [userPos]);

  // --- 外部からの移動指示 -------------------------------------------------
  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo({
      center: flyTo.center as LngLatLike,
      zoom: flyTo.zoom ?? map.current.getZoom(),
      duration: 900,
      essential: true,
    });
  }, [flyTo]);

  return <div ref={ref} className="map" aria-label="地図。中央の十字が判定する地点です" />;
}

export type { LngLat };
