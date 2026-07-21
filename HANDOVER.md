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

## 現在の状態(2026-07-21 時点)

- **2026-07-21: Map Intent に `required_styles`/`optional_styles` を追加(D39、Issue #6、実装完了)**
  - `source_id` の寄せ集めではなく、Martin サーバーが公開する完成済みスタイル(`GET {base}/style/{style_id}`)を Map Intent から直接参照できるようにした。`StyleRef`/`ResolvedStyle`/`PublishedStyle` 型を追加し、`resolveStyles()`(`catalog.ts`)・`buildStyle()` のスタイルマージ(`style.ts`)・パネルのスタイル用チェックボックス(`render.ts`)を実装。
  - `parseMapIntent` は「`required_layers`/`required_styles` のどちらかが非空であればよい」に緩和(D39に既存spec文言からの逸脱として明記)。
  - テスト13件追加、全45件パス。詳細は [DECISIONS.md D39](DECISIONS.md#d39-map-intent-に-required_stylesoptional_styles-を追加するsource_id-ではなくスタイル全体を参照できるようにするissue-6) を参照。
  - **2026-07-21 追記: `stars.optgeo.org` への実公開完了**
    - `hfu/kitavolca` の `docs/style.json` から `vlcm-*`/`vbm-*` の主題レイヤーだけを抽出した `styles/vlcm.json`(7レイヤー)・`styles/vbm.json`(66レイヤー)を新規作成(kitavolca 自身の背景一式は除外 — Cartographer の常時背景 D24 と二重描画になるため)。
    - `stars.local`(SSH接続可能)の `/home/stars/styles/` に配置、`config.yaml` に `styles: {paths: [/home/stars/styles]}` を追記、`martin.service`(systemd --user)を再起動して反映。
    - `curl https://stars.optgeo.org/style/vlcm`・`/style/vbm` で実配信を確認。`catalog.test.ts` の統合テストをモック無しの実サーバー確認に更新(46件パス)、ブラウザでも恵山周辺の実データで GSI 凡例通りの色分け描画を確認済み。
    - `/catalog` 一覧表示は Cloudflare キャッシュ(最大4時間)により一時的に古い状態が残ることがあるが、`/style/{id}` 自体・Cartographer の解決処理には影響しない。
  - **次の担当者へのフォローアップ(未着手)**:
    - `EXAMPLE_MAP_INTENT`(`src/render.ts`)を `required_styles` を使う例に切り替えるかどうかは未検討(既存の石狩川治水フォームがすでに動作実績を持つ「ワンクリックで動作確認できる」例のため、置き換えか併記かは要判断)。
    - `UNopenGIS/staccato-spec` への ADR 提案(D18 → `UNopenGIS/staccato-spec#1` と同じパターン)は未着手。

- **2026-07-10: UI 整理 — 左パネル折りたたみ化・凡例統合・Layer Control 移設(D33、実装完了)**
  - 左上の `.panel` に折りたたみボタンを追加、クリックで左側に最小化(2.75×2.75rem 表示)。展開時は既存レイアウト(max-width 22rem)を維持。マップ表示面積を効率的に活用。
  - 独立していた `#legend`(`<details>`)を削除し、`.legend-section` として `.panel__content` 内に統合。既存の「表示中レイヤーのみ表示」ロジック(visibility Map、`data-has-entries` 属性)は流用、見た目はパネルの通常フロー化。
  - Layer Control を `bottom-left` から `top-right` に移設。NavigationControl・TerrainControl と共に右上に縦積み、UI 配置を MapLibre 標準に統一。
  - 新セクション「表示中のレイヤー」を `.panel` に追加(必須レイヤー一覧、読み取り専用)。ユーザーが現在のマップ構成を一目で把握可能に。
  - Status: typecheck/build/test OK、折りたたみ・展開のトランジション確認済み

- **2026-07-09: maplibre-gl-layer-control によるレイヤーパネル統合(D30、本番実装完了)**
  - ユーザーリクエストに対応: layer visibility/reordering のコントロール可能化
  - Placement: 左下(bottom-left)に配置、MapLibre 標準 control レイアウト
  - Bvmap 背景レイヤーを自動除外: thematic layers（Map Intent 指定レイヤー）のみ表示
  - デフォルト状態: collapsed（初期状態で閉じており、マップ表示優先）
  - CSS import 追加: `maplibre-gl-layer-control/style.css` で UI スタイル確保
  - Status: typecheck/build/test OK、ブラウザでのクリック操作可能を確認

- **2026-07-09: Vector fill layer の hillshade 透視対応(D29、試験的実装完了)**
  - 土砂災害警戒区域など thematic polygon fill で hillshade が消える課題に対応
  - Solution: fill layer に `paint-blend-mode: 'multiply'` を追加
  - Effect: 基底の hillshade を透視しながら thematic color を合成
  - Status: 実装完了、build/test OK。本番環境でのビジュアル確認は次フェーズ (QA/deployment)
  
- **2026-07-09: ハイブリッド対応 STAFF_PROMPT の実装テスト完了、デフォルト Map Intent を札幌の地形分類に更新(D28)**
  - `hfu/layers-martin` が STAFF_PROMPT.md をハイブリッド対応(オンライン/オフライン両立)に再設計([layers-martin D23](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d23-staff_promptmdをハイブリッド対応オンラインオフライン両立に設計する))
  - 実装テスト: 「札幌の地形分類を見たい」という自然言語入力に対応した Map Intent を生成・検証
  - デフォルト Map Intent を `lcmfc2`(治水地形分類図) + `relief`(色別標高図) + `lcm25k_2012`(土地条件図補助)に更新
  - 全 source_id が layers-martin カタログに実在し、メタデータ適切であることを確認
  - `src/render.ts` の `EXAMPLE_MAP_INTENT` を新版に置き換え
  - 結果: ハイブリッド対応 STAFF_PROMPT が実用的に機能することを実装で証明
- **2026-07-08: 背景地図を bvmap(グレースケール) + Mapterhorn 地形に刷新(D24)**
  - `hfu/kitavolca` の `docs/style.json`(commit `0c23a4a`)から背景スタイルを一度だけ移植し、`src/base-style.json` として vendoring
  - 背景は Map Intent に依存せず常時描画(背景が無い地図はなくなる)。VBM/VLCM 挿入点は Band A(基礎的な地図要素) と Band B(道路/建物/ラベル) の間で固定
  - `src/style.ts` の `buildStyle()` は主題レイヤーを背景の間に挿入する単純な構成に変更
  - `src/render.ts` で `localIdeographFontFamily: 'sans-serif'`(CJK グリフPBF取得回避)と `TerrainControl` を追加
  - `EXAMPLE_MAP_INTENT` から `source_id: "std"` を削除(背景が常時あるため冗長)
- **デジタル庁デザインシステム(DADS)部分準拠(D25)**
  - `@digital-go-jp/design-tokens@2.0.1` を unpkg CDN から読み込み、カラー・typography・spacing・border-radius・elevation トークン採用
  - `src/dads-components.css` に Button・Checkbox・Disclosure・グローバル focus-visible パターンを vendoring
  - UI コンポーネント(ボタン・チェックボックス・開閉パネル)を DADS 仕様に統一、Notice をセマンティックカラーで装飾
  - Google Fonts 削除、システムフォント利用(D24方針と一貫)
- **等高線を主題レイヤーの上に描画(D26)**
  - `src/base-style.json` で等高線を `before` から独立した `contours` セクションに移動
  - レイヤー合成順を `[...before, ...主題レイヤー, ...contours, ...after]` に変更
  - 警戒区域等の塗り面と地形の関係が視覚的に明確化
- **`docs/` を vite-plugin-singlefile で単一ファイル化(D27)**
  - `vite-plugin-singlefile` 導入、JS/CSS を `index.html` に埋め込み
  - `docs/assets/` 削除、`docs/index.html` のみ出力(~1.2MB uncompressed, ~317KB gzip)
  - HTTP リクエスト数が 3 → 1 に削減、配布・管理の簡潔化
- **2026-07-09: Mapterhorn ソースの maxzoom 上限撤廃(D31、Issue #2 修正)**
  - D24 で vendoring した `src/base-style.json` の mapterhorn ソースに設定されていた `maxzoom: 14` を削除
  - Context: 地域によっては z=16 の terrarium タイルが実際に存在（例：北海道一部）し、一律 z14 に切り詰めると高解像度地形を損なう
  - 修正: Mapterhorn 公式 `tilejson.json` と同様にズーム上限を指定しない状態に統一
  - Effect: z16 タイルが提供されている地域ではより高精細な地形陰影・3D地形表現が可能

- **2026-07-18: Issue #4「UI / UX を改善する」実装完了（デリバリー前チェック中）**
  - **フォーム画面の3ステップ化**: `src/render.ts` renderFormView の完全再構成完了（lines 67-140）
    - ページヘッダカード: "AI Maps" + "Make a map with your AI. Three steps: Prompt, Ask, Paste."
    - Step 1（Prompt your AI）: Copy ボタン＋Staff プロンプト（折りたたみ式）
    - Step 2（Ask your AI）: EN/JA サンプル問い「I want to explore flood control...」「石狩川の治水について考えたい」
    - Step 3（Paste）: 従来の textarea と Render ボタン
    - Copy ボタンハンドラ（`#copy-staff-prompt`、lines 124-132）が Staff プロンプトをクリップボードへ、"Copied!" フィードバック実装済み
  - **地図画面の文言更新**: `src/render.ts` renderMapView で "Copy Intent"（line 227）と "Back"（line 228）へ変更完了
  - **ブランディング統一（単数形への修正待機）**:
    - `index.html` title（line 6）: 現状 "AI Maps"（複数形） → "AI Map"（単数形）に修正必要
    - renderFormView の h1（line 80）: 現状 "AI Maps" → "AI Map" に修正必要
    - renderMapView の h1（line 208）: 現状 "AI Maps" → "AI Map" に修正必要
    - Plan では単数形を明示指定、ユーザーも確認済み
  - **CSS 整備**: `.step-header`、`.card-step`、`.sample` class がすべて index.html に既に定義済み（lines 26-29）
  - **残検証**:
    - ブランディング統一（タイトル単数形への修正）
    - `npm run typecheck` の型エラー確認
    - ブラウザプレビューでの UI/UX 検証（form flow、button 動作、レスポンシブ、タブタイトル確認）

- **2026-07-18: kitavolca(vbm/vlcm)統合を実地検証、コード変更不要と確認**
  - `hfu/kitavolca` で z5-z11 の minzoom 階層最適化(等高線・水涯線・記号のズーム整合)が完了し、`stars.optgeo.org` へ再アップロード済み(vbm/vlcm)になったのを機に、これらが faceless-cartographer で実際に使えるかを確認
  - 3リポジトリ(`hfu/faceless-cartographer` / `hfu/layers-martin` / `hfu/stars`)の役割を調査した結果:
    - `layers-martin` は GSI `layers.txt` 専用のカタログ生成器で、PMTiles/kitavolca とは無関係。変更不要
    - `stars` の Martin は `config/martin.yaml` の `pmtiles.paths: [./data]` によりディレクトリ自動検出。`vbm.pmtiles`/`vlcm.pmtiles` を `data/` に置くだけで `stars.optgeo.org/catalog` に自動登録される(`docs/OPERATIONS_RUNBOOK.md` §6.3「No service restart needed」)。変更不要
    - faceless-cartographer 自体は D23 の設計(`catalog_context.active_catalogs` に複数カタログを併記できる)により、`stars-optgeo`(`https://stars.optgeo.org/catalog`)を Map Intent に加えるだけで `vbm`/`vlcm` を解決できる。これは既に `src/staff-prompt.txt`(`hfu/layers-martin` の STAFF_PROMPT.md 由来)の「別カタログ: stars.optgeo.org」節と `scripts/example-intents/06-volcano-geology.yaml`(`vlcm` 使用)として実装・文書化済みだった
  - 実地検証: `node --experimental-strip-types scripts/eval-intent.ts scripts/example-intents/06-volcano-geology.yaml` → `M2 resolution: 1.00` `M3 renderable: 1.00` `RESULT: PASS`。さらに `vbm`/`vlcm` 両方を要求する Map Intent(`#intent=` フラグメント経由)を実際に `vite dev` 上のブラウザで描画し、樽前山周辺の等高線(vbm)と土地条件図の塗り(vlcm)が bvmap 背景の上に正しく重なることを目視確認
  - 結論: **3リポジトリいずれにもコード変更は不要**。新しい kitavolca レイヤーを使いたい場合は、Map Intent の `catalog_context.active_catalogs` に `stars-optgeo` を含め、`required_layers`/`optional_layers` に `source_id: "vbm"` または `"vlcm"` を指定するだけでよい(存在確認は `curl https://stars.optgeo.org/catalog` で事前に行うこと、`src/staff-prompt.txt` に注記あり)

- **2026-07-19: kitavolca の UI 改善を双方向に確認し、チェックボックス改行バグを逆輸入で修正(D38)**
  - `hfu/kitavolca` 側で行った「吹き出し(popup)のDADSデザイン統一＋属性フィルタリング」の改善が faceless-cartographer にも反映できるか検討した。Cartographer にはそもそも地物クリックのポップアップ機能自体が存在せず、デザインは移植可能だが属性フィルタリング(VBM/VLCM固有のスキーマ知識が前提)はD23の汎用描画方針と衝突するため、機能追加は見送り、判断根拠を [DECISIONS.md](DECISIONS.md) のバックログに記録した
  - 逆方向(faceless-cartographer → kitavolca)を確認した結果、`index.html` に `.panel .layer-item label { display: block; }` という、kitavolca側で既に修正済みだったのと同一のバグ(DADSチェックボックスのflexレイアウトを上書きし、チェックボックスとラベルが縦に分離)が残っていることを発見。ブラウザで再現確認の上、該当ルールを削除して修正(D38)。`npm run typecheck` パス、ブラウザで1行表示になることを確認済み
  - もう一件、kitavolca側のエラー表示(`style.json` 読み込み失敗時)がアドホックな `color:#b00` だったのに対し、faceless-cartographer は `.notice.error`(DADSセマンティックカラー)を使っていたため、こちらは逆にkitavolca側へ `.notice`/`.notice.error` を移植した(kitavolca HANDOVER.md 参照)

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
