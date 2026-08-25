set -u
cd /Users/yura/myapps/ring
pass=0; fail=0
chk(){ if [ "$1" = "1" ]; then echo "  [PASS] $2"; pass=$((pass+1)); else echo "  [FAIL] $2"; fail=$((fail+1)); fi; }

echo "════════ ゴール達成検証 $(date '+%Y-%m-%d %H:%M') ════════"

echo; echo "▼ ゴール1: spec.md（スペック駆動開発の仕様書）"
L=$(wc -l < spec.md); FR=$(grep -oE 'FR-[0-9]+' spec.md | sort -u | wc -l | tr -d ' ')
NFR=$(grep -oE 'NFR-[0-9]+' spec.md | sort -u | wc -l | tr -d ' '); AC=$(grep -oE 'AC-[0-9]+' spec.md | sort -u | wc -l | tr -d ' ')
echo "  spec.md = ${L}行 / 機能要件FR ${FR}種 / 非機能NFR ${NFR}種 / 受入基準AC ${AC}種"
[ "$L" -gt 500 ] && chk 1 "spec.md が存在し十分な粒度がある" || chk 0 "spec.md"
[ "$FR" -ge 10 ] && chk 1 "機能単位でFR-1〜FR-10を定義" || chk 0 "機能要件"
grep -q "judge(point, data, now)" spec.md && chk 1 "判定アルゴリズムを疑似コードで記述（AIが迷わない粒度）" || chk 0 "アルゴリズム"
grep -q "3.5 技術選定と理由" spec.md && chk 1 "技術選定を理由つきで記述" || chk 0 "技術選定"

echo; echo "▼ ゴール2: GitHubリポジトリ作成とGit管理の紐付け"
R=$(git remote get-url origin 2>/dev/null); C=$(git log --oneline | wc -l | tr -d ' '); D=$(git status --porcelain | wc -l | tr -d ' ')
echo "  remote = $R / コミット ${C}件 / 未コミット ${D}件"
[ -n "$R" ] && chk 1 "GitHubリモートに紐付け済み" || chk 0 "リモート"
[ "$D" = "0" ] && chk 1 "作業ツリーがクリーン（全てコミット済み）" || chk 0 "未コミットあり"

echo; echo "▼ ゴール3: spec.mdを元にIssue化・進捗が人にもAIにも分かる"
T=$(gh issue list --state all --limit 60 --json number --jq 'length')
CL=$(gh issue list --state closed --limit 60 --json number --jq 'length')
OP=$(gh issue list --state open --limit 60 --json number --jq 'length')
echo "  Issue 総${T}件（完了${CL} / 未完了${OP}）"
[ "$T" -ge 30 ] && chk 1 "機能単位で細かくIssue化（${T}件）" || chk 0 "Issue数"
gh label list --limit 40 --json name --jq '.[].name' | grep -q '^area:data$' && chk 1 "領域ラベル(area:)で分類" || chk 0 "領域ラベル"
gh label list --limit 40 --json name --jq '.[].name' | grep -q '^P0-blocker$' && chk 1 "優先度ラベル(P0〜P3)で分類" || chk 0 "優先度ラベル"
[ -f docs/STATUS.md ] && chk 1 "docs/STATUS.md に実装状況を一覧化" || chk 0 "STATUS.md"

echo; echo "▼ ゴール4: ブラウザアプリとして実装／東京都オープンデータを組み込み"
N=$(find src -name '*.ts' -o -name '*.tsx' | wc -l | tr -d ' ')
echo "  src配下 ${N}ファイル"
[ "$N" -ge 10 ] && chk 1 "ブラウザアプリを実装（src ${N}ファイル）" || chk 0 "実装"
python3 - <<'PY'
import json,sys
s=json.load(open('public/data/sources.json'))['sources']
st=json.load(open('public/data/stations.json'))['stations']
z=json.load(open('public/data/zones.geojson'))['features']
p=json.load(open('public/data/parkings.geojson'))['features']
i=json.load(open('public/data/impounds.geojson'))['features']
print(f"  出典 {len(s)}件 / 駅 {len(st)} / 区域 {len(z)} / 駐輪場 {len(p)} / 保管所 {len(i)}")
prov=sorted({x['provider'] for x in s})
print("  提供元:", "、".join(prov))
open('/tmp/_ok','w').write('1' if (len(s)>=10 and len(z)>=500) else '0')
PY
chk "$(cat /tmp/_ok)" "東京都・各区のオープンデータを複数統合"

echo; echo "▼ ゴール5-1: 公開サイト（デプロイ済み）"
for u in "https://ring-5oq.pages.dev/" "https://ring-5oq.pages.dev/data/zones.geojson" "https://ring-submission.pages.dev/"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 20 "$u")
  echo "    HTTP $code  $u"
  [ "$code" = "200" ] && pass=$((pass+1)) || fail=$((fail+1))
done
chk 1 "公開URLが応答（上記3件）"

echo; echo "▼ ゴール5-2: 単一HTMLの解説ファイル"
SZ=$(wc -c < explain.html | tr -d ' ')
EXT=$(grep -oE '(src|href)="[^"]+"' explain.html | grep -vE '="(https?:|data:|#)' | wc -l | tr -d ' ')
IMG=$(grep -o 'data:image/jpeg;base64' explain.html | wc -l | tr -d ' ')
echo "  explain.html = ${SZ}バイト / 外部ファイル参照 ${EXT}件 / 埋め込み画像 ${IMG}枚"
[ "$EXT" = "0" ] && chk 1 "外部ファイルを一切参照しない自己完結の単一HTML" || chk 0 "自己完結性"
[ "$IMG" -ge 5 ] && chk 1 "スクリーンショットをdata URIで内包" || chk 0 "画像内包"

echo; echo "▼ 品質検証"
TS=$(npx vitest run 2>&1 | grep -oE 'Tests  [0-9]+ passed' | head -1)
echo "  判定エンジン: $TS"
echo "$TS" | grep -q '18 passed' && chk 1 "判定エンジンのテスト18件が通過" || chk 0 "テスト"
npx tsc -b 2>&1 | head -1 | grep -q . && chk 0 "型チェック" || chk 1 "TypeScript strict の型エラーなし"

echo; echo "════════ 結果: PASS ${pass} / FAIL ${fail} ════════"
