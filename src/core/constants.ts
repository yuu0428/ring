/**
 * 判定に関わる定数（spec.md 6.4）
 * 値を変更する場合は docs/DECISIONS.md に根拠を記録すること。
 */

/** これ以内なら「境界ぎわ」と警告する距離(m) */
export const WARN_DISTANCE_M = 30;

/** 近くの駐輪場を提示する最大件数 */
export const NEARBY_PARKING_N = 5;

/** 駐輪場を探す最大半径(m) */
export const NEARBY_PARKING_M = 800;

/** 東京都域の bbox [西, 南, 東, 北] */
export const TOKYO_BBOX: [number, number, number, number] = [138.9, 35.48, 139.95, 35.92];

/** 位置情報が使えないときの初期表示（東京駅） */
export const DEFAULT_CENTER: [number, number] = [139.7671, 35.6812];
export const DEFAULT_ZOOM = 16;

/** 区域変更を「最近の変更」として扱う期間（日） */
export const RECENT_CHANGE_DAYS = 550;

/** 判定レベルごとの色。CSS 変数と一致させること */
export const LEVEL_COLORS = {
  inside: '#FF3B3B',
  near: '#FFB020',
  likely: '#FF8A3D',
  outside: '#22C08A',
  unknown: '#8A93A0',
} as const;
