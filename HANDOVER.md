# HANDOVER.md

## 件名

Staccato アーキテクチャにおける Cartographer 実装プロジェクト引き継ぎ

## 目的

`UNopenGIS/staccato-spec` が定義する Staccato アーキテクチャ(User / Staff / Cartographer / Library の4者モデル)のうち、**Cartographer**(インターネット側の地図描画サービス)を実装する。Cartographer の仕事は一つだけ: 投稿された Map Intent(構造化された YAML)を受け取り、決定的に MapLibre GL JS の地図として描画すること。利用者の意図解釈は Staff の責務であり、Cartographer はそれをしない。

## 上位構想: Staccato アーキテクチャにおける位置づけ

Staccato は信頼境界を挟んで責務を分離する。

```text
User          自然言語で問いを投げ、Map Intent の転送(エンタープライズ→インターネット)に責任を持つ
Staff         エンタープライズ内で動作し、問いを解釈して Map Intent を生成する。起動時に設定された
              カタログからしかレイヤーを解決してはならない(UNopenGIS/staccato-spec ADR 0002)
Cartographer  本プロジェクト。インターネット側で動作し、Map Intent を受け取って描画する
Library       カタログメタデータを公開する。参照実装は hfu/layers-martin
```

Cartographer は意図的に「faceless」である: URLに地図の状態(ズーム・中心座標・選択レイヤー等)を一切持たせない。これは提案ではなく規範的な決定であり(`UNopenGIS/staccato-spec` の [ADR 0001](https://github.com/UNopenGIS/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md))、覆すには新たな ADR が必要とされている。共有の一次artifactは Map Intent のテキスト自体であり、URLではない。

本実装は ADR 0001 の「`GET /` はフォームを返し `POST /` が受理・描画する」という文言を、単一ページのSPA(クライアント側の状態遷移。実際のHTTPリクエストは発生しない)として満たしている。文言通りの実装ではないが、URLが一切変化しないという点でむしろ趣旨をより徹底して満たしている、という判断([DECISIONS.md](DECISIONS.md) D18)。この解釈の違いは当初spec repoへ提起できていない、意図的な逸脱として記録していたが、2026-07-06にADR 0003としてspec側へ明確化を提案するPRを出した([UNopenGIS/staccato-spec#1](https://github.com/UNopenGIS/staccato-spec/pull/1)、レビュー待ち)。

### なぜ Cartographer は「軽く」あるべきか

2つの理由が同じ制約に収束する。

1. **情報管理上の理由**: Cartographer は公開のインターネット向けサービスである。Map Intent がエンタープライズ内部のビジネスロジック(なぜその判断をしたか)を漏らすことは望ましくない。Map Intent は `source_id` や `area.bbox` のように技術的に具体化されているため、機微な文脈を運ぶ必要がない。Staffが「なぜ」を、Cartographerは「何を」だけを受け取る。
2. **情報技術上の理由**: Staffはエンタープライズ内で高価な高性能LLMと組み合わせられる一方、Cartographerは安価にスケールする必要がある公開サービスである。**中核の描画パスにLLMを一切必要としない**設計が前提。Map Intent → MapLibreスタイル+ソース、という決定的な変換で完結する。

この方針から、本実装のコアパイプライン(`src/mapIntent.ts` → `src/catalog.ts` → `src/style.ts`)はLLMに依存しない。この世代の Cartographer は LLM を一切組み込まないことに決めた([DECISIONS.md](DECISIONS.md) D20)。地図として扱うデータが画像タイル中心である現状では、LLMによる自然文説明が無くても地図として完結するため。将来欲しくなった場合も、Cartographer本体に埋め込む(CLIサブプロセス等)のではなく、別の呼び出し可能なAPIとして切り出す方針。

### 入力には寛容に、出力には厳格に(Postel's law)

Cartographer は複数の Staff・複数の Library カタログと組み合わされる前提の、エコシステムの結節点である。そのため、Map Intent や TileJSON の受け取り側では過度に厳格な検証をしない: 例えば TileJSON の `tilejson` フィールドがバージョン文字列として想定外でも、`tiles` 配列が実際に使える形であれば描画する([D12](DECISIONS.md#d12-入力には寛容出力には厳格3リポジトリ間の整合性確認で見つけたギャップの是正))。spec上 SHOULD(MUSTでない)の規定に反する Map Intent(例: `sharing_policy.url_share: true`)も、拒否はせず警告に留めて処理を続ける。一方で、Cartographer 自身が出す HTML・ヘッダー(`Referrer-Policy` 等)や、コピーする Map Intent の形式は spec に厳密に従う。

## 現在の状態(2026-07-08 時点)

- **2026-07-08: 背景地図を bvmap(グレースケール) + Mapterhorn 地形に刷新(D24)**
  - `hfu/kitavolca` の `docs/style.json`(commit `0c23a4a`)から背景スタイルを一度だけ移植し、`src/base-style.json` として vendoring
  - 背景は Map Intent に依存せず常時描画(背景が無い地図はなくなる)。VBM/VLCM 挿入点は Band A(基礎的な地図要素) と Band B(道路/建物/ラベル) の間で固定
  - `src/style.ts` の `buildStyle()` は主題レイヤーを背景の間に挿入する単純な構成に変更
  - `src/render.ts` で `localIdeographFontFamily: 'sans-serif'`(CJK グリフPBF取得回避)と `TerrainControl` を追加
  - `EXAMPLE_MAP_INTENT` から `source_id: "std"` を削除(背景が常時あるため冗長)

## 現在の状態(2026-07-04 時点)

- **アーキテクチャは静的SPA**([DECISIONS.md](DECISIONS.md) D18・D21)。Vite + TypeScriptでビルドし、`docs/` に出力してGitHub Pagesで配信する。サーバーは無い。`index.html` + `src/main.ts` が単一ページで、`src/render.ts` の `renderFormView`/`renderMapView` が `#app` の中身を書き換えることで画面を切り替える(実際のページ遷移・HTTPリクエストは発生しない)。
- 中核パイプライン(`src/mapIntent.ts` → `src/catalog.ts` → `src/style.ts`)は元々環境非依存な純粋関数として書いてあったため、Express撤去時に無改修で移植できた。
- `hfu/layers-martin` の実カタログ(`https://hfu.github.io/layers-martin/catalog`)に対して実際に動作確認済み。土砂災害警戒区域の検証済み例(標準地図 + 警戒区域3件 + 任意レイヤー1件)が、実際にブラウザで正しく描画されることを Playwright のスクリーンショットで確認した。この例は `src/render.ts` の `EXAMPLE_MAP_INTENT` として初期フォームにそのまま埋め込まれている。
- テスト22件(`src/*.test.ts`)全パス。`src/catalog.test.ts` は実際に `layers-martin` の生カタログへHTTPで問い合わせる統合テストが中心。CI(`.github/workflows/ci.yml`)は typecheck + test を実行し green。
- 複数カタログの併用に対応済み([D23](DECISIONS.md#d23-vector_layersスキーマが既知のベクトルタイルは幾何タイプ別に汎用描画する複数カタログ統合はaggregatorを作らずmap-intentの複数active_catalogsで実現する))。`hfu/layers-martin`(`type: "layers_txt"`)に加え、実際に稼働しているMartinサーバー `stars.optgeo.org/catalog`(`type: "martin"`)を同じMap Intentの`catalog_context.active_catalogs`に併記でき、統合用の別リポジトリは不要。`stars.optgeo.org`が公開する`bvmap`(国土地理院最適化ベクトルタイル)のように、TileJSONが`vector_layers`(source-layerのスキーマ情報)を持つベクトルタイルは、source-layerごとにfill/line/circleのスタイルレイヤーを`["geometry-type"]`フィルタで機械的に生成して描画する(D23)。`hfu/layers-martin`のようにスキーマが分からないベクトルタイルは従来通り`unrenderable`のまま。この成果は `UNopenGIS/staccato-spec` 側の親issue([UNopenGIS/7#936](https://github.com/UNopenGIS/7/issues/936#issuecomment-4885444714)・[#938](https://github.com/UNopenGIS/7/issues/938#issuecomment-4885443949))にも報告済み。「性質の異なる複数Libraryカタログを統合する専用のアグリゲーターは不要で、Map Intentの`active_catalogs`配列がそのユースケースを追加の仕組み無しに吸収する」という設計知見として位置づけている。
- デプロイは `docs/` への静的ビルド。`.github/workflows/build-docs.yml` が `main` への push 時と毎日UTC 19:00のcronでビルドし、差分があればコミット・pushする(cronは `layers-martin` の `STAFF_PROMPT.md` 更新をビルド時fetch経由で追随させるため。D19・D21)。GitHub Pages設定は Settings → Pages → Deploy from a branch → `main:/docs`。以前検討していた自己ホストRaspberry Pi + cloudflaredのデプロイ一式(`deploy/`、systemdユニット、`Justfile` の `serve`、`.env`)は撤去した。
- LLMはこの世代では組み込まない([DECISIONS.md](DECISIONS.md) D20)。将来必要になれば別APIとして切り出す。
- `POST /`相当の描画結果は地図全面表示 + 左上フローティングパネルのレイアウト。「Copy Map Intent」はその時点の地図の中心座標・ズーム・向きを `render_hints` として反映してからコピーする([D11](DECISIONS.md#d11-地図全面レイアウトとcopy-map-intent時のrender_hints反映))。
- `GET /`相当のフォーム画面下部に現在のStaffプロンプト(`hfu/layers-martin` `STAFF_PROMPT.md` からビルド時取得)を折りたたみ表示する([D13](DECISIONS.md#d13-gettopページに現在のstaffプロンプトを表示する)・[D19](DECISIONS.md#d19-staffプロンプトの取得はビルド時fetchに変更する))。
- 凡例を `layers-martin` D18 の `legend_image_url` 拡張から表示する。表示中のレイヤーのみ、右下、折りたたみ式([D14](DECISIONS.md#d14-凡例現在表示中のレイヤーのみ右下折りたたみ))。
- 構造化エラーフィードバック(`missing_layers`/`unrenderable_layers`)は専用APIではなく、「Copy Map Intent」時にコピーされるMap Intentへ `cartographer_feedback` として埋め込む方式([D15](DECISIONS.md#d15-構造化エラーフィードバックはmap-intentへの埋め込みで環流させる))。
- 必須レイヤーが全滅した場合も専用の失敗画面は作らず、空の地図をそのまま出す([D16](DECISIONS.md#d16-必須レイヤー全滅時は空の地図をそのまま出す))。
- モバイルファースト(狭い画面でも両画面とも崩れないこと)をPlaywrightで確認済み。デジタル庁デザインシステムへの準拠は今後の検討事項としてバックログに残っている。

具体的な設計判断とその理由は [DECISIONS.md](DECISIONS.md) を参照。D1・D8・D9・D10・D17 は 2026-07-04 のアーキテクチャ変更でSupersededになっているが、判断の記録として残してある。

## v1 のスコープ外(意図的に対象外)

- ユーザーアカウント、Map Intent のリクエストを超えた永続化、URLベースの履歴機能
- `catalog_type: "stac"` の解決(`martin`/`layers_txt` のみ実装。将来追加しやすいようインターフェースは `catalog_type` で分岐する形にしてある)
- 中核描画パスでのLLM利用(この世代では機能自体を実装しない、D20)
- URLベースの共有機能(ADR 0001 が「Alternatives Considered」として明示的に却下している: クエリ/hash状態、opaqueなpermalink ID、暗号化URLトークン)

## 参照情報

- `UNopenGIS/staccato-spec`: `spec/architecture-principles.md`、`spec/map-intent-vnext.md`(Map Intent スキーマの正)、`spec/catalog-integration.md`、`spec/usecase.md`、`spec/background.md`、`spec/adr/0001-faceless-cartographer.md`、`spec/adr/0002-staff-startup-catalog-contract.md`。この文書で扱っていない事項はすべてそちらが正。
- `hfu/layers-martin`: 参照 Library 実装。`README.md`/`HANDOVER.md`/`DECISIONS.md`/`STAFF_PROMPT.md` に、このカタログ固有の性質(`bounds`/`attribution` の欠落率、既知の抑制ポリシー等)が記録されている。カタログの形が変わった場合はまずそちらを確認する。

## 次の担当者へ

- 各ソースファイル(`src/*.ts`)の冒頭コメントに、なぜその実装になっているかの理由を書いてある。まずコードとそのコメントを読むのが早い。
- 設計判断の背景・議論の経緯は [DECISIONS.md](DECISIONS.md) を参照。
- 開発コマンドやアーキテクチャの見取り図は [README.md](README.md) を参照。
