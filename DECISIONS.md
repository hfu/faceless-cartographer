# DECISIONS.md

`faceless-cartographer` の設計判断を ADR (Architecture Decision Record) 形式で記録する。上位構想は [HANDOVER.md](HANDOVER.md) を参照。実装は `src/*.ts` を正とし、ここでは判断の理由のみを記録する。

## 目次

| # | タイトル | Status | Date |
|---|---|---|---|
| [D1](#d1-faceless-な-post-はサーバーへのhttp-postとして実装する) | faceless な `POST /` はサーバーへのHTTP POSTとして実装する | **Superseded by D18** | 2026-07-02 |
| [D2](#d2-map-intent-のスキーマはmap-intent-vnextmdに文字通り従う) | Map Intent のスキーマは `map-intent-vnext.md` に文字通り従う | Accepted | 2026-07-02 |
| [D3](#d3-source_id-が解決できない場合は捏造せずmissing_layersとして可視化する) | `source_id` が解決できない場合は捏造せず `missing_layers` として可視化する | Accepted | 2026-07-02 |
| [D4](#d4-任意レイヤーはスタイルに含めつつ既定で非表示にする) | 任意レイヤーはスタイルに含めつつ既定で非表示にする | Accepted | 2026-07-02 |
| [D5](#d5-ベクトルタイルはソースのみ追加しレイヤーは描画しない) | ベクトルタイルはソースのみ追加し、レイヤーは描画しない | Accepted | 2026-07-02 |
| [D6](#d6-初期表示範囲のフォールバック順) | 初期表示範囲のフォールバック順 | Accepted | 2026-07-02 |
| [D7](#d7-依存パッケージのバージョンは学習知識ではなく実際のレジストリで確認する) | 依存パッケージのバージョンは学習知識ではなく実際のレジストリで確認する | Accepted | 2026-07-02 |
| [D8](#d8-llm説明パネルは中核パイプラインから分離しワンショットcli呼び出しにする) | LLM説明パネルは中核パイプラインから分離し、ワンショットCLI呼び出しにする | **Superseded by D20** | 2026-07-02 |
| [D9](#d9-デプロイ先は自己ホストのraspberry-pi-4b--cloudflared) | デプロイ先は自己ホストの Raspberry Pi 4B + cloudflared | **Superseded by D21** | 2026-07-02 |
| [D10](#d10-express-から-hono-への移行は今回見送る) | Express から Hono への移行は今回見送る | **Moot(サーバー自体が無くなったため D21 参照)** | 2026-07-02 |
| [D11](#d11-地図全面レイアウトとcopy-map-intent時のrender_hints反映) | 地図全面レイアウトと Copy Map Intent 時の `render_hints` 反映 | Accepted | 2026-07-02 |
| [D12](#d12-入力には寛容出力には厳格3リポジトリ間の整合性確認で見つけたギャップの是正) | 入力には寛容、出力には厳格(3リポジトリ間の整合性確認で見つけたギャップの是正) | Accepted | 2026-07-03 |
| [D13](#d13-gettopページに現在のstaffプロンプトを表示する) | `GET /` トップページに現在のStaffプロンプトを表示する | Accepted(取得方式はD19で変更) | 2026-07-03 |
| [D14](#d14-凡例現在表示中のレイヤーのみ右下折りたたみ) | 凡例(現在表示中のレイヤーのみ・右下・折りたたみ) | Accepted | 2026-07-03 |
| [D15](#d15-構造化エラーフィードバックはmap-intentへの埋め込みで環流させる) | 構造化エラーフィードバックはMap Intentへの埋め込みで環流させる | Accepted | 2026-07-03 |
| [D16](#d16-必須レイヤー全滅時は空の地図をそのまま出す) | 必須レイヤー全滅時は空の地図をそのまま出す | Accepted | 2026-07-03 |
| [D17](#d17-静的サイト化ではなく現状のexpressraspberry-piを維持デプロイはjustenvで統一) | 静的サイト化ではなく現状の Express/Raspberry Pi を維持、デプロイは `just`/`.env` で統一 | **Superseded by D21** | 2026-07-03 |
| [D18](#d18-getpost-の二面性ではなく単一ページのクライアント側遷移spaとする) | GET/POST の二面性ではなく、単一ページのクライアント側遷移(SPA)とする | Accepted | 2026-07-04 |
| [D19](#d19-staffプロンプトの取得はビルド時fetchに変更する) | Staffプロンプトの取得はビルド時fetchに変更する | Accepted | 2026-07-04 |
| [D20](#d20-この世代のcartographerにはllmを載せない) | この世代のCartographerにはLLMを載せない | Accepted | 2026-07-04 |
| [D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする) | 静的サイトとして `docs/` に出力し、GitHub Pagesでホストする | Accepted | 2026-07-04 |
| [D22](#d22-staffプロンプトにコピーボタンを追加しsummary内のリンクを外に出す) | Staffプロンプトにコピーボタンを追加し、`<summary>`内のリンクを外に出す | Accepted | 2026-07-04 |
| [D23](#d23-vector_layersスキーマが既知のベクトルタイルは幾何タイプ別に汎用描画する複数カタログ統合はaggregatorを作らずmap-intentの複数active_catalogsで実現する) | `vector_layers`スキーマが既知のベクトルタイルは幾何タイプ別に汎用描画する。複数カタログ統合はaggregatorを作らずMap Intentの複数`active_catalogs`で実現する | Accepted | 2026-07-04 |
| [D24](#d24-背景地図を-bvmap-グレースケール--mapterhorn-hillshade--terrain-に固定して常時描画する) | 背景地図を bvmap グレースケール + Mapterhorn hillshade + terrain に固定して常時描画する | Accepted | 2026-07-08 |
| [D25](#d25-デジタル庁デザインシステムへの部分準拠トークンとアクセシビリティパターン採用) | デジタル庁デザインシステムへの部分準拠(トークンとアクセシビリティパターン採用) | Accepted | 2026-07-08 |
| [D26](#d26-等高線を主題レイヤーの上に描画する) | 等高線を主題レイヤーの上に描画する | Accepted | 2026-07-08 |
| [D27](#d27-docs-を-vite-plugin-singlefile-で単一ファイル化する) | `docs/` を vite-plugin-singlefile で単一ファイル化する | Accepted | 2026-07-08 |
| [D28](#d28-デフォルト-map-intent-を札幌の地形分類に更新しハイブリッド対応-staff_prompt-を実装テスト) | デフォルト Map Intent を札幌の地形分類に更新し、ハイブリッド対応 STAFF_PROMPT を実装テスト | Accepted | 2026-07-09 |
| [D29](#d29-vector-fill-layer-で-hillshade-を透視するため-blend-mode-を導入) | Vector fill layer で hillshade を透視するため blend-mode を導入 | Accepted | 2026-07-09 |
| [D30](#d30-maplibre-gl-layer-control-による-レイヤーパネル統合) | maplibre-gl-layer-control によるレイヤーパネル統合 | Accepted | 2026-07-09 |
| [D31](#d31-mapterhorn-ソースの-maxzoom-14-固定を撤廃する) | Mapterhorn ソースの `maxzoom: 14` 固定を撤廃する | Accepted | 2026-07-09 |
| [D32](#d32-map-intentを-url-フラグメントで一回限り受け渡しする-issue-3) | Map Intentを URL フラグメントで一回限り受け渡しする(Issue #3) | Accepted | 2026-07-09 |
| [D33](#d33-ui-整理-左パネルの折りたたみ化凡例統合レイヤーコントロール移設表示中レイヤー明示) | UI 整理：左パネルの折りたたみ化、凡例統合、レイヤーコントロール移設、表示中レイヤー明示 | Accepted | 2026-07-10 |
| [D34](#d34-url-フラグメント反映を-intent-の-sharing_policy-で制御しセッション単位でトグル化) | URL フラグメント反映を intent の `sharing_policy` で制御し、セッション単位でトグル化 | Accepted | 2026-07-10 |
| [D35](#d35-copy-shareable-link-ボタンの廃止--idempotent-cartographer-の実装) | 「Copy Shareable Link」ボタンの廃止 ―― idempotent Cartographer の実装 | Accepted | 2026-07-10 |
| [D36](#d36-cartographer-の2つのモードfaceless-と-idempotent) | Cartographer の2つのモード（faceless と idempotent） | Accepted | 2026-07-10 |
| [D37](#d37-複数ラスタオーバーレイの可読性のため下に主題があるラスタを半透明にする) | 複数ラスタ・オーバーレイの可読性のため、下に主題があるラスタを半透明にする | Accepted | 2026-07-17 |

---

## D1: faceless な `POST /` はサーバーへのHTTP POSTとして実装する

**Status**: Superseded by [D18](#d18-getpost-の二面性ではなく単一ページのクライアント側遷移spaとする)(2026-07-04)。以下は当時の判断記録として残す。

**Context**: 当初、中核描画パイプラインにLLMが不要であること([HANDOVER.md](HANDOVER.md)参照)を踏まえ、Vite + TypeScriptによる完全クライアントサイドの静的サイト(GitHub Pages等にデプロイ可能、サーバー不要)として実装する案を検討した。`hfu/layers-martin` のカタログがCORSを許可している(`Access-Control-Allow-Origin: *`)ことを確認し、ブラウザから直接 `fetch` してカタログ解決・スタイル構築・描画まで完結できることも確認済みだった。

その後、方針転換の判断があった: 静的サイト案では「`POST /`」を文字通りのHTTP POSTエンドポイントとしては実現できず、フォーム送信をJavaScriptで横取りしてクライアント側だけで処理する形になる。将来LLMによる説明パネルを追加する際、ブラウザから直接CLIツール(`claude -p` 等)を実行することはできないため、いずれにせよサーバープロセスが必要になる可能性が高い。

**Decision**: Express (Node.js/TypeScript) によるサーバーとして実装する。`GET /` はフォームを返し、`POST /` は実際にHTTPリクエストボディとしてMap Intentを受け取り、サーバー側でパース・カタログ解決・スタイル構築を行い、結果をHTML(MapLibre GL JSをCDN経由で埋め込み)として返す。

**Consequences**: 静的サイトほど安価にはホストできない(何らかのNode実行環境が要る)。一方で、`GET /`・`POST /` という要求されたエンドポイント形状にそのまま対応でき、将来のLLM機能追加(D8参照)にも自然に接続できる。中核パイプライン(`mapIntent.ts`/`catalog.ts`/`style.ts`)はNode/ブラウザいずれでも動く環境非依存な純粋関数として書いてあるため、後で静的サイト構成に戻したくなった場合も書き直しの範囲は小さい。

## D2: Map Intent のスキーマは `map-intent-vnext.md` に文字通り従う

**Status**: Accepted

**Context**: `hfu/layers-martin` の `STAFF_PROMPT.md` は、独自の `catalog_type`/`purpose`/`required_area`/`base` のようなフィールド名を使った結果、spec準拠のCartographerに無視される実害を past に経験している(layers-martin DECISIONS.md D14)。

**Decision**: `src/mapIntent.ts` のバリデーションは `spec/map-intent-vnext.md` のフィールド名(`type`/`label`/`area.bbox`/`provenance` 等)にそのまま従う。未知の top-level キーはエラーにしない(forward compatibility)が、Cartographer 側から新しいキーを要求することもしない。

**Consequences**: spec が改訂された場合、`src/mapIntent.ts` の必須フィールドチェック(`spec_version`/`goal`/`catalog_context`/`required_layers`/`provenance`)を追随させる必要がある。

## D3: `source_id` が解決できない場合は捏造せず `missing_layers` として可視化する

**Status**: Accepted

**Context**: Staff が起動時カタログ契約を守っていても(ADR 0002)、Cartographer が実際にレイヤーを解決する時点でネットワーク不調やカタログ側の変更により解決できないことがあり得る。`hfu/layers-martin` の `STAFF_PROMPT.md` は、Staff 側が存在しない `source_id` を捏造した実例(`lcmfc2_1`)を記録しており、Cartographer 側も「解決できないものは解決できないと正直に言う」対称的な振る舞いを持つべきと判断した。

**Decision**: `src/catalog.ts` の `resolveLayers` は、解決できなかった `source_id` を `missing` 配列として返す。`src/server.ts`/`src/render.ts` はこれを地図と一緒に目立つ形で表示し(`missing_layers` 相当の通知)、一部のレイヤーが解決できなくても解決できた分は描画する(全体を失敗させない)。

**Consequences**: `spec/background.md` §10 が提案しているより詳細なエラーレスポンス形状(`error_code`/`provenance_snapshot`/`suggested_action` 等)はまだ実装していない。これは spec 側でもまだ「非規範的な設計候補」の段階であり、正式化されたら追随する。

## D4: 任意レイヤーはスタイルに含めつつ既定で非表示にする

**Status**: Accepted

**Context**: `optional_layers` は Map Intent の設計上、必須ではないが提示する価値があるレイヤーを表す。

**Decision**: `src/style.ts` の `buildStyle` は `optional_layers` もMapLibreスタイルのソース・レイヤーとして構築するが、`layout.visibility` を `"none"` にして既定で非表示にする。`src/render.ts` は各任意レイヤーに対応するチェックボックスを描画し、クライアント側JSで `setLayoutProperty` により表示/非表示を切り替える。

**Consequences**: 任意レイヤーの数だけHTTPリクエスト(タイル取得)が増えるわけではない(MapLibreは非表示レイヤーのタイルを積極的に取得しない)。UIの複雑さは最小限(チェックボックスのみ)に留めた。

## D5: ベクトルタイルはソースのみ追加し、レイヤーは描画しない

**Status**: Accepted

**Context**: `hfu/layers-martin` は D7 決定により、MVT/PBFレイヤーの TileJSON から `vector_layers`(ソースレイヤー名やフィールド定義)を省略している(`layers.txt` だけからは復元できないため)。`source-layer` 名が分からないと、MapLibreの `fill`/`line`/`circle` レイヤーを意味のある形で構築できない。

**Decision**: `src/style.ts` はタイルURLの拡張子(`.pbf`/`.mvt`)でベクトルタイルを検出し、スタイルの `sources` にはベクトルソースとして追加するが、`layers` には対応するレイヤーを追加しない。かわりに `unrenderable` リストとして返し、`src/render.ts` がその旨をページ上に通知する。

**Consequences**: 2026-07-02 時点で `layers-martin` のカタログにベクトルタイルは0件のため、このパスは実データでは未検証(単体テスト `src/style.test.ts` でのみ検証)。将来 `layers-martin` にMVTレイヤーが追加された場合、この制約に実際にぶつかることになる。

## D6: 初期表示範囲のフォールバック順

**Status**: Accepted

**Context**: Map Intent の `area.bbox` や各レイヤーの `bounds` は必須ではなく(`layers-martin` では過半数のレイヤーで `bounds` が欠落している)、常に明確な初期表示範囲が得られるとは限らない。

**Decision**: `src/style.ts` の `computeInitialView` は次の優先順で初期表示を決定する: 1) `render_hints`(明示的な指定を最優先) 2) `area.bbox` 3) 必須レイヤー(`required_layers`)のうち `bounds` を持つものの結合範囲 4) 日本全体を映すデフォルト(`layers-martin` がGSI由来データであることに基づく)。

**Consequences**: このデフォルトは `layers-martin` を前提にしたものであり、将来別のLibraryカタログ(日本以外の地域等)を組み合わせる場合はデフォルト値の妥当性を見直す必要がある。

## D7: 依存パッケージのバージョンは学習知識ではなく実際のレジストリで確認する

**Status**: Accepted

**Context**: 実装中、MapLibre GL JSを「4.7.1が最新」という誤った前提でコードに書いていたが、実際には5.24.0が最新版だった(6.0.0はプレリリース中)。指摘を受けて確認したところ、Express・js-yaml・TypeScript・vitest・GitHub Actions の `actions/checkout`/`actions/setup-node` も軒並み古い前提(学習時点の知識)でバージョンを指定しており、実際にはいずれも新しいメジャーバージョンが出ていた。

**Decision**: 依存パッケージのバージョンを指定する際は、`npm view <pkg> version` 等で実際のレジストリの最新版を確認してから記述する。学習知識だけを頼りにバージョン番号を書かない。

**Consequences**: 今回は Express 4→5、js-yaml 4→5、TypeScript 5→6、vitest 2→4、`actions/checkout` v4→v7、`actions/setup-node` v4→v6 に更新した。いずれも実際にインストール・型チェック・テスト・CI実行まで確認して問題なかった。この確認プロセス自体を今後の実装でも継続する。

## D8: LLM説明パネルは中核パイプラインから分離し、ワンショットCLI呼び出しにする

**Status**: Superseded by [D20](#d20-この世代のcartographerにはllmを載せない)(2026-07-04)。この世代ではLLM機能自体を実装しないことにした。以下は当時の判断記録として残す。

**Context**: Cartographer の中核描画パスにLLMを持ち込まない方針(HANDOVER.md参照)がある一方、将来的に地図に添える自然文の説明を生成する機能はあってよいと考えている。ブラウザからCLIツールを直接実行することはできない。

**Decision(方針のみ、実装は未着手)**: 実装する場合、LLM呼び出しはワンショットのコマンドライン呼び出しとして行う。デフォルトのコマンドは `claude -p` とする。中核パイプライン(`mapIntent.ts`/`catalog.ts`/`style.ts`)には組み込まず、それらが無くても地図の描画自体は成立する分離された追加機能として実装する。

**Consequences**: 未実装。着手する際は、(a) `POST /` のレスポンスタイムにCLIプロセスの起動コストがどう影響するか、(b) CLI呼び出し失敗時に地図描画自体は成功させる分離をどう保つか、(c) サーバー環境に `claude` CLIが存在しない場合のフォールバック、を検討する必要がある。D9(デプロイ先)の決定により、実行環境は通常のLinuxプロセス(`child_process` が使える)であることが確定したため、この方針を変更する必要はなくなった。

## D9: デプロイ先は自己ホストの Raspberry Pi 4B + cloudflared

**Status**: Superseded by [D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする)(2026-07-04)。以下は当時の判断記録として残す。

**Context**: デプロイ先の検討にあたり、Cloudflare Workers 等のエッジランタイムへのデプロイも選択肢として検討した(D10参照)。エッジは無料枠が大きくサーバー管理が不要という利点があるが、D8 で決めた「LLM呼び出しはワンショットのCLIサブプロセス(`claude -p`)」という方針とは根本的に非互換(エッジランタイムには `child_process` もファイルシステムも無い)。

**Decision**: デプロイ先は自己ホストの Raspberry Pi 4B とする。`cloudflared`(Cloudflare Tunnel)経由で `cartographer.optgeo.org` として公開する。ポートを外部に開放する必要がなく、TLS終端は cloudflared 側が担う。プロセス管理は systemd で行う(`deploy/faceless-cartographer.service`)。デプロイ手順は `deploy/README.md` に記録した。

**Consequences**: D8 のCLIサブプロセス方式をそのまま維持できる(通常のLinuxプロセスなので `child_process` が普通に使える)。クラウドの月額費用が発生しない。一方で、可用性・スケーラビリティは自宅サーバーの制約を受ける(電源・回線・ハードウェア故障等はエッジやマネージドPaaSに比べて運用者の負担になる)。依存パッケージ(express, js-yaml, tsx 等)はいずれも Pure JS またはaarch64向けのプリビルドバイナリを持つため、Raspberry Pi (aarch64) 上での追加対応は不要と判断した(実機での動作確認は運用者側で行う)。CI/CDによる自動デプロイは v1 時点では組んでおらず、`deploy/README.md` に記載の手動手順(`git pull` → `npm install` → `systemctl restart`)で更新する。

## D10: Express から Hono への移行は今回見送る

**Status**: Moot(2026-07-04)。[D18](#d18-getpost-の二面性ではなく単一ページのクライアント側遷移spaとする)/[D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする)によりExpress自体を撤去したため、この判断は前提ごと無くなった。以下は当時の判断記録として残す。

**Context**: Hono はWeb Standardsベースで書かれており、Node/Cloudflare Workers/Deno/Bunなど複数ランタイムで同一コードが動く。当初、デプロイ先としてCloudflare Workersのようなエッジランタイムを検討していたため、移行の是非を検討した。現在のExpress利用は薄く(ルート2つ、ミドルウェア2つ)、テストもExpressのルーティング自体には依存していないため、移行コスト自体は小さいと分かった。

**Decision**: D9 でデプロイ先が Raspberry Pi 上の通常の Node プロセスに決まったため、Hono最大の利点(ランタイム横断・エッジ対応)を活かす場面が無くなった。Express は Pure JS でネイティブ依存も無く、aarch64上で問題なく動作する。移行によるDX上の細かな利点はあるが、「必要になるまで抽象化・移行はしない」という原則に従い、今回は見送る。

**Consequences**: 現状の `src/server.ts` はExpressのまま。将来、Cartographerの一部(特にLLMに依存しない中核描画パス)だけをエッジにも展開したくなった場合は、この判断を再検討する。その際も `src/mapIntent.ts`/`src/catalog.ts`/`src/style.ts` はExpress/Honoいずれにも依存しない環境非依存の実装になっているため、書き換えが必要なのは `src/server.ts`/`src/render.ts` の薄い層のみで済む見込み。

## D11: 地図全面レイアウトと Copy Map Intent 時の `render_hints` 反映

**Status**: Accepted

**Context**: `POST /` のレンダリング結果が、タイトル・地図・ボタン類を縦に積んだ通常のドキュメントレイアウトになっており、地図の可視領域が狭かった。実装パターンについて `UNopenGIS/7#869` の議論を参照するよう指示があった。同issueは別プロジェクト(Vite+PMTiles+Protomaps+3D地形サイト)向けの詳細仕様だが、「地図を全面表示し、タイトル/ステータス/コントロール類は地図の上に浮かせたパネルとして重ねる」というレイアウトパターンは流用できると判断した。ただし同issueは `hash: "map"` によるURLベースの位置共有も含んでおり、これは faceless-cartographer の [ADR 0001](https://github.com/UNopenGIS/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)(URLに地図の状態を持たせない)と正面から矛盾するため、意図的に採用しない。

あわせて、「Copy Map Intent」を押した時点の地図の表示状態(中心座標・ズーム)が、コピーされる Map Intent に反映されていなかった(常に投稿時点の原文をそのままコピーしていた)。

**Decision**:

- `POST /` のレンダリングページを、`#map` を `position: fixed; inset: 0` によるフルスクリーン表示にし、タイトル・goal・通知・任意レイヤーのチェックボックス・アクションボタンを、半透明+`backdrop-filter: blur()` のパネルとして左上に重ねる形に変更した。`UNopenGIS/7#869` のUIパターンは流用するが、`hash` によるURL状態共有は採用しない。
- 「Copy Map Intent」クリック時、js-yaml をクライアント側でも読み込み(ESM importでCDNから、`unpkg.com/js-yaml@.../dist/js-yaml.mjs`)、元の Map Intent をパースした上で、その時点の `map.getCenter()`/`getZoom()`/`getBearing()`/`getPitch()` を `render_hints` として上書き・追記してからシリアライズし、クリップボードにコピーするようにした。これは `map-intent-vnext.md` §5 が `render_hints` の用途として明記している「実用上の再オープンのため」に沿う挙動である。YAMLの読み書きに失敗した場合は、元のテキストをそのままコピーする安全側の挙動にフォールバックする。

**Consequences**: js-yaml 5.x はブラウザ向けのUMDバンドル(v3/v4にあった `dist/js-yaml.min.js` 相当)を廃止しており、ESM (`dist/js-yaml.mjs`) のみが配布されている。そのため、地図描画ページのスクリプトは `<script type="module">` に変更した(MapLibre GL JS自体は引き続きグローバル変数を公開する従来型の `<script>` タグで読み込み、モジュールスクリプトからは `maplibregl` グローバルとしてそのままアクセスしている)。Playwrightによる実ブラウザ確認で、パン・ズーム後にCopy Map Intentを押すと、実際の座標・ズームが `render_hints` に正しく反映されることを確認済み。フォームページ(`GET /`)のレイアウトは今回変更していない。

## D12: 入力には寛容、出力には厳格(3リポジトリ間の整合性確認で見つけたギャップの是正)

**Status**: Accepted

**Context**: `faceless-cartographer`/`hfu/layers-martin`/`UNopenGIS/staccato-spec` の3リポジトリ間の整合性を確認したところ、以下が見つかった。

1. `map-intent-vnext.md` §6-5 が定める「`sharing_policy.url_share` は faceless 構成では SHOULD false」というルールを一切チェックしていなかった。
2. `src/catalog.ts` の TileJSON 検証が「`tilejson` フィールドが `"3."` で始まるか」を要求しており、これはCartographerの設計方針(「入力には寛容、出力には厳格」)に反する厳しすぎる実装だった。バージョン文字列が想定と違うだけで、実際には `tiles` 配列があり十分に描画可能なドキュメントまで `missing` 扱いにしてしまう。

**Decision**:

- `sharing_policy.url_share: true` は拒否せず(SHOULDであってMUSTではないため)、その旨をパネルに警告として表示するだけに留める。
- `src/catalog.ts` の TileJSON 判定は `tilejson` フィールドの値を見ない。`tiles` が1件以上の文字列を含む配列であることだけを条件とする。これにより、`tilejson: "2.2.0"` のような未知のバージョンや `tilejson` フィールド自体が無いドキュメントも、`tiles` さえあれば描画対象として解決する。一方で `tiles` が無い・空・文字列でない場合は引き続き `missing` として扱う(最低限「描画に使える形か」は要求する)。

**Consequences**: `src/catalog.test.ts` に、実ネットワークを使わない `vi.stubGlobal('fetch', ...)` によるモックテストを追加し、(a) `tilejson: "2.2.0"` でも `tiles` があれば解決されること、(b) `tiles` が無ければ引き続き `missing` になることの両方を確認した(実際の `layers-martin` は常に `tilejson: "3.0.0"` を返すため、この分岐は実データでは検証できない)。この方針は、Cartographerが将来 `layers-martin` 以外の(TileJSONバージョンの書き方が微妙に異なるかもしれない)Libraryカタログとも組み合わされることを見越したものでもある。

## D13: `GET /` トップページに現在のStaffプロンプトを表示する

**Status**: Accepted

**Context**: この Cartographer と組み合わせて使う Staff エージェントのプロンプトは `hfu/layers-martin` の `STAFF_PROMPT.md` にある。運用者・開発者がこの Cartographer にアクセスした際、そのまま Staff 側の設定に使えるプロンプトが手元にあると便利である。

**Decision**: `GET /` のフォーム下部に折りたたみ(`<details>`)で「現在の Staff プロンプト」を表示する。表示内容は `STAFF_PROMPT.md` から実際に Staff のシステムプロンプトに追加すべき部分(````text ... ```` で囲まれたフェンス内)だけを抽出したもの。取得は `src/staffPrompt.ts` が `raw.githubusercontent.com` から都度取得し(GitHubの生ファイルなので追加認証は不要)、10分間メモリキャッシュする。取得に失敗した場合は `src/staff-prompt-fallback.txt`(2026-07-03 時点のスナップショット)にフォールバックする。

**Consequences**: `GET /` が外部リポジトリへの実際のライブ依存を1つ持つことになる(Cartographerの中核描画パス自体は引き続き依存しない — `POST /` の描画ロジックには一切関与しない)。フォールバックファイルは手動更新が必要で、`STAFF_PROMPT.md` の構成(フェンス記法)が変わった場合、抽出に失敗して全文表示にフォールバックする(壊れた表示にはならない設計)。

**2026-07-04 追記**: 静的サイト化([D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする))に伴い、取得方式を「リクエスト時にサーバーがライブ取得(10分キャッシュ)」から「ビルド時に取得してバンドルに焼き込む」に変更した([D19](#d19-staffプロンプトの取得はビルド時fetchに変更する))。表示すること自体の決定(この節)は変わっていない。

## D14: 凡例(現在表示中のレイヤーのみ・右下・折りたたみ)

**Status**: Accepted

**Context**: [layers-martin D18](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d18-tilejsonを拡張しlegend_image_urlを新設する) で `legend_image_url` が追加されたことを受け、画面上に実際に凡例を表示できるようになった。表示方針として、(a) 表示中レイヤーのみか全レイヤーか、(b) 画面上の配置、(c) 常時展開か折りたたみか、の判断が必要だった。

**Decision**: MapLibreの attribution 表示が「現在表示中のレイヤーのみ」を合成する仕様([layers-martin D17](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d17-faceless-cartographer-との整合性確認catalog_contextversion-と-attribution可視性の文書化)参照)に凡例も揃える。Staffが多数のレイヤーを送ってきた場合でも画面が凡例で埋め尽くされないようにするための一貫した設計判断でもある。配置は「凡例は右下」というウェブ地図の慣習に従う。`<details>`/`<summary>` によるネイティブの折りたたみUIとし、追加のJSライブラリは使わない。任意レイヤーのチェックボックスをトグルすると、凡例の中身もリアルタイムで更新される。

**Consequences**: 凡例を持たないレイヤーのみが表示されている場合、凡例パネル自体が非表示になる(`data-has-entries="false"`)。モバイル幅では `max-width: min(16rem, calc(100vw - 2rem))` で画面からはみ出さないようにしている。

## D15: 構造化エラーフィードバックはMap Intentへの埋め込みで環流させる

**Status**: Accepted

**Context**: `spec/background.md` §10 が提案する構造化エラーレスポンス(`error_code`/`provenance_snapshot`等)は、専用のJSON APIとして実装することもできたが、そもそも現状この Cartographer に機械的なクライアントは存在せず(ADR 0001の人間介在フローが前提)、専用API化は現時点では過剰实装になると判断した。

**Decision**: `missing_layers`/`unrenderable_layers` の情報を、専用APIではなく「Copy Map Intent」でコピーされる Map Intent 自体に `cartographer_feedback`(非規範的な拡張フィールド)として埋め込む。問題が無い場合はこのフィールド自体を付与しない。これにより、User が Map Intent をコピーして Staff に戻した場合、高性能な Staff エージェントであればこの `cartographer_feedback` を読み取って次の応答に反映できる、という**任意の(optional)フィードバックの環流経路**が生まれる。Cartographer 側から Staff への直接通信は発生させず、あくまで人間が運ぶ Map Intent というテキストに相乗りさせるだけなので、faceless の設計(URLで状態を持たない、人間介在の受け渡し)とも整合する。

**Consequences**: `cartographer_feedback` は `map-intent-vnext.md` にはまだ存在しない、このプロジェクト独自の非規範的拡張である。D2で確立した「未知キーは無視されてよい」という前提の通り、これを理解しない Staff/Cartographer 実装からは単に無視される。将来 `UNopenGIS/staccato-spec` 側で `background.md` §10 の構造化エラー形式が正式化された場合、フィールド名・形状をそちらに合わせて改名する可能性がある。

## D16: 必須レイヤー全滅時は空の地図をそのまま出す

**Status**: Accepted

**Context**: `required_layers` の全件が解決に失敗した場合の挙動を検討した。専用の失敗画面を作る案もあったが、実装コストと必要性を天秤にかけた。

**Decision**: 専用の失敗画面は作らない。全件失敗しても、レイヤーの無い(背景も無い)空の地図がそのまま描画され、`missing_layers` 通知パネルで全件が missing として表示される。既存の「一部解決できても描画は続ける」(D3)という設計をそのまま延長した形であり、コード変更は不要だった。

**Consequences**: 将来、空の地図が実際に使い勝手が悪いと分かった場合(例えば「地図がまっさら」の意味が利用者に伝わりにくい等)、専用の失敗画面や、せめて白地図等のCartographer側デフォルト背景を差し込む案を再検討してよい。

## D17: 静的サイト化ではなく現状のExpress/Raspberry Piを維持、デプロイは`just`/`.env`で統一

**Status**: Superseded by [D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする)(2026-07-04)。D8(LLM CLIサブプロセス)を見送ったことで、この判断の前提が変わった。以下は当時の判断記録として残す。

**Context**: 実装が進み、中核パイプライン(`mapIntent.ts`/`catalog.ts`/`style.ts`)が環境非依存であること、`layers-martin` のカタログがCORSを許可していることが分かった時点で、「そもそも動的サーバーである必要があるか、静的サイト化できないか」を改めて検討した。

検討の結果、2点の理由で現状維持に決めた。

1. `ADR 0001` は `POST /` を文字通りサーバー側で受理する挙動として規定しており(「`POST /` MUST accept Map Intent and render map output」)、純粋な静的サイト(GitHub Pages等)ではPOSTを処理できず、フォーム送信をクライアントJSで代替する形になる。これは精神は満たすが文言には反する。
2. D8(LLM説明パネルを `claude -p` のCLIサブプロセスで呼ぶ方針)を維持する場合、Cloudflare Workers/Pages Functions 等のエッジ・サーバーレス関数では `child_process` が使えず両立しない。D8を維持する意思を確認した上で、通常のNode実行環境(Raspberry Pi)を続ける決定をした。

**Decision**: アーキテクチャ(Express + Raspberry Pi 常駐プロセス)は変更しない。その代わり、実際のデプロイを容易にするため、`Justfile` と `.env` によるワークフローを整備した。

- `Justfile`: `just serve` でサーバー起動(`node_modules` が無ければ自動でインストールしてから起動。既に存在すれば再インストールはスキップし、再起動のたびにネットワーク・npmレジストリへの到達性に依存しないようにしている)。`just dev`(ファイル変更で自動再起動)、`just check`(typecheck + test、CIと同じ)、`just install` も用意。
- `.env.example`: `PORT` のみを持つ最小構成。`cp .env.example .env` でコピーして使う。`.gitignore` に `.env` を追加。
- `src/server.ts` 自体は変更していない(元々 `process.env.PORT` を読むだけだったので、`.env` の値注入は `tsx --env-file-if-exists=.env`(Node 22 のネイティブ `.env` サポート)側の責務とし、`dotenv` 等の追加npm依存は入れていない)。
- `deploy/faceless-cartographer.service` の `ExecStart` を `npm run start` から `/usr/local/bin/just serve` に変更し、`PORT` の指定はユニットファイル内ではなく `.env` に一本化した(手動起動とsystemd起動で設定の二重管理を避ける)。
- `deploy/README.md` を、実際に「clone → `.env` をコピー → `just serve`」で起動できる手順に更新した。

**Consequences**: `git clone` してから `cp .env.example .env && just serve` の2手順(3コマンド)でサーバーが立ち上がることをローカルで実際に確認した(初回はnpm installが走り、2回目以降はスキップされて即起動することも確認済み)。将来的にD8のCLIサブプロセス方針自体を見直す(例: HTTP API呼び出し方式に変更する)場合、この判断(静的サイト化しないこと)も同時に再検討の対象になる。

**2026-07-04 追記**: 結局この判断は約1日で覆った。D8自体を見送ったことで前提が変わったため([D20](#d20-この世代のcartographerにはllmを載せない)参照)、静的サイト化しない理由が無くなった。`Justfile`/`.env`/systemdユニット一式は [D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする) で撤去した。

## D18: GET/POST の二面性ではなく、単一ページのクライアント側遷移(SPA)とする

**Status**: Accepted

**Context**: D1 で「`POST /` は文字通りサーバー側のHTTP POSTとして実装する」と決めていたが、これは実装してみると次のような「トリッキーさ」を伴っていた。

- `GET /` と `POST /` という2つの別レスポンスを、同じサーバーの同じルートで作り分ける必要があり、`src/server.ts`/`src/render.ts` の責務が「サーバー」と「HTMLテンプレート生成」に分かれ、両者の対応関係を頭の中で保持しながら実装する必要があった。
- 実際にはフォーム送信も地図描画も、ブラウザの中で完結する処理(YAMLパース・カタログfetch・スタイル構築・MapLibre初期化)であり、サーバーは実質「HTML文字列を組み立てて返すだけ」の薄い層になっていた。
- D20(この世代ではLLMを載せない)が決まったことで、「サーバーでなければできないこと」がこの時点で実質何も無くなった。

**Decision**: 単一の `index.html` + `src/main.ts` によるSPA(Single Page Application)とする。`renderFormView`/`renderMapView`(`src/render.ts`)が `#app` 要素の中身を書き換えることで画面を切り替える。フォームの送信は `<form>` の `submit` イベントを `preventDefault()` して `main.ts` 側のハンドラに渡すだけで、実際のHTTPリクエストは発生しない。「戻る」ボタンも同様にDOM書き換えで前の画面に戻る。ブラウザのURL・履歴は一切変化しない(遷移という概念自体が無い)。

`UNopenGIS/staccato-spec` の `ADR 0001` は「`GET /` MUST return an HTML page」「`POST /` MUST accept Map Intent and render map output」という文字通りの規定を持つが、SPAでは「`POST /` へのHTTPリクエスト」自体が発生しない。これはADR 0001の**精神**(URLに状態を持たせない、Map Intentのテキストが共有の一次artifact、人間が仲介する受け渡し)には完全に沿うが、**文言**とは厳密には一致しない、意図的な逸脱である。むしろSPAはURLが一切変化しないぶん、「faceless」の趣旨をより徹底して満たす形になっているとも言える。

**2026-07-06 追記**: この逸脱を明示的に記録するだけでなく、spec側の文言をSPA実装に合わせて明確化する提案(ADR 0003)を `UNopenGIS/staccato-spec` へPRとして提出した([UNopenGIS/staccato-spec#1](https://github.com/UNopenGIS/staccato-spec/pull/1))。このリポジトリ(`hfu/faceless-cartographer`)自体を「実際に動く証拠」として引用している。

**Consequences**: D1・D17 を置き換える。`express` 依存を削除。`src/server.ts` を削除。`src/mapIntent.ts`/`src/catalog.ts`/`src/style.ts` は元々環境非依存な純粋関数として書いてあったため、無改修で移植できた(この設計判断が今回活きた形になる)。`src/render.ts` は「HTML文字列を返す関数」から「DOMに書き込み、イベントリスナーを結線する関数」に書き換えた。ビルドツールは `hfu/attachbar` の `examples/mgrs-pmtiles` に倣い Vite を採用した(D21参照)。

## D19: Staffプロンプトの取得はビルド時fetchに変更する

**Status**: Accepted

**Context**: D13(`GET /` に現在のStaffプロンプトを表示する)は、サーバーがリクエストごとに(10分キャッシュ付きで)ライブ取得する実装だった。D21(静的サイト化)により、リクエストを受けて処理するサーバー自体が無くなる。

**Decision**: `scripts/fetch-staff-prompt.mjs` を `npm run build` の `prebuild` フックとして実行し、`hfu/layers-martin` の `STAFF_PROMPT.md` を取得して `src/staff-prompt.txt` に書き込む。アプリ本体(`src/main.ts`)はこのファイルを `?raw` インポート(Vite)でビルド時にバンドルへ焼き込むだけで、実行時のfetchは一切行わない。取得に失敗した場合は既存の `src/staff-prompt.txt` を上書きしない(直前の成功時点のスナップショットを保持する、フェイルセーフ)。

**Consequences**: サイトは完全に静的(実行時に外部リポジトリへ依存しない)になった。表示内容の鮮度は「最後にビルドされた時点」までとなるため、`layers-martin` 側の `STAFF_PROMPT.md` 更新を追随させるには再ビルドが要る。これは [D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする) の日次cronで解決する。

## D20: この世代のCartographerにはLLMを載せない

**Status**: Accepted

**Context**: D8 は、地図に添える自然文の説明を生成するLLM機能を、`claude -p` のワンショットCLIサブプロセスとして実装する方針だった。この世代の `faceless-cartographer` が実際に扱うデータは、`hfu/layers-martin` のカタログが示す通り画像タイル(ラスター)が中心であり(D5: ベクトルタイルは2026-07-04時点で0件)、LLMによる自然文説明が無くても地図としては十分に完結する。CLIサブプロセスの実行には実プロセス(Node常駐サーバー)が必要で、これがD9(Raspberry Piデプロイ)を選んだ主な理由になっていた。

**Decision**: この世代の Cartographer にはLLM機能を組み込まない。将来LLMによる説明機能が欲しくなった場合は、Cartographer本体に埋め込む(CLIサブプロセスを起動する等)のではなく、**別の呼び出し可能なAPI**として切り出す。Cartographer側は、そのAPIをオプションで呼び出す(あるいはAPIの結果を表示するだけの)薄いクライアントに留め、コア機能(地図描画)がAPIの有無に依存しないようにする。

**Consequences**: D8 を置き換える。LLMが不要になったことで、Cartographer全体を静的サイト化する制約が無くなった([D21](#d21-静的サイトとしてdocsに出力しgithub-pagesでホストする)参照)。将来API方式で実装する際は、認証・レート制限・コストの管理を誰がどこで担うか(Cartographer自体は静的なので、API呼び出しには別途バックエンドかサーバーレス関数が要る)を改めて検討する必要がある。

## D21: 静的サイトとして `docs/` に出力し、GitHub Pagesでホストする

**Status**: Accepted

**Context**: D18(SPA化)とD20(LLMを載せない)が決まったことで、Cartographerが動的サーバーである必要が無くなった。デプロイ先の再検討にあたり、`hfu/layers-martin`(`docs/` をGitHub Pagesで公開)と `hfu/attachbar`(`examples/mgrs-pmtiles` を同様に `docs/` へViteビルドしGitHub Pages公開)という、ユーザーが日常的に使っている2つの既存パターンを参考にした。

**Decision**: `vite.config.ts` で `base: './'`(GitHub Pagesのプロジェクトサイトは `https://<user>.github.io/<repo>/` というサブパスで配信されるため相対パス化)・`build.outDir: 'docs'`・`build.emptyOutDir: true` を設定し、`npm run build` で `docs/` に出力する。`public/.nojekyll` を配置し、Jekyll処理を無効化する(`hfu/attachbar` と同じ)。`docs/` は `.gitignore` の対象外とし、コミットしてGitHub Pages(Settings → Pages → Deploy from a branch → main:/docs)から配信する。

ビルドの自動化は `.github/workflows/build-docs.yml` で行う: `main` への push 時、および毎日 UTC 19:00 の cron(`hfu/layers-martin` の日次カタログ更新とは独立に、Staffプロンプトのビルド時fetch(D19)を追随させるため)に、typecheck・test・buildを実行し、`docs/` に差分があれば `hfu/layers-martin` の `build-catalog.yml` と同じ「差分があればコミット・無ければ何もしない」パターンでコミット・pushする。

Raspberry Pi + cloudflared によるデプロイ一式(`deploy/` ディレクトリ、systemdユニット、`Justfile` の `serve`、`.env`)は撤去した。

**Consequences**: D9・D17 を置き換える。`express`/`@types/express` 依存を削除。ホスティング費用が完全に無くなり、可用性はGitHub Pagesに委ねられる(自宅サーバーの電源・回線・故障リスクから解放される)。将来D20を再検討してLLM機能を追加する場合、この判断も連動して見直す必要がある(コア機能は静的のまま維持し、LLM部分だけ別APIとして追加する形を想定)。

## D22: Staffプロンプトにコピーボタンを追加し、`<summary>`内のリンクを外に出す

**Status**: Accepted

**Context**: 「現在の Staff プロンプト」の折りたたみセクションに、クリップボードへのコピーボタンを追加する依頼があった。実装・検証の過程で、既存の(この依頼とは無関係の)不具合が見つかった: `<summary>` タグ内に `target="_blank"` のリンク(取得元の `STAFF_PROMPT.md` へのリンク)を埋め込んでいたため、利用者がその文字列部分をクリックすると `<details>` の開閉ではなくリンクの新規タブオープンが優先され、開閉が阻害されるケースがあった(Playwrightでの実クリック操作で再現・確認)。

**Decision**: 「Copy Map Intent」ボタン(D11)と同じパターンで「Copy Staff Prompt」ボタンを追加した。クリップボードへコピーするのは表示用にHTMLエスケープしたテキストではなく、`extractStaffPromptBlock` が返す生のプレーンテキスト。あわせて、`<summary>` からリンクを除去し、`<summary>現在の Staff プロンプト</summary>` という短いテキストのみにした。取得元へのリンクは、`<details>` の中身(展開後に見える説明文中)に移動した。これにより `<summary>` 全体が確実に開閉のトグル領域として機能する。

**Consequences**: Playwrightで、(a) `<summary>` クリックで `<details>` が開くこと、(b) 「Copy Staff Prompt」でクリップボードに正しい内容(プロンプト本文、約6,900文字)が入ること、(c) ボタンラベルが一時的に "Copied!" に変わることを確認した。既存の19件のテストと型チェックには影響なし(この変更はDOM/UIのみ)。

## D23: `vector_layers`スキーマが既知のベクトルタイルは幾何タイプ別に汎用描画する。複数カタログ統合はaggregatorを作らずMap Intentの複数`active_catalogs`で実現する

**Status**: Accepted

**Context**: layers-martin側で「stars.optgeo.org/catalog(実際に稼働しているMartinサーバー)を追加できないか」という検討依頼があった。目玉は国土地理院最適化ベクトルタイル(`bvmap`)で、これがStaffにベースマップベクトルタイルという新しい選択肢を開く。検討の結果、専用のaggregatorリポジトリを作る必要はなく、Map Intentの`catalog_context.active_catalogs`が最初から複数カタログの併記を許容している(spec上、`type: "layers_txt"`のlayers-martinと`type: "martin"`のstars.optgeo.orgを1つのintentに混在させることに何の障害もない)ことをNode script実測で確認した(オプションC)。一方、faceless-cartographer側には別の問題があった: `bvmap`のようなベクトルタイルはD5・D7の時点で「レンダリングできないので`unrenderable`として無視する」方針だった。この方針のままでは、stars.optgeo.orgを繋いでも目玉であるはずのベクトル基盤地図が画面に何も表示されない。

**Decision**: 2つの変更を行った。(1) `catalog.ts`・`resolveLayers`は変更不要 -- 複数`active_catalogs`はすでに扱えていた。統合(aggregation)のための別リポジトリは作らない。(2) `style.ts`に、TileJSONの`vector_layers`配列(実サーバーが実際のMVT内容を検査して返す、source-layerごとのスキーマ情報)が存在する場合の描画パスを追加した。特定のカタログのレイヤー命名規則に依存しないよう、レイヤー名ごとに意味を推測するのではなく、`source-layer`ごとに`["geometry-type"]`式でフィルタしたfill/line/circleの3スタイルレイヤーを機械的に生成する(`buildVectorSubLayers`)。`vector_layers`が存在しない(=hfu/layers-martinのようにlayers.txtからは復元できない)ベクトルタイルは、従来通り`unrenderable`として報告するのみに留める。また、ベクトルタイルかどうかの判定を、URLの拡張子(`.pbf`/`.mvt`)だけでなく`vector_layers`の有無でも行うようにした -- stars.optgeo.orgの実際のタイルURL(`https://stars.optgeo.org/bvmap/{z}/{x}/{y}`)には拡張子がないため。

**Consequences**: `catalog.test.ts`に、layers-martin(`std`)とstars.optgeo.org(`bvmap`)を1つのintentから同時解決する統合テストを追加(実ネットワーク、両catalog_idが正しく紐づくことを確認)。`style.test.ts`に、`vector_layers`が既知のケース(source-layerごとに3スタイルレイヤー生成)と、空配列は従来通り`unrenderable`のままであることを確認するテストを追加。Playwrightで実際にstars.optgeo.orgの`bvmap`を読み込み、東京都心の道路・水域・建物のポリゴンが実際に描画されることをスクリーンショットで確認した。Cartographerは今後、`vector_layers`を公開するどのMartinサーバーに対しても(stars.optgeo.orgに限らず)同じ仕組みで汎用描画できる。ジオメトリタイプ別の配色は暫定的なもので、レイヤー名(例: `BldA`=建物、`RdCL`=道路中心線)に応じた意味的なスタイリングは将来のバックログ。

## D24: 背景地図を bvmap グレースケール + Mapterhorn hillshade + terrain に固定して常時描画する

**Status**: Accepted

**Context**: Cartographerが Map Intent の `required_layers` と `optional_layers` から Map Intent-driven な Map を生成するアーキテクチャは D3-D23 で確立済みだが、デフォルトの背景地図は `hfu/layers-martin` カタログが提供する `"std"` (GSI標準地図の画像タイル)のままであり、ウェブ地図として見た目が古めかしい。一方、`hfu/kitavolca`(北海道火山図 VBM/VLCM を PMTiles 化するプロジェクト)は同じ課題に先に取り組んでおり、`docs/style.json`(commit `0c23a4a`)に以下を実装・デプロイ・検証済み: (1) GSI最適化ベクトルタイル(`bvmap`、`stars.optgeo.org` 配信)の公式スタイルを輝度ベースで全色グレースケール変換(198レイヤー)、(2) Mapterhorn(`tiles.mapterhorn.com`)の terrarium encoding 3D地形を raster-dem ソースとして hillshade + terrain の両方に使用(`maxzoom: 14` で高ズームでの404対応)、(3) レイヤー順序を Band A(基礎的な地図要素) + Band B/C(道路/建物/ラベル) に分割し、その間に主題データを挿入可能な構造設計。

この kitavolca の設計と実装を faceless-cartographer の既定背景として取り込むことで、見た目を現代化する。また、kitavolca の「Band A と Band B の間」という挿入点が、**正にこのリポジトリが Map Intent の `required_layers`/`optional_layers` を差し込むべき位置**であることを理解し、実装する。

**Decision**: (1) `hfu/kitavolca` の `docs/style.json`(commit `0c23a4a`)から bvmap + mapterhorn ソース/レイヤーを抽出し、vlcm/vbm/seamlessphoto を除外した形で `src/base-style.json` として一度だけ移植・vendoring する(ビルド時 live fetch ではなく、kitavolca 側の将来変更の自動追随を避け、外部ビルド時依存を増やさないため)。(2) `src/style.ts` の `buildStyle()` を改修: 背景レイヤー(`baseStyle.before`/`baseStyle.after`) と主題レイヤー(Map Intent 解決済み)を `[...baseStyle.before, ...thematic, ...baseStyle.after]` で構成。これにより、Staff が `source_id: "std"` を要求しなくなっても bvmap 背景は常時描画。(3) `src/render.ts` で `localIdeographFontFamily: 'sans-serif'` (optimal_bvmap のCJK グリフPBF取得を避け、ブラウザシステムフォント使用)と `TerrainControl` を追加。(4) `EXAMPLE_MAP_INTENT` から `"std"` レイヤーを削除(冗長化)。(5) `tsconfig.json` に `"resolveJsonModule": true` を追加。

**Consequences**: 背景地図が Map Intent に依存しない既定動作になる。旧来の意図で `source_id: "std"` を要求する Map Intent も無改修のまま解決・描画され続けるが、その `"std"` レイヤーは実際には bvmap より上に重なり、背景として見えなくなる(冗長かつ無害)。この動作は Postel's law(入力には寛容に)に従い、特別扱いのコードは追加しない。kitavolca 側で bvmap スタイル・レイヤー順が将来変更されても自動追随しない(vendored snapshot のため)が、その場合は `src/base-style.json` を手動で再度抽出・更新することで対応する。`gsi-cyberjapan.github.io/optimal_bvmap` へのビルド時外部依存(glyphs/sprite URL)が新規に発生。D6 で定めた Japan-wide の既定ビューは bvmap も GSI由来のため、整合性は維持される。

## D25: デジタル庁デザインシステムへの部分準拠(トークンとアクセシビリティパターン採用)

**Status**: Accepted

**Context**: バックログの「デジタル庁デザインシステムへの準拠」項目に、準拠レベル(a:フル採用 vs b:トークンのみ vs c:参考のみ)を確定させる判断が待っていた。[design.digital.go.jp](https://design.digital.go.jp/) の実装を調査した結果: `@digital-go-jp/design-tokens`(npm, MIT License, v2.0.1)は unpkg CDN 経由で配信され、色プリミティブ・セマンティックカラー・typography・spacing・border-radius・elevation 等のトークンを CSS カスタムプロパティとして提供している。コンポーネント(Button/Checkbox/Disclosure等)の実装は `digital-go-jp/design-system-example-components-html` の HTML サンプルのみにあり、npm パッケージとしては配布されていない。

**Decision**: 準拠レベル:トークン+アクセシビリティパターンを採用し、コンポーネント CSS は vendoring する。(1) `index.html` の `<head>` に `@digital-go-jp/design-tokens` を CDN 経由で追加(バージョン固定)。(2) `src/dads-components.css` を新規作成し、`digital-go-jp/design-system-example-components-html`(commit `3b34f4c`)から必要なクラスのみを移植: `global.css`(`:focus-visible` outline、リンク配色)、`button.css`(`.dads-button[data-type="solid-fill"|"outline"][data-size="md"]`)、`checkbox.css`(`.dads-checkbox[data-size="sm"]`)、`disclosure.css`(`.dads-disclosure`)。ソースコミットハッシュをファイル冒頭コメントに記録(D24 と同じ vendoring パターン)。(3) `src/render.ts` のマークアップを変更: ボタンに `class="dads-button"` + `data-type`/`data-size` 属性を追加、チェックボックスを `.dads-checkbox` 構造に変更(既存のイベントリスナーは流用)、`<details>`/`<summary>` に `.dads-disclosure` クラスと開閉アイコン SVG を追加。(4) Notice(`.notice`)をセマンティックカラートークン(`--color-semantic-warning-yellow-1`/`--color-semantic-error-1`/`--color-neutral-solid-gray-536`)で装飾。(5) フォント: Google Fonts の Noto Sans JP を読み込まず、`--font-family-sans` トークンの値(デフォルトはシステムフォント)にフォールバック(D24 と一貫させる)。

**Consequences**: 視覚的には政府デザインシステムに準拠した UI になる一方、notification-banner 等の複雑なコンポーネントは完全に移植せず、この UI スケール(フォーム1画面+地図パネル)に見合った軽量実装を維持。`@digital-go-jp/design-tokens` の将来のメジャーバージョンアップ時には `index.html` の CDN URL(バージョン文字列)を手動更新する必要がある。コンポーネント CSS は vendored snapshot のため、デザインシステム側の将来変更は自動追随しない。意図的な逸脱として、Notice は DADS の `notification-banner`(アイコン+見出し+閉じるボタン+タイムスタンプの複雑な grid レイアウト)の完全再現ではなく、色トークンのみの軽量実装。

## D26: 等高線を主題レイヤーの上に描画する

**Status**: Accepted

**Context**: ユーザーが「等高線も塗り面(主題レイヤー)の上に描画されてほしい」と要望。地形と警戒区域等の関係性を視覚的に理解しやすくする目的。現在のレイヤー順序(`[...before(等高線含む), ...主題レイヤー, ...after]`)では等高線が主題レイヤーの下に隠れるため、見た目に反映されない。

**Decision**: `src/base-style.json` の `before` セクションから等高線レイヤー(bvmap-等高線・bvmap-等深線)を抽出し、新しい `contours` セクションに分離する。`src/style.ts` の `buildStyle()` で、レイヤー合成順を `[...baseStyle.before, ...thematicLayers, ...contours, ...baseStyle.after]` に変更する。これにより等高線は主題レイヤーの直後・道路/ラベルの前に描画される。

**Consequences**: 等高線が主題レイヤーの上に見えるようになり、地形と主題データの視覚的関係が明確化。等高線は細い線(line layer)なので、主題レイヤーのパターンフィル(点や線模様)の上に重ねても読みやすく、視認性に問題なし。視覚的優先度として「ラベル > 道路 > 等高線 > 主題レイヤー」が自然で一貫性がある。

## D27: `docs/` を vite-plugin-singlefile で単一ファイル化する

**Status**: Accepted

**Context**: Issue #1 に「`docs/` 生成物をシングルファイルにする」と要望。現在は HTML・JS・CSS が分かれており、HTTPリクエスト数が3(HTML/JS/CSS)。単一ファイル化することで HTTP リクエスト削減、配布・管理の簡潔化。

**Decision**: `vite-plugin-singlefile` npm パッケージをインストールし、`vite.config.ts` で `viteSingleFile()` プラグインを有効化。プラグインが自動的にビルド時に JS/CSS を `index.html` に埋め込む。

**Consequences**: `docs/` に `index.html` と `.nojekyll` のみが出力されるようになり、`docs/assets/` ディレクトリが消滅。ファイルサイズ: `index.html` ~1.2MB (gzip: ~317KB)。HTTP リクエスト数が 3 → 1 に削減。`docs/index.html` 単独ですべての機能が動作するため、ファイル配布やミラーリングが単純化。ビルドサイズ警告(chunk > 500KB)は MapLibre のバンドル由来で回避不可能だが、gzip圧縮後は許容範囲。

## D28: デフォルト Map Intent を札幌の地形分類に更新し、ハイブリッド対応 STAFF_PROMPT を実装テスト

**Status**: Accepted

**Context**: `hfu/layers-martin` が `STAFF_PROMPT.md` をハイブリッド対応(オンライン/オフライン両立)に再設計した([layers-martin D23](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d23-staff_promptmdをハイブリッド対応オンラインオフライン両立に設計する))。新しい「オフラインフォールバック」セクションが実用的に機能するか、実装テストが必要だった。テスト入力：「札幌の地形分類を見たい」。

**Decision**: 
- デフォルト Map Intent を既存の「土砂災害警戒区域」から「札幌市の地形分類」に変更
- STAFF_PROMPT の guidance に従って生成: 札幌 bbox `[141.0, 42.88, 141.5, 43.25]`、`lcmfc2`(治水地形分類図) + `relief`(色別標高図) + `lcm25k_2012`(土地条件図、補助)
- 生成した Map Intent が layers-martin カタログで完全に解決可能なことを検証: 全 source_id 存在確認、メタデータ適切、minzoom/maxzoom 妥当
- `src/render.ts` の `EXAMPLE_MAP_INTENT` (行6-33)を新バージョンに置き換え

**Consequences**:
- ハイブリッド対応 STAFF_PROMPT が実用的に機能することを実装で証明。オンライン環境（カタログ fetch）でも、オフライン環境（参考リスト）でも、同じ入力から有効な Map Intent が生成される
- デフォルト Map Intent が地形・土地条件というより地理学的な内容に(従来の災害リスク中心から拡張)。プリフィル表示が多角的な地図用途をカバーするようになった
- faceless-cartographer UI を開いたユーザーには、札幌市の地形分類が既定で表示される。実装テストとしての特性を残しつつ、実用的な例として機能
- 可逆的な決定: 将来別のテストケースが必要なら、この EXAMPLE_MAP_INTENT は再度変更可能。layers-martin D23 の成熟度を確認した後、より汎用的なサンプルに戻してもよい

## D29: Vector fill layer で hillshade を透視するため blend-mode を導入

**Status**: Accepted (試験的実装)

**Context**: ユーザー報告: 「塗りポリゴンがあるところで hillshade の影が消えてしまう。土砂災害危険区域の表示の場合、これはとても惜しい」。現在の style 構成では `[...before(hillshade含む), ...thematic_polygon_fills, ...]` であり、不透明な fill (opacity: 0.25) が hillshade を覆い隠す。

技術的背景:
- MapLibre GL JS は layer の composite blending をサポート
- Paint-level な blend-mode で「乗算合成(multiply)」を適用可能
- Multiply blend: 基底レイヤーを保持しつつ、上位レイヤーの色を合成

**Decision**:
- Generic vector layer の fill sub-layer (`src/style.ts` L39-47) に `'paint-blend-mode': 'multiply'` を追加
- これにより、主題レイヤーの fill が hillshade を透視
- テスト対象: 土砂災害警戒区域の Map Intent (05_dosekiryukeikaikuiki等)
- Typecheck/build/test 全て OK、実装準備完了

**Consequences**:
- Fill layer で hillshade が視認可能に → 地形と警戒区域の視覚的関係が明確化
- Blend-mode は MapLibre standard feature → ブラウザ互換性懸念なし
- Style のみの変更 → カタログ・Map Intent スキーマに影響なし
- 未検証: 実際のブラウザ rendering での視覚効果（本番環境での確認が必要、これは次フェーズの QA で実施予定）

**将来の改善候補**:
- Line layer にも同様に blend-mode 適用（line-blur/line-opacity との組み合わせ検証）
- Zoom-dependent opacity: ズーム level に応じて opacity を動的に変更する sophistication

## D30: maplibre-gl-layer-control による レイヤーパネル統合

**Status**: Accepted (試験的実装)

**Context**: ユーザー要求: 「maplibre-gl-layer-control を加えてレイヤーをコントロールできるようにしよう」。現在の faceless-cartographer は optional_layers のみチェックボックス toggle でしか制御不可。レイヤー順序変更・グループ化が欲しい。

同時に懸念: 「ベクトルタイルの全レイヤーが入ってしまうと長くなり過ぎるのではないか」→ 解決策: generic sub-layers (fill/line/circle) を自動グループ化、UI では source_id 単位で表現。

**Decision**:
- `npm install maplibre-gl-layer-control` を実施
- `src/render.ts` に LayerControl インポート + 統合ロジック追加
- Layer definitions を動的に生成:
  - Style layers を source_id でグループ化（sub-layer 詳細は隠蔽）
  - Required layers → 「主題レイヤー」グループ
  - Optional layers → 「補助情報」グループ（collapsed 状態）
- `map.addControl(layerControl, 'bottom-right')` で右下に配置
- Graceful degradation: LayerControl 初期化失敗時は console.warn で継続

**Consequences**:
- UI 層数を管理可能に: 25-30 internal layers → UI 上は 4-10 items に圧縮
- ユーザーが視認しないレイヤー管理詳細（fill/line/circle sub-layers）を自動制御
- Build size: ~1.36 MB (gzip: ~335KB) へ増加（maplibre-gl-layer-control ライブラリ分）
- Typecheck/build/test OK、本番環境でのブラウザ動作確認は次フェーズ

**将来の拡張**:
- Layer order change の実装（ドラッグ可能化）
- Multi-layer visibility control（sub-layer toggle時に全て連動）
- Background/補助要素 group の disable 設定

## D31: Mapterhorn ソースの `maxzoom: 14` 固定を撤廃する

**Status**: Accepted

**Context**: [Issue #2](https://github.com/hfu/faceless-cartographer/issues/2) にて、D24 で `hfu/kitavolca` から vendoring した `src/base-style.json` の mapterhorn ソースに設定されていた `maxzoom: 14`(高ズームでの404対応のため)が妥当でないと指摘。地域によっては z=16 の terrarium タイルが実際に提供されており(例: `https://tiles.mapterhorn.com/16/56409/26447.webp`)、一律 z14 に切り詰めるとその地域の高解像度地形を損なう。Mapterhorn 公式の `https://tiles.mapterhorn.com/tilejson.json` 自体も `maxzoom` を指定していない。

**Decision**: `src/base-style.json` の `mapterhorn` raster-dem ソース定義から `"maxzoom": 14` を削除し、upstream の `tilejson.json` と同様にズーム上限を指定しない状態にする。D24 のエントリ自体は当時の判断記録として変更せず残す。

**Consequences**: z16 タイルが提供されている地域ではより高解像度な地形陰影・3D地形が描画される。タイルが存在しない地域・ズームでは個別のタイルリクエストが404になり得るが、MapLibre 側は該当タイルを描画しないだけで致命的な問題にはならない。

## D32: Map Intentを URL フラグメントで一回限り受け渡しする(Issue #3)

**Status**: Accepted

**Context**: [Issue #3](https://github.com/hfu/faceless-cartographer/issues/3) にて、Map Intentをテキストエリアへの貼り付けだけでなく、URLフラグメント(`#intent=...`)経由でも受け渡せるようにしてほしいという依頼があった。クエリ文字列と異なり、フラグメントはブラウザからサーバーへ送信されない(HTTPリクエストの一部にならない)ため、サーバー側でのMap Intentのログ記録は発生しない ―― 「faceless」原則(サーバーが利用者の地図状態を一切知らない)には抵触しないが、`UNopenGIS/staccato-spec` ADR 0001 は文言上「URL paths, query parameters, and hash MUST NOT carry map state.」「Rendered sessions keep the URL clean as `/`.」と、hashを名指しで禁止している。D18で一度扱った「文言 vs 精神」の緊張が、今回はhash自体について再度生じた形になる。

**Decision**: D18と同じ論法を踏襲する: ADR 0001の**精神**(サーバーがMap Intentを一切知らない、共有は人間が仲介するテキストの受け渡し、URLがブックマーク可能な状態を持たない)を満たす限りにおいて、**文言**からの意図的な逸脱として、hashによる一回限りの受け渡しを実装する。

具体的な設計:
- `src/fragment.ts` に `encodeIntentFragment`/`decodeIntentFragment` という環境非依存の純粋関数を追加し、UTF-8テキストをbase64url化してhashペイロードとして埋め込む/取り出す。
- ページ読み込み時(`src/main.ts` の `bootstrap()`)、`location.hash` が `#intent=...` に一致すればデコードし、**レンダリングより前に** `history.replaceState` でURLを `location.pathname + location.search` に即座に書き戻してからMap Intentを描画する(既存の `handleSubmit` をそのまま再利用、パースエラー等のハンドリングも共通)。これにより、hashは「読み込まれた瞬間に消える」一時的な受け渡し経路に留まり、ブックマークや再読み込みで再現可能な永続的URL状態には一切ならない。ADR 0001の「Rendered sessions keep the URL clean as `/`」は、レンダリング後のURLとしては引き続き文字通り満たされる。
- 地図描画後の画面に「Copy Shareable Link」ボタンを追加(`src/render.ts`、既存の「Copy Map Intent」ボタンの隣)。クリップボードにコピーされるのは `${location.origin}${location.pathname}#intent=${encodeIntentFragment(...)}` という完全なURLで、既存の「Copy Map Intent」ボタンと同じrender_hints/cartographer_feedback反映ロジック(D11/D15、`buildCurrentIntentYaml()` として共通化)を共有する。
- `sharing_policy.url_share` に関する既存の通知文言を、「永続的なクエリ文字列状態は引き続き未サポート」と「一回限りのフラグメント受け渡しはサポート」を区別する文言に更新した。

D18の際と同様、この逸脱を実装するだけでなく、spec側の文言を明確化する提案を `UNopenGIS/staccato-spec` へPRとして提出した(D18/ADR 0003の前例に倣い、ADR 0001を直接書き換えず新規の追記型ADRとする形: [UNopenGIS/staccato-spec#2](https://github.com/UNopenGIS/staccato-spec/pull/2)、ADR 0004として提案)。

**Consequences**: `src/fragment.ts`(新規、純粋関数、`src/fragment.test.ts` でユニットテスト)を追加。`src/main.ts` はページ読み込み時の分岐ロジックが増える(`showForm()` の無条件呼び出しから、hash判定付きの `bootstrap()` に変更)。`src/render.ts` に「Copy Shareable Link」ボタンとそのハンドラを追加。`main.ts`/`render.ts` は本プロジェクトの既存の慣習通りユニットテスト対象外(手動/ヘッドレスブラウザで検証)。URLフラグメントは(hashそのものの性質上)ブラウザ履歴・ローカルのブラウザ拡張・端末上のクリップボード履歴等には残り得るため、「サーバーに送信されない」以上の秘匿性は保証しない ―― この点は共有前提のMap Intent自体の性質(意図的に人間が読める平文であり、秘密情報を含まない設計、D2/D12)と整合している。

## D33: UI 整理：左パネルの折りたたみ化、凡例統合、レイヤーコントロール移設、表示中レイヤー明示

**Status**: Accepted

**Context**: 地図表示時の`.panel`(左上、タイトル・通知・レイヤー操作等)がコンテンツ量に応じて常時展開状態であり、画面左側の大半を占める問題。一方、独立した3つの要素(パネル・凡例・Layer Control)の配置と機能性が分散されていた。ユーザーから、パネルの折りたたみ化・凡例のパネル内への統合・Layer Controlの右上への移設・必須レイヤー(現在描画中レイヤー)の明示という4点の改善要望が寄せられた。

**Decision**:
- `.panel` に `data-collapsed` 属性とトグルボタン(`.panel__toggle`)を追加。クリックで折りたたみ/展開を切り替え、折りたたみ時は幅・高さをボタン分だけに縮小(2.75×2.75rem)。展開時は既存スタイル(max-width 22rem等)を使用。遷移エフェクト(`transition: width/height 0.2s ease`)で見た目を滑らかに。
- `#legend` の独立した `<details>` 要素を削除し、`.legend-section`(div)として `.panel__content` の内部に統合。`renderLegend()` の既存ロジック(表示中レイヤーのみ表示、`data-has-entries` による空時非表示)はそのまま流用、DOM参照先のみ変更。
- Layer Control を `bottom-left` から `top-right` に移設。`top-right` に既存の NavigationControl・TerrainControl と並ぶ形で配置。
- `.panel` に「表示中のレイヤー」セクションを新設し、必須レイヤー一覧(読み取り専用のラベル、チェックボックス無し)を「任意レイヤー」の上に表示。ユーザーは現在の構成を一目で把握可能。
- `.panel__content` に `max-height: calc(100vh - 2rem); overflow-y: auto;` でコンテンツ増加時の縦スクロール対応。

**Consequences**: `.panel` の折りたたみ状態管理がクライアント側の DOM 属性(JavaScript で制御)となるため、Map Intent に含まれず、再読み込み時は初期状態(展開)に戻る。この挙動は、faceless 原則(URL が状態を持たない)と整合。ペーン操作のUIが左コーナーに集約され、マップ表示面積が最小化時に広がる。

## D34: URL フラグメント反映を intent の `sharing_policy` で制御し、セッション単位でトグル化

**Status**: Accepted

**Context**: D32 で一回限りの fragment 受け渡し(読み込み時に消去)を実装した。しかし業務シナリオ分析(S1–S5 use-cases)で矛盾が見えた: 公開データの intent では市民がアドレスバーをコピーしても `/` だけが返され、受信者は空フォームを得る(静かな UX 失敗)。一方、機密文脈では常時ON だと URL が無自覚に at-rest(ブラウザ履歴・同期・クリップボード履歴)に残る(静かな security 失敗)。

`UNopenGIS/staccato-spec` の Map Intent 仕様では `sharing_policy.url_share` を定義しており、一部の intent は「public data のためdeeplinkable にしてほしい」と宣言できる。本 Cartographer のコンセプト(`architecture-principles` §2: 人間が責任を持つ、既定は安全)から判断すると、**このポリシーを honor して intent 単位でデフォルトを分ける、かつ人間がセッション内でオーバーライドできるようにする**のが正解と判断した。

**Decision**:
- UI に「URLに地図の状態を反映」チェックボックスを追加(`.panel__content` 内、凡例セクションと操作ボタン間)。
- 初期状態は intent の `sharing_policy.url_share` 値に従う(不在なら `false`)。
- チェック ON のとき、map の `moveend` イベント と layer toggle の `change` イベント のたびに `history.replaceState` で fragment を live 更新(`#intent=${encodeIntentFragment(...)}`)。
- チェック OFF のときは `updateFragment()` が no-op。次の map 操作では fragment は更新されない。
- トグル状態は保存しない(sessionStorage 等に残さない)。reload で intent のデフォルト(`sharing_policy.url_share`)に戻る → faceless 原則(URL の永続的な状態保持をしない)を保つ。
- EXAMPLE_MAP_INTENT は公開ハザード情報(GSI土砂災害警戒区域)なので `sharing_policy.url_share: true` に変更(ユーザーが「Copy Shareable Link」ボタンでアドレスバーから self-service で共有できるようにするため)。

**Consequences**: Fragment の概念が二層化: intent の宣言的デフォルト(`sharing_policy.url_share`) + セッション内の人間による override(チェックボックス)。at-rest retention はユーザーの明示的選択になり、「セッション中に誰かがこのURLをコピーしたら履歴に残る」ことは users が理解した上で自分で ON にする。faceless の「人間が責任を持つ」原則(§2.2)と「既定は安全」(faceless baseline)の両立。

`src/render.ts`:
- UI: `.url-reflection-control`(チェックボックス)を `.legend-section` と `.actions` の間に追加。
- 状態変数: `let urlShareEnabled = intent.sharing_policy?.url_share ?? false;` → toggle の change イベントで更新。
- 新関数: `updateFragment(): void` は `urlShareEnabled` が `false` なら no-op、`true` なら `buildCurrentIntentYaml()` の結果を encode して `history.replaceState` で反映。
- Map listeners: `map.on('moveend', ...)` と layer toggle の change イベント内で `updateFragment()` を呼び出し。
- Toggle binding: `#url-share-enable` チェックボックスの checked 状態と `urlShareEnabled` 変数を同期、change イベントで toggle ON 時は即座に `updateFragment()` を呼び出し(ユーザーの「今この瞬間の状態を共有したい」という意思に応える)。

URL fragment 自体の性質(ブラウザ内部のメモリのみ)により、render 中に誰かが「Copy Shareable Link」をクリックしたら at-rest retention は発生するが、これは D32 時点から変わらない。ユーザーが明示的にクリップボードにコピーした瞬間が「共有意思の確定」であり、その後の history/sync での retention は「共有プロセスの自然な結果」と捉える。

この設計を staccato-spec に反映するため、新規 ADR を提案した: [UNopenGIS/staccato-spec ADR 0005](https://github.com/UNopenGIS/staccato-spec/blob/main/spec/adr/0005-session-controlled-fragment-reflection.md)。D34 の実装と論理はこれを例証として引用される。

## D35: 「Copy Shareable Link」ボタンの廃止 ―― idempotent Cartographer の実装

**Status**: Accepted

**Context**: D34 で「URLに地図の状態を反映」チェックボックスを実装し、ユーザーがセッション内で URL フラグメント反映を ON/OFF できるようになった。一方、UI には「Copy Shareable Link」ボタンがあり、クリックすると URL をクリップボードにコピーしていた。

しかし、チェックボックスが ON のとき、ブラウザのアドレスバーには自動的にフラグメント付き URL が表示される。つまり、ユーザーはアドレスバーから直接 URL をコピーできるようになり、「Copy Shareable Link」ボタンの役割は重複している。

特にモバイル (375px) では画面スペースが限られており、不要なボタンを削減することで UI がより安定する。

**Decision**:
- 「Copy Shareable Link」ボタンを完全廃止。
- ユーザーは「URLに地図の状態を反映」をONにして、ブラウザのアドレスバーから URL をコピーして共有する。
- パネルの通知文を更新し、この方法を明記する。

**Consequences**:
- ボタン数削減によりモバイルレイアウトがより安定、sticky footer の効果が向上。
- UI が faceless 原則に一層適合（ユーザーが主動的に URL をコピーする、ボタン経由ではなく）。
- ユーザーにはアドレスバーコピーの操作が必要（ボタンクリックより手数多い）。

## D36: Cartographer の2つのモード（faceless と idempotent）

**Status**: Accepted

**Context**: D32・D34・D35 の実装により、Cartographer が提供する2つの運用モードが明確に区別されるようになった。

1. **faceless mode**（従来・デフォルト）: URL は常に `/` でクリーンに保たれ、Map Intent はテキスト入力フォーム経由でのみ共有される。ブラウザ履歴・ブックマーク・同期サービスには URL が積み重ならない（ADR 0001 の核心）。

2. **idempotent mode**（新規、セッション単位でON/OFF可能）: ユーザーが「URLにMap Intentを反映」チェックボックスを ON にすると、map state の変化（panning, zooming, layer visibility toggle）に応じて URL フラグメントが live 更新される。ユーザーはアドレスバーから直接 URL をコピーして、他者に Map Intent をシェアできる。フラグメントはセッションスコープ（ページリロードで初期化）であり、ADR 0001 の「サーバー非可視・非永続」原則を保持しつつ、ユーザーの利便性（アドレスバーコピーの簡便さ）を叶える。

**Decision**:

- **faceless mode が基本値**: `sharing_policy.url_share` が `true` であっても、デフォルトは faceless（チェックボックス OFF）。
- **ユーザー主導で idempotent へ移行**: チェックボックスを ON にした瞬間から、その session に限って idempotent mode に切り替わる。
- **UI ラベルの簡潔化**: 「URLに地図の状態を反映」から「URLにMap Intentを反映」に変更し、何が URL に入るのかを明確にした。
- **警告文の廃止**: `sharing_policy.url_share: true` に対する詳細な説明文を削除。URL に state が入る仕組みは faceless の正式な拡張機能（D34 で設計化）であり、「サポート外」ではなく「明示的なユーザー選択」と位置付け直した。
- **レイヤー検索機能**: 多数のレイヤーをさばくため、検索フィルタ機能を実装（D36.1）。faceless/idempotent 両モードで利用可能。

**Consequences**:

Positive:
- **概念の一貫性**: 従来の「faceless とは何か」という抽象的な議論から、「Cartographer は2つの運用モードを提供する」という具体的な選択肢に落とし込めた。
- **ユーザー体験の多様性**: sensitive data 側では faceless のまま、public data 側は idempotent でシェアリングを簡素化できる。同じ Cartographer が両用途に対応可能。
- **セッションスコープの堅持**: ページリロード時に faceless に戻ることで、うっかり idempotent URL が bookmark 化される事態を防ぐ。
- **軽量化**: ボタン(D35)と警告文を削除し、パネル UI がシンプルに。特にモバイル (375px) での実装効率が向上。

Negative / trade-offs:
- **学習コスト**: 従来の「faceless Cartographer」という単一の語から、「faceless mode と idempotent mode」という2値の選択肢へと概念が拡張される。ドキュメントや STAFF_PROMPT では両モードの使い分けを明記する必要がある。
- **セッションスコープの認知**: ON した state が reload で消えることが「不便」と感じるユーザーもいるだろう。しかし persistent storage (localStorage等) への保存は、faceless baseline の意図に反し、ユーザーが無自覚に URL state を蓄積させてしまう懸念がある。

**Normative Basis**:

この設計は [UNopenGIS/staccato-spec ADR 0006](https://github.com/UNopenGIS/staccato-spec/pull/3) として spec 側に提案され、実装パターンのガイダンスとして記録される予定。D36 はその実装例・proof of concept として位置付けられる。

## D37: 複数ラスタ・オーバーレイの可読性のため、下に主題があるラスタを半透明にする

**Status**: Accepted

**Context**: `layers-martin` STAFF_PROMPT.md の改善(同リポジトリ D24)で、Staff に「治水地形分類図 × 洪水浸水想定を重ねて**対応関係**を見せる」構成を推奨するようにした。ところが `style.ts` はラスタ主題レイヤーを既定で不透明に描画しており(`raster-opacity` を下げていたのは `relief` のみ)、上のラスタが下のラスタを覆い隠す。GSI のハザードタイルはデータの無い所は透明だが、**両者にデータがある低地(=まさに一番見たい重複域)では上の層が下を隠す**。ベクトルの塗りは D29 で `fill-opacity` + `blend-mode: multiply` により下・背景を透かせているが、ラスタにはその手当が無かった。

MapLibre GL JS ではラスタに信頼できる blend-mode が使えないため、`raster-opacity` が現実的な梃子。

**Decision**: ラスタ主題レイヤーの不透明度を、重ね合わせ位置に応じて決める(`style.ts` の `buildStyle` 内、`OVERLAY_RASTER_OPACITY = 0.7`)。

- `relief` → 0.6(従来どおり。フルカバレッジの標高図を hillshade に透かす専用値)。
- それ以外で**下に既に主題レイヤーが積まれている**(描画順で `thematicLayers.length > 0`)場合 → 0.7(下の主題を透かす)。
- それ以外(最下=単体/基図的用途、例えば空中写真)→ 1.0(不透明のまま。グレー背景の上で白茶けさせない)。

一律透過にしなかったのは、フルカバレッジのラスタを単体で見たい用途(空中写真など)が背景と混ざって白茶ける実害を避けるため。判定は宣言スタック基準の静的値で、トグルの表示状態には追従しない(決定的・faceless)。

**Consequences**:
- 「重ねて対応を見せる」intent で、上の洪水浸水想定を通して下の治水地形分類図・背景地形が見えるようになった。石狩川の例で、浸水域(紫, 0.7)の下に治水地形分類図(旧河道・後背湿地の配色)と hillshade が透けることをブラウザで確認(2026-07-17)。同じ描画で最下の治水地形分類図が不透明のままであることも確認でき、両分岐を実証。
- 解決率・描画可能率(D24 のハーネス M2/M3)には無影響(opacity は解決性に無関係、6/6 維持)。
- occlusion は自動指標化が難しく、検証は目視(M7)が中心。

## D38: `.panel .layer-item label` の `display: block` を撤去する(kitavolcaからの逆輸入)

**Status**: Accepted

**Context**: `hfu/kitavolca` 側で左上パネルのUI改善(2026-07-17〜19)を行った際、同じ `.panel .layer-item label { display: block; }` というルールが DADS の `.dads-checkbox`(`display: flex`)を上書きし、チェックボックスとラベルが1行に収まらず縦に分離して表示される不具合が見つかり、修正済みだった([kitavolca HANDOVER.md](https://github.com/hfu/kitavolca/blob/main/HANDOVER.md)参照)。本リポジトリの `index.html` にも起源を同じくする同一のルールが残っており、実際にブラウザで同じ不具合(「☑」の下に「治水地形分類図」が改行される)を再現確認した。

**Decision**: `index.html` から `.panel .layer-item label { display: block; }` を削除する。`.layer-item` 配下は `.dads-checkbox` のflexレイアウトにそのまま任せる。

**Consequences**:
- チェックボックスとラベルが1行に収まるようになった(`npm run typecheck` パス、ブラウザで確認済み)。
- 他に `.layer-item label` の `display` に依存する箇所が無いことを `render.ts` を確認して裏付け済み。

## D39: Map Intent に `required_styles`/`optional_styles` を追加する(source_id ではなくスタイル全体を参照できるようにする、Issue #6)

**Status**: Accepted

**Context**: 現状の Map Intent は `required_layers`/`optional_layers` を通じて個々の `source_id` しか参照できない。しかし利用者の要求はしばしば「レイヤーの寄せ集め」ではなく「完成した主題図」そのものである(例: 「北海道の火山土地条件図を見たい」「恵山の火山土地条件図を見たい」)。この要求を Staff が `source_id` に分解しようとすると、利用者の意図(火山土地条件図そのもの)と Staff が扱える単位(source_id)の間にズレが生じる([Issue #6](https://github.com/hfu/faceless-cartographer/issues/6))。

実際の Martin サーバーは `GET /catalog` のカタログルートに `tiles` と並んで `styles` オブジェクトを持て、公開済みスタイルは `GET {base}/style/{style_id}` で配信される(`stars.optgeo.org` で確認: `curl https://stars.optgeo.org/style/vlcm` は現状 `styles.vlcm` が未公開のため 404 `No such style exists` を返すが、エンドポイントの規約自体は確認済み)。一方 `hfu/layers-martin` のような `layers_txt` カタログ(静的ミラー)にはそもそも `styles` という概念が無い(カタログJSONに `styles` キー自体が存在しない)。

`UNopenGIS/staccato-spec` の `spec/map-intent-vnext.md`・`spec/catalog-integration.md` はいずれも「スタイル」という概念に触れていない。したがってこれは既存spec文言の解釈ではなく、意図的なスキーマ拡張である。D18(SPA化)と同じ前例(まず実装し、逸脱をDECISIONS.mdに明記し、後で `UNopenGIS/staccato-spec` へADR提案する)に倣う。

**Decision**:
- `LayerRef` と対になる `StyleRef {style_id, label?}` を新設し、`MapIntent` に `required_styles?`/`optional_styles?: StyleRef[]` を追加する。
- 解決は `catalog_type: "martin"` のカタログにのみ試みる(`layers_txt` は `/style/{id}` エンドポイントを持ち得ないため、`SUPPORTED_CATALOG_TYPES` より狭い `SUPPORTED_STYLE_CATALOG_TYPES` で明示的に除外)。
- 解決したスタイルの `sources`/`layers` は、既存の主題レイヤーと同じ帯(`baseStyle.before` と等高線の間、D24 の「背景は常時描画」を維持)にマージする。`layout.visibility` は必須/任意の状態に合わせて強制上書きする(個々のレイヤーと同じ扱い)。処理順は「レイヤー由来の主題レイヤー→スタイル由来のレイヤー」という単純な宣言順とし、両者を統合的に並び替える仕組みは導入しない。
- `parseMapIntent` の「`required_layers` は非空配列必須」という既存規則を、「`required_layers`/`required_styles` のどちらかが非空であればよい」に緩和する。これは現行spec文言からの意図的な逸脱である。
- 凡例(`legend_image_url`)はスタイル単位には存在しないため、v1ではスタイル由来のパネル項目に凡例を表示しない(既知のギャップとして許容、回避策は設けない)。
- `EXAMPLE_MAP_INTENT`(フォーム初期値)は変更しない。`stars.optgeo.org` に `styles.vlcm` が実際に公開されるまでは、参照しても解決しない例を初期表示するのは「ワンクリックで動作確認できる」という既存の性質を損なうため。

**Consequences**:
- `src/types.ts`: `StyleRef`/`PublishedStyle`/`ResolvedStyle`/`ResolveStylesResult` を追加。
- `src/catalog.ts`: `resolveStyles()` を追加(`resolveLayers()` と対称、独立して呼び出し可能)。
- `src/style.ts`: `buildStyle()` が第3引数 `resolvedStyles` を取り、戻り値に `styleLayerIds`(style_id → maplibre layer id 一覧)を追加。
- `src/render.ts`/`src/main.ts`: パネルにスタイル用チェックボックスを追加(レイヤーと同一の見た目・トグル機構、凡例なし)、Layer Control にもスタイル由来レイヤーを含める。
- テスト: `catalog.test.ts`(ライブ統合: 未公開styleの missing 確認・layers_txt除外の確認、モック: 解決成功・不正payload拒否)、`style.test.ts`(マージ・可視性強制・unrenderable・source衝突)、`mapIntent.test.ts`(緩和後のバリデーション)を追加、全45件パス。

**2026-07-21 追記(`stars.optgeo.org` への実公開が完了)**: `stars.local`(`stars.optgeo.org` を稼働させる実機、SSH接続可能)にて以下を実施した。

- `hfu/kitavolca` の `docs/style.json`(commit確認済み)から `vlcm-*`/`vbm-*` の主題レイヤーと対応する `vlcm`/`vbm` ソースのみを抽出し、`styles/vlcm.json`(7レイヤー)・`styles/vbm.json`(66レイヤー)として新規作成。kitavolca 側が持つ独自の背景一式(`bvmap`/`mapterhorn`/`seamlessphoto`)は意図的に除外した — そのまま含めると、Cartographer 自身の常時描画背景(D24)と二重に重なって描画が崩れるため。
- 配置場所は `/home/stars/data`(pmtilesバイナリ専用)ではなく、`data` と対等な兄弟ディレクトリ `/home/stars/styles/` とした(config.yaml の `pmtiles:`/`styles:` が対等なセクションであることに合わせた判断)。
- `/home/stars/.config/martin/config.yaml` に以下を追記(既存の pmtiles と同じ「ディレクトリ自動検出」方式、変更前の設定は同ディレクトリにタイムスタンプ付きでバックアップ済み):
  ```yaml
  styles:
    paths:
      - /home/stars/styles
  ```
- `martin --save-config -` で設定の妥当性を事前確認した上で `systemctl --user restart martin.service`(systemd --user、enabled)を実行、反映を確認。
- 実機で `GET https://stars.optgeo.org/style/vlcm`・`/style/vbm` が正しい JSON を返すことを確認(`/catalog` の一覧表示は Cloudflare のキャッシュ(`max-age=14400`)により最大4時間程度古い状態が残るが、`/style/{id}` 自体は最新を返しており、Cartographer の解決処理には影響しない)。
- `catalog.test.ts` の統合テストを、モック無しで実際に `vlcm`/`vbm` を解決する内容に更新(ライブ integration test、46件パス)。ブラウザでも実際の Map Intent(`required_styles: [vlcm]` + `optional_styles: [vbm]`、恵山周辺)で GSI公式凡例通りの色分けが描画されることを確認済み。
- `UNopenGIS/staccato-spec` へのADR提案は未着手のフォローアップとして残る。`EXAMPLE_MAP_INTENT` の切り替えは別途検討(HANDOVER.md参照)。

## バックログ(未決定・保留)

### フィーチャークリックでの属性ポップアップ(未着手・検討のみ、2026-07-19)

`hfu/kitavolca` の `docs/app.js` に、地物クリックで属性を表示するポップアップと、その内容を「一般向けキーのみ」に絞る「詳細」トグルを実装した(kitavolca HANDOVER.md 2026-07-19)。同様の機能を Cartographer にも追加できるか検討した。

- **デザイン面(吹き出しをパネルと同じDADSトークンで統一する)は問題なく移植可能**: 両リポジトリとも同じ `@digital-go-jp/design-tokens` と同一の `.panel` CSS(blur背景・`--border-radius-12`・`--elevation-1`)を使っており、`.maplibregl-popup-content` を同じトークンで再スタイリングするだけで一貫する。
- **属性フィルタリング面は移植できない**: kitavolca のフィルタは「VBMの `名称`/`注記`」「VLCMの `class1-6`/`name`」という**特定カタログのスキーマを知っている前提**の許可リストである。Cartographer は任意の Map Intent カタログを汎用的に描画する設計(D23: `vector_layers` スキーマがあれば幾何タイプ別に汎用描画し、カタログ固有のスキーマ知識をハードコードしない)であり、この前提と直接衝突する。汎用化するなら「値が数値のみのプロパティを既定で隠す」のようなスキーマ非依存のヒューリスティックが必要だが、これは精度も要件も未検証の新規設計判断であり、今回のスコープでは実装を見送った。

**現状**: 機能追加そのものは未実装。次にこの機能を検討する際は、上記のヒューリスティック案の精度検証(実際のカタログ横断でどれだけ「一般向け」に絞れるか)から始めるとよい。

### 凡例(legend)が画面上で分からない(解消: D14 + layers-martin D18)

~~実際に使ってみると...~~ 2026-07-03、`layers-martin` 側にTileJSON拡張 `legend_image_url` を新設し(D18)、Cartographer側に表示中レイヤーのみの折りたたみ凡例パネルを実装した(D14)。解消済みのため削除。

### デジタル庁デザインシステムへの準拠(解消: D25)

2026-07-08、`@digital-go-jp/design-tokens` CDN + vendored component CSS による部分準拠を実装した(D25)。トークン(色・typography・spacing・border-radius・elevation)とアクセシビリティパターン(focus-visible outline・リンク配色)を採用し、Button/Checkbox/Disclosure のクラス構造も DADS に合わせた。完全な政府品質コンポーネント(notification-banner等)の再現ではなく、このUIスケール(フォーム+パネル)に見合った投資レベルでの準拠。

### レイヤーセクション統一化(解消済み)

2026-07-10、左パネルのレイヤーセクションを再設計し、「表示中のレイヤー」と「任意レイヤー」の区別を廃止。すべてのレイヤーがフラット表示に統一された。required レイヤーはチェックボックスでデフォルト ON・表示あり、optional レイヤーはデフォルト OFF・表示なし。凡例セクションのヘッダー「凡例」を削除し、各レイヤーの下に条件付きで凡例画像を表示（そのレイヤーが ON のときのみ）。Apple 製品のようなシンプルさを目指し、今後も反復的に改善していく方針。
