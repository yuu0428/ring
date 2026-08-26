/**
 * 使用するオープンデータの台帳。
 * ここが唯一の出典定義であり、public/data/sources.json と画面の「データについて」、
 * および README のデータ表はすべてここから生成される。
 *
 * 調査日 2026-08-23。すべて実際に取得・内容確認済み。
 */

export interface SourceDef {
  id: string;
  name: string;
  provider: string;
  /** 実データの URL */
  url: string;
  /** 人が見るページの URL（あれば） */
  page_url?: string;
  format: string;
  license: string;
  used_for: string[];
  /** CSV の文字コードが CP932 かどうかは decodeText が自動判別するため指定不要 */
}

export const SOURCES: Record<string, SourceDef> = {
  // ---------------------------------------------------------------------
  // 放置禁止区域の指定有無 — 本プロジェクトの根幹
  // ---------------------------------------------------------------------
  'DS-1': {
    id: 'DS-1',
    name: '駅別放置自転車の状況（令和7年度）',
    provider: '東京都都民安全総合対策本部',
    url: 'https://www.tomin-anzen.metro.tokyo.lg.jp/documents/d/tomin-anzen/07ekibetsuhouchi',
    page_url: 'https://www.tomin-anzen.metro.tokyo.lg.jp/kotsu/jitensha/houchi/0000001962',
    format: 'XLSX',
    license: '東京都オープンデータカタログサイト利用規約（CC BY 4.0 相当）',
    used_for: ['放置禁止区域の指定有無', '駅別の放置台数', '駅別の収容能力'],
  },

  // ---------------------------------------------------------------------
  // 駅の座標
  // ---------------------------------------------------------------------
  'DS-2': {
    id: 'DS-2',
    name: '国土数値情報 鉄道データ N02-24（2024年）',
    provider: '国土交通省',
    url: 'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip',
    page_url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html',
    format: 'Shapefile / GeoJSON',
    license: '国土数値情報利用約款',
    used_for: ['駅の位置', '路線名', '事業者名'],
  },

  // ---------------------------------------------------------------------
  // 駐輪場
  // ---------------------------------------------------------------------
  'DS-3': {
    id: 'DS-3',
    name: '自転車駐車場',
    provider: '文京区',
    url: 'https://www.city.bunkyo.lg.jp/documents/6059/zitensyatyusyajo.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/e8b3192a-7c3e-49a2-9c57-d39a46d0301a',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['駐輪場の位置・収容台数'],
  },
  'DS-4a': {
    id: 'DS-4a',
    name: '区営自転車駐輪場',
    provider: '品川区',
    url: 'https://www.opendata.metro.tokyo.lg.jp/shinagawa/kuei_tyurinjo.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/91bf1825-e7f2-4d6f-951a-60b29a63c913',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['駐輪場の位置・収容台数'],
  },
  'DS-4b': {
    id: 'DS-4b',
    name: '民間自転車駐輪場',
    provider: '品川区',
    url: 'https://www.opendata.metro.tokyo.lg.jp/shinagawa/minkan_tyurinjo.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/bba7c4ba-87ce-4a15-9cff-981c8a010ed0',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['民間駐輪場の位置・料金'],
  },
  'DS-5': {
    id: 'DS-5',
    name: '自転車等駐輪場一覧',
    provider: '目黒区',
    url: 'https://data.bodik.jp/dataset/a53ddc7b-f2e3-4378-a281-9a521d3a8151/resource/b8ce935e-5cbf-44ec-b418-91b83b3688e1/download/131105_bicycle_park_20240425.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/eb7b7721-bafb-4ad7-9da7-84ca1a1c4203',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['駐輪場の位置・料金・利用時間・収容台数'],
  },
  'DS-6': {
    id: 'DS-6',
    name: '区営自転車駐車場設置箇所',
    provider: '中野区',
    url: 'https://www2.wagmap.jp/nakanodatamap/nakanodatamap/opendatafile/map_21/CSV/opendata_57000020.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/88c46c2e-2dc8-4b42-9418-0258f8bb7c21',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['駐輪場の位置・料金・利用時間'],
  },
  'DS-7': {
    id: 'DS-7',
    name: '区営二輪車駐車場一覧',
    provider: '中央区',
    url: 'https://www.city.chuo.lg.jp/documents/984/kuei_nirinsha.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/de6da77f-f468-4f27-980b-7476afa67a5c',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['二輪車駐車場の位置・料金'],
  },

  // ---------------------------------------------------------------------
  // 保管所
  // ---------------------------------------------------------------------
  'DS-10': {
    id: 'DS-10',
    name: '保管所一覧',
    provider: '大田区',
    url: 'https://www.opendata.metro.tokyo.lg.jp/ootaku/131113_hokanjo-o.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/fb723b2c-191e-490f-b3c4-50b823de40e1',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['撤去自転車保管所の位置・開所時間', '撤去駅と保管所の対応'],
  },
  'DS-11': {
    id: 'DS-11',
    name: '区営自転車保管場所設置箇所',
    provider: '中野区',
    url: 'https://www2.wagmap.jp/nakanodatamap/nakanodatamap/opendatafile/map_21/CSV/opendata_57000010.csv',
    page_url: 'https://catalog.data.metro.tokyo.lg.jp/dataset/eb590078-fbeb-4bac-8d6b-c440ec52c621',
    format: 'CSV',
    license: 'CC BY 4.0',
    used_for: ['撤去自転車保管所の位置・開所時間', '撤去区域と保管所の対応'],
  },

  // ---------------------------------------------------------------------
  // 地図・生成データ
  //
  // 調査段階では品川区「駅前放置自転車撤去情報」、目黒区・港区「自転車シェアリングポート」も
  // 取得したが、現在の実装では読み込んでいないため台帳には載せない。
  // 画面には「使っているデータ」として表示されるので、使っていないものを載せない。
  // ---------------------------------------------------------------------
  'DS-14': {
    id: 'DS-14',
    name: '地理院タイル（淡色地図）',
    provider: '国土地理院',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    page_url: 'https://maps.gsi.go.jp/development/ichiran.html',
    format: 'ラスタタイル',
    license: '国土地理院コンテンツ利用規約（出典明記で利用可）',
    used_for: ['地図の基図'],
  },
  'DS-15': {
    id: 'DS-15',
    name: '放置禁止区域データ（Ring 作図）',
    provider: 'Ring プロジェクト',
    url: 'https://ring-5oq.pages.dev/data/zones.geojson',
    page_url: 'https://ring-5oq.pages.dev/explain.html',
    format: 'GeoJSON',
    license: 'CC BY 4.0',
    used_for: ['放置禁止区域のポリゴン（各区の公式区域図から作図）'],
  },
};
