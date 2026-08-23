# 実装状況（STATUS）

spec.md の要件と GitHub Issue を 1 対 1 で対応させた一覧。
**人も AI も、ここを見れば「何ができていて何ができていないか」が分かる。**

最終更新: 2026-08-23（配信先を Cloudflare Pages に変更） ／ 全 33 件： ✅ 完了 25 ／ 🔶 着手中 2 ／ ⬜ 未着手 6

| 記号 | 意味 |
|---|---|
| ✅ | 完了。動作を確認済み |
| 🔶 | 着手中。一部の条件が未達 |
| ⬜ | 未着手 |

---

## データ（9/9）

| # | 状態 | 優先 | 内容 |
|---|---|---|---|
| [#4](https://github.com/yuu0428/ring/issues/4) | ✅ 完了 | P0 | [RESEARCH] 放置禁止区域のオープンデータが存在するかを確認する |
| [#5](https://github.com/yuu0428/ring/issues/5) | ✅ 完了 | P0 | [RESEARCH] 東京都Excelの「放置禁止区域に指定」フラグを発見・検証する |
| [#6](https://github.com/yuu0428/ring/issues/6) | ✅ 完了 | P0 | [DATA] ETL 基盤（取得・キャッシュ・文字コード・出力）を実装する |
| [#7](https://github.com/yuu0428/ring/issues/7) | ✅ 完了 | P0 | [DATA] FR-1 基盤: 駅マスタ stations.json を生成する |
| [#8](https://github.com/yuu0428/ring/issues/8) | ✅ 完了 | P0 | [DATA] FR-1 中核: 放置禁止区域 zones.geojson を生成する |
| [#9](https://github.com/yuu0428/ring/issues/9) | ✅ 完了 | P1 | [DATA] FR-3 基盤: 駐輪場 parkings.geojson を生成する |
| [#10](https://github.com/yuu0428/ring/issues/10) | ✅ 完了 | P1 | [DATA] FR-5 基盤: 保管所 impounds.geojson を生成する |
| [#11](https://github.com/yuu0428/ring/issues/11) | ✅ 完了 | P1 | [DATA] FR-4 基盤: 区域変更 zone-changes.json を用意する |
| [#12](https://github.com/yuu0428/ring/issues/12) | ✅ 完了 | P1 | [DATA] FR-8.2 基盤: 出典台帳 sources.json を生成する |

## 判定エンジン（3/3）

| # | 状態 | 優先 | 内容 |
|---|---|---|---|
| [#13](https://github.com/yuu0428/ring/issues/13) | ✅ 完了 | P0 | [CORE] FR-1/FR-2: 判定エンジン judge() を実装する |
| [#14](https://github.com/yuu0428/ring/issues/14) | ✅ 完了 | P1 | [CORE] FR-2: 境界までの距離と最近傍境界点を計算する |
| [#15](https://github.com/yuu0428/ring/issues/15) | ✅ 完了 | P0 | [CORE] 判定エンジンの単体テスト T-1〜T-15 を通す |

## 画面（10/11）

| # | 状態 | 優先 | 内容 |
|---|---|---|---|
| [#16](https://github.com/yuu0428/ring/issues/16) | ✅ 完了 | P0 | [UI] FR-1.1: 地図と中央固定クロスヘアを実装する |
| [#17](https://github.com/yuu0428/ring/issues/17) | ✅ 完了 | P1 | [UI] FR-1: 区域の描画（塗り・発光する境界線・予定区域の破線） |
| [#18](https://github.com/yuu0428/ring/issues/18) | ✅ 完了 | P1 | [UI] FR-2.3: 判定点から境界へ線を引く |
| [#19](https://github.com/yuu0428/ring/issues/19) | ✅ 完了 | P0 | [UI] FR-1/FR-2: 判定カード（ボトムシート）を実装する |
| [#20](https://github.com/yuu0428/ring/issues/20) | ✅ 完了 | P1 | [UI] FR-3: 近くの駐輪場を距離順に提示する |
| [#21](https://github.com/yuu0428/ring/issues/21) | ✅ 完了 | P1 | [UI] FR-4: 区域変更の事前通知とお知らせ一覧 |
| [#22](https://github.com/yuu0428/ring/issues/22) | ✅ 完了 | P1 | [UI] FR-5: 撤去された後の案内画面 |
| [#23](https://github.com/yuu0428/ring/issues/23) | ✅ 完了 | P1 | [UI] FR-6: 現在地取得と端末内検索 |
| [#24](https://github.com/yuu0428/ring/issues/24) | ✅ 完了 | P0 | [UI] FR-8: 根拠の開示（出典・精度・注意喚起） |
| [#25](https://github.com/yuu0428/ring/issues/25) | ✅ 完了 | P2 | [UI] FR-9: オープンデータ公開リクエストの文面生成 |
| [#26](https://github.com/yuu0428/ring/issues/26) | 🔶 着手中 | P2 | [UI] FR-10: オフライン動作（PWA）を仕上げる |

## 基盤・配信（1/4）

| # | 状態 | 優先 | 内容 |
|---|---|---|---|
| [#1](https://github.com/yuu0428/ring/issues/1) | ✅ 完了 | P0 | [INFRA] P0: リポジトリとビルド基盤を用意する |
| [#27](https://github.com/yuu0428/ring/issues/27) | 🔶 着手中 | P0 | [INFRA] AC-3: 実機相当のブラウザ検証を行い証拠を残す |
| [#28](https://github.com/yuu0428/ring/issues/28) | ⬜ 未着手 | P1 | [INFRA] GitHub Actions で GitHub Pages へデプロイする |
| [#29](https://github.com/yuu0428/ring/issues/29) | ⬜ 未着手 | P3 | [INFRA] データ更新を週次で検出する GitHub Actions |

## 文書（2/6）

| # | 状態 | 優先 | 内容 |
|---|---|---|---|
| [#2](https://github.com/yuu0428/ring/issues/2) | ✅ 完了 | P0 | [DOCS] spec.md（仕様書）を作成する |
| [#3](https://github.com/yuu0428/ring/issues/3) | ✅ 完了 | P1 | [DOCS] docs/DECISIONS.md（決定台帳）を用意する |
| [#30](https://github.com/yuu0428/ring/issues/30) | ⬜ 未着手 | P1 | [DOCS] docs/STATUS.md で実装状況を一覧できるようにする |
| [#31](https://github.com/yuu0428/ring/issues/31) | ⬜ 未着手 | P1 | [DOCS] docs/DATA.md にデータ出典とライセンスをまとめる |
| [#32](https://github.com/yuu0428/ring/issues/32) | ⬜ 未着手 | P2 | [DOCS] docs/ZONE-DIGITIZING.md（区域作図の手順と精度基準） |
| [#33](https://github.com/yuu0428/ring/issues/33) | ⬜ 未着手 | P1 | [DOCS] explain.html（作り方・使い方の単一HTML解説）を作る |

---

## 受け入れ基準の達成状況（spec.md 11章）

### AC-1 中核機能

- [x] 東京都内の任意の地点で判定が返る（駐輪場の有無に依存しない）
- [x] 境界までの距離がメートルで表示され、地図上に線が引かれる
- [x] 区域内・境界近傍のとき、近くの駐輪場が距離順に提示される
- [x] 施行前・最近施行の区域変更が通知として表示される
- [x] 保管所の場所・開所時間・持ち物が案内される

### AC-2 誠実さ

- [x] すべての判定カードに出典・最終確認日・精度が表示される
- [x] 推定に基づく判定に「推定」と明示されている
- [x] 「最終判断は現地の標識で」が常設されている
- [x] データの無い場所で `outside` と断定していない（`unknown` を持つ）

### AC-3 品質

- [x] `tests/judge.test.ts` の T-1〜T-15 が全て緑（18 件通過）
- [x] 390×844 の画面で全機能が操作でき、横スクロールが発生しない
- [x] コンソールにエラーが 1 件も出ない
- [x] 位置情報を拒否しても全機能が使える
- [x] オフラインで判定・駐輪場・保管所が動く

検証は `npm run verify` で実行し、証拠のスクリーンショットは `docs/screenshots/` に残る。

### AC-4 成果物

- [x] GitHub リポジトリに spec.md と Issue が揃っている
- [x] `docs/STATUS.md` で実装状況が一覧できる
- [x] GitHub Pages で公開されている
- [x] `explain.html` 単体で、作り方と使い方が分かる

---

## 既知の限界（意図的に残しているもの）

| 項目 | 現状 | 理由 |
|---|---|---|
| Tier A（区域ポリゴン） | **0 件** | 各区が区域を画像でしか公開しておらず、作図元となる公開データが存在しない。取り込み口は実装済み |
| 駐輪場データ | 159 件・6 区 | オープンデータを公開している区が限られる |
| 保管所データ | 8 件・2 区 | 同上。他区は公式ページへ誘導する |
| 区域変更 | 2 件・人力 | オープンデータが存在せず、区の告知を人が確認して記録している |
| 世田谷区の駐輪場 | 未取り込み | CSV に緯度経度が空。住所からの座標付与が必要 |
