/**
 * 同梱データの読み込み。
 * ビルド時に public/data/ に置かれた静的 JSON を取りに行くだけで、外部 API は呼ばない。
 * 一部のファイルが欠けても、取れたぶんで動かす（判定は必ず何かを返すため）。
 */
import type {
  Impound,
  Parking,
  RingData,
  Source,
  Station,
  Zone,
  ZoneChange,
} from '../core/types';

export interface WardLink {
  municipality: string;
  zone_map_url: string | null;
  zone_map_title: string | null;
  impound_url: string | null;
  areas: string[];
}

export interface LoadedData extends RingData {
  wardLinks: WardLink[];
}

function url(name: string): string {
  return `${import.meta.env.BASE_URL}data/${name}`;
}

async function getJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url(name), { cache: 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[Ring] ${name} を読み込めませんでした`, e);
    return fallback;
  }
}

export async function loadRingData(): Promise<LoadedData> {
  const [zones, stationFile, parkings, impounds, changeFile, sourceFile, wardFile] =
    await Promise.all([
      getJson<{ features: Zone[] }>('zones.geojson', { features: [] }),
      getJson<{ stations: Station[] }>('stations.json', { stations: [] }),
      getJson<{ features: Parking[] }>('parkings.geojson', { features: [] }),
      getJson<{ features: Impound[] }>('impounds.geojson', { features: [] }),
      getJson<{ changes: ZoneChange[] }>('zone-changes.json', { changes: [] }),
      getJson<{ sources: Source[] }>('sources.json', { sources: [] }),
      getJson<{ wards: WardLink[] }>('ward-links.json', { wards: [] }),
    ]);

  return {
    zones: zones.features ?? [],
    stations: stationFile.stations ?? [],
    parkings: (parkings.features ?? []).filter(
      (f) => Array.isArray(f.geometry?.coordinates) && f.geometry.coordinates.length === 2,
    ),
    impounds: (impounds.features ?? []).filter(
      (f) => Array.isArray(f.geometry?.coordinates) && f.geometry.coordinates.length === 2,
    ),
    changes: changeFile.changes ?? [],
    sources: sourceFile.sources ?? [],
    wardLinks: wardFile.wards ?? [],
  };
}
