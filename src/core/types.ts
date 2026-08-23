/**
 * Ring の共有型定義。
 * アプリ本体と ETL スクリプトの両方から import される（型の二重管理を防ぐため）。
 * 仕様: spec.md 5章 / 6章
 */
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

/** 経度・緯度の順（GeoJSON 準拠）。順番を逆にしないこと。 */
export type LngLat = [number, number];

/** データの生成情報。全出力ファイルの先頭に付ける。 */
export interface Meta {
  generated_at: string;
  generator: string;
  spec_version: string;
  license_note: string;
}

/**
 * 区域データの精度区分。spec.md 5.3
 * この 3 段階の意味を変更してはならない（DECISIONS D-08）。
 */
export type Accuracy =
  /** 区の公式区域図の境界線をトレース。誤差 10m 程度 */
  | 'traced'
  /** 条例別表や文章による区域記述から作図。誤差は道路 1 本分程度 */
  | 'described'
  /** 都 Excel の指定フラグ＋駅座標から機械生成した円。境界の実形状は反映しない */
  | 'estimated';

// ---------------------------------------------------------------------------
// 放置禁止区域
// ---------------------------------------------------------------------------

export type ZoneTier = 'A' | 'B';
export type ZoneStatus = 'active' | 'planned' | 'expired';

export interface ZoneProps {
  id: string;
  tier: ZoneTier;
  name: string;
  municipality: string;
  /** この区域が覆う駅名（「駅」を除いた形）。Tier B の二重判定を抑止するキー */
  stations: string[];
  status: ZoneStatus;
  effective_from: string;
  effective_to: string | null;
  accuracy: Accuracy;
  source_name: string;
  source_url: string;
  source_format: string;
  verified_at: string;
  /** Tier B のみ。推定リングの半径(m) */
  radius_m?: number | null;
  notes?: string | null;
}

export type Zone = Feature<Polygon | MultiPolygon, ZoneProps>;
export type ZoneCollection = FeatureCollection<Polygon | MultiPolygon, ZoneProps> & {
  meta: Meta;
};

// ---------------------------------------------------------------------------
// 駅
// ---------------------------------------------------------------------------

export interface StationCounts {
  bicycle: number;
  moped: number;
  small_moped: number;
  motorcycle: number;
  total: number;
}

export interface StationCapacity {
  bicycle: number;
  moped: number;
  total: number;
}

export interface Station {
  id: string;
  /** 「駅」を含まない駅名。例: 渋谷 */
  name: string;
  /** 表示用。例: 渋谷駅 */
  display_name: string;
  lon: number;
  lat: number;
  lines: string[];
  operators: string[];
  municipality: string | null;
  /**
   * 放置禁止区域の指定有無。東京都「駅別放置自転車の状況」の ＊ 印に由来する。
   * null = 都の資料に該当行が無い（＝判定材料が無い）
   */
  designated: boolean | null;
  /** 都資料の行ラベル。複数駅がまとまっている場合がある */
  group_label: string | null;
  counts: StationCounts | null;
  capacity: StationCapacity | null;
  source: SourceRef | null;
}

export interface StationFile {
  meta: Meta;
  stations: Station[];
}

// ---------------------------------------------------------------------------
// 駐輪場
// ---------------------------------------------------------------------------

export type OperatorType = 'public' | 'private' | 'unknown';

export interface ParkingProps {
  id: string;
  name: string;
  municipality: string;
  address: string | null;
  capacity_bicycle: number | null;
  capacity_moped: number | null;
  /** 料金は原文のまま保持する。数値化しない（DECISIONS D-10） */
  fee_temporary: string | null;
  fee_monthly: string | null;
  hours: string | null;
  note: string | null;
  operator_type: OperatorType;
  source_name: string;
  source_url: string;
  license: string;
  verified_at: string;
}

export type Parking = Feature<Point, ParkingProps>;
export type ParkingCollection = FeatureCollection<Point, ParkingProps> & { meta: Meta };

// ---------------------------------------------------------------------------
// 撤去自転車保管所
// ---------------------------------------------------------------------------

/** 「今日は開いているか」の機械判定用。手作業で構造化したものだけが持つ */
export interface OpenRule {
  /** 0=日 … 6=土 */
  weekdays: number[];
  /** 第 n 日曜も開所する場合。例: [2, 4] */
  nth_sunday?: number[];
  start: string;
  end: string;
  closed_holidays: boolean;
  /** 例: ["12-29..01-03"] */
  closed_ranges: string[];
}

export interface ImpoundProps {
  id: string;
  name: string;
  municipality: string;
  address: string | null;
  tel: string | null;
  open_days: string;
  open_hours: string;
  /** null のときは「今日開いているか」を表示しない（DECISIONS D-11） */
  open_rule: OpenRule | null;
  closed_days: string | null;
  covered_stations: string[];
  covered_area_text: string | null;
  capacity: number | null;
  fee_bicycle: string | null;
  fee_moped: string | null;
  required_items: string[];
  source_name: string;
  source_url: string;
  verified_at: string;
}

export type Impound = Feature<Point, ImpoundProps>;
export type ImpoundCollection = FeatureCollection<Point, ImpoundProps> & { meta: Meta };

// ---------------------------------------------------------------------------
// 区域変更
// ---------------------------------------------------------------------------

export type ZoneChangeKind = 'expand' | 'shrink' | 'new' | 'abolish';

export interface ZoneChange {
  id: string;
  municipality: string;
  title: string;
  kind: ZoneChangeKind;
  effective_from: string;
  affected_stations: string[];
  summary: string;
  zone_ids: string[];
  source_name: string;
  source_url: string;
  published_at: string | null;
  verified_at: string;
}

export interface ZoneChangeFile {
  meta: Meta;
  changes: ZoneChange[];
}

// ---------------------------------------------------------------------------
// 出典
// ---------------------------------------------------------------------------

export interface SourceRef {
  name: string;
  url: string;
  fiscal_year?: string;
  verified_at: string;
}

export interface Source {
  id: string;
  name: string;
  provider: string;
  url: string;
  page_url?: string;
  format: string;
  license: string;
  fetched_at: string;
  used_for: string[];
  record_count: number;
}

export interface SourceFile {
  meta: Meta;
  sources: Source[];
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export type VerdictLevel = 'inside' | 'near' | 'likely' | 'outside' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export interface Evidence {
  label: string;
  url: string;
  verifiedAt: string;
  accuracy?: Accuracy;
}

export interface Verdict {
  level: VerdictLevel;
  confidence: Confidence;
  headline: string;
  detail: string;
  zone?: Zone;
  distanceToBoundaryM?: number;
  boundaryPoint?: LngLat;
  exitDistanceM?: number;
  station?: Station;
  distanceToStationM?: number;
  /** 判定点が施行前の区域の内側にあるとき（FR-4.2） */
  upcoming?: { change: ZoneChange | null; zone: Zone };
  /**
   * 判定点の最寄り駅に関係する区域変更。施行前のものが最優先、無ければ最近施行されたもの。
   * 「いつも停めている場所が先月から対象になった」を伝えるために使う。
   */
  relatedChange?: ZoneChange;
  /** 空配列を許さない（DECISIONS D-07） */
  evidence: Evidence[];
}

/** 判定に必要なデータ一式 */
export interface RingData {
  zones: Zone[];
  stations: Station[];
  parkings: Parking[];
  impounds: Impound[];
  changes: ZoneChange[];
  sources: Source[];
}
