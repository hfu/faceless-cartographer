# DECISIONS.md

`faceless-cartographer` の設計判断を ADR (Architecture Decision Record) 形式で記録する。上位構想は [HANDOVER.md](HANDOVER.md) を参照。実装は `src/*.ts` を正とし、ここでは判断の理由のみを記録する。

## 目次

| # | タイトル | Status | Date |
|---|---|---|---|
| [D1](#d1-faceless-な-post-はサーバーへのhttp-postとして実装する) | faceless な `POST /` はサーバーへのHTTP POSTとして実装する | Accepted | 2026-07-02 |
| [D2](#d2-map-intent-のスキーマはmap-intent-vnextmdに文字通り従う) | Map Intent のスキーマは `map-intent-vnext.md` に文字通り従う | Accepted | 2026-07-02 |
| [D3](#d3-source_id-が解決できない場合は捏造せずmissing_layersとして可視化する) | `source_id` が解決できない場合は捏造せず `missing_layers` として可視化する | Accepted | 2026-07-02 |
| [D4](#d4-任意レイヤーはスタイルに含めつつ既定で非表示にする) | 任意レイヤーはスタイルに含めつつ既定で非表示にする | Accepted | 2026-07-02 |
| [D5](#d5-ベクトルタイルはソースのみ追加しレイヤーは描画しない) | ベクトルタイルはソースのみ追加し、レイヤーは描画しない | Accepted | 2026-07-02 |
| [D6](#d6-初期表示範囲のフォールバック順) | 初期表示範囲のフォールバック順 | Accepted | 2026-07-02 |
| [D7](#d7-依存パッケージのバージョンは学習知識ではなく実際のレジストリで確認する) | 依存パッケージのバージョンは学習知識ではなく実際のレジストリで確認する | Accepted | 2026-07-02 |
| [D8](#d8-llm説明パネルは中核パイプラインから分離しワンショットcli呼び出しにする) | LLM説明パネルは中核パイプラインから分離し、ワンショットCLI呼び出しにする | Proposed(未実装) | 2026-07-02 |
| [D9](#d9-デプロイ先は自己ホストのraspberry-pi-4b--cloudflared) | デプロイ先は自己ホストの Raspberry Pi 4B + cloudflared | Accepted | 2026-07-02 |
| [D10](#d10-express-から-hono-への移行は今回見送る) | Express から Hono への移行は今回見送る | Rejected(将来再検討あり) | 2026-07-02 |
| [D11](#d11-地図全面レイアウトとcopy-map-intent時のrender_hints反映) | 地図全面レイアウトと Copy Map Intent 時の `render_hints` 反映 | Accepted | 2026-07-02 |

---

## D1: faceless な `POST /` はサーバーへのHTTP POSTとして実装する

**Status**: Accepted

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

**Status**: Proposed(未実装)

**Context**: Cartographer の中核描画パスにLLMを持ち込まない方針(HANDOVER.md参照)がある一方、将来的に地図に添える自然文の説明を生成する機能はあってよいと考えている。ブラウザからCLIツールを直接実行することはできない。

**Decision(方針のみ、実装は未着手)**: 実装する場合、LLM呼び出しはワンショットのコマンドライン呼び出しとして行う。デフォルトのコマンドは `claude -p` とする。中核パイプライン(`mapIntent.ts`/`catalog.ts`/`style.ts`)には組み込まず、それらが無くても地図の描画自体は成立する分離された追加機能として実装する。

**Consequences**: 未実装。着手する際は、(a) `POST /` のレスポンスタイムにCLIプロセスの起動コストがどう影響するか、(b) CLI呼び出し失敗時に地図描画自体は成功させる分離をどう保つか、(c) サーバー環境に `claude` CLIが存在しない場合のフォールバック、を検討する必要がある。D9(デプロイ先)の決定により、実行環境は通常のLinuxプロセス(`child_process` が使える)であることが確定したため、この方針を変更する必要はなくなった。

## D9: デプロイ先は自己ホストの Raspberry Pi 4B + cloudflared

**Status**: Accepted

**Context**: デプロイ先の検討にあたり、Cloudflare Workers 等のエッジランタイムへのデプロイも選択肢として検討した(D10参照)。エッジは無料枠が大きくサーバー管理が不要という利点があるが、D8 で決めた「LLM呼び出しはワンショットのCLIサブプロセス(`claude -p`)」という方針とは根本的に非互換(エッジランタイムには `child_process` もファイルシステムも無い)。

**Decision**: デプロイ先は自己ホストの Raspberry Pi 4B とする。`cloudflared`(Cloudflare Tunnel)経由で `cartographer.optgeo.org` として公開する。ポートを外部に開放する必要がなく、TLS終端は cloudflared 側が担う。プロセス管理は systemd で行う(`deploy/faceless-cartographer.service`)。デプロイ手順は `deploy/README.md` に記録した。

**Consequences**: D8 のCLIサブプロセス方式をそのまま維持できる(通常のLinuxプロセスなので `child_process` が普通に使える)。クラウドの月額費用が発生しない。一方で、可用性・スケーラビリティは自宅サーバーの制約を受ける(電源・回線・ハードウェア故障等はエッジやマネージドPaaSに比べて運用者の負担になる)。依存パッケージ(express, js-yaml, tsx 等)はいずれも Pure JS またはaarch64向けのプリビルドバイナリを持つため、Raspberry Pi (aarch64) 上での追加対応は不要と判断した(実機での動作確認は運用者側で行う)。CI/CDによる自動デプロイは v1 時点では組んでおらず、`deploy/README.md` に記載の手動手順(`git pull` → `npm install` → `systemctl restart`)で更新する。

## D10: Express から Hono への移行は今回見送る

**Status**: Rejected(将来再検討の余地あり)

**Context**: Hono はWeb Standardsベースで書かれており、Node/Cloudflare Workers/Deno/Bunなど複数ランタイムで同一コードが動く。当初、デプロイ先としてCloudflare Workersのようなエッジランタイムを検討していたため、移行の是非を検討した。現在のExpress利用は薄く(ルート2つ、ミドルウェア2つ)、テストもExpressのルーティング自体には依存していないため、移行コスト自体は小さいと分かった。

**Decision**: D9 でデプロイ先が Raspberry Pi 上の通常の Node プロセスに決まったため、Hono最大の利点(ランタイム横断・エッジ対応)を活かす場面が無くなった。Express は Pure JS でネイティブ依存も無く、aarch64上で問題なく動作する。移行によるDX上の細かな利点はあるが、「必要になるまで抽象化・移行はしない」という原則に従い、今回は見送る。

**Consequences**: 現状の `src/server.ts` はExpressのまま。将来、Cartographerの一部(特にLLMに依存しない中核描画パス)だけをエッジにも展開したくなった場合は、この判断を再検討する。その際も `src/mapIntent.ts`/`src/catalog.ts`/`src/style.ts` はExpress/Honoいずれにも依存しない環境非依存の実装になっているため、書き換えが必要なのは `src/server.ts`/`src/render.ts` の薄い層のみで済む見込み。

## D11: 地図全面レイアウトと Copy Map Intent 時の `render_hints` 反映

**Status**: Accepted

**Context**: `POST /` のレンダリング結果が、タイトル・地図・ボタン類を縦に積んだ通常のドキュメントレイアウトになっており、地図の可視領域が狭かった。実装パターンについて `unopengis/7#869` の議論を参照するよう指示があった。同issueは別プロジェクト(Vite+PMTiles+Protomaps+3D地形サイト)向けの詳細仕様だが、「地図を全面表示し、タイトル/ステータス/コントロール類は地図の上に浮かせたパネルとして重ねる」というレイアウトパターンは流用できると判断した。ただし同issueは `hash: "map"` によるURLベースの位置共有も含んでおり、これは faceless-cartographer の [ADR 0001](https://github.com/unopengis/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)(URLに地図の状態を持たせない)と正面から矛盾するため、意図的に採用しない。

あわせて、「Copy Map Intent」を押した時点の地図の表示状態(中心座標・ズーム)が、コピーされる Map Intent に反映されていなかった(常に投稿時点の原文をそのままコピーしていた)。

**Decision**:

- `POST /` のレンダリングページを、`#map` を `position: fixed; inset: 0` によるフルスクリーン表示にし、タイトル・goal・通知・任意レイヤーのチェックボックス・アクションボタンを、半透明+`backdrop-filter: blur()` のパネルとして左上に重ねる形に変更した。`unopengis/7#869` のUIパターンは流用するが、`hash` によるURL状態共有は採用しない。
- 「Copy Map Intent」クリック時、js-yaml をクライアント側でも読み込み(ESM importでCDNから、`unpkg.com/js-yaml@.../dist/js-yaml.mjs`)、元の Map Intent をパースした上で、その時点の `map.getCenter()`/`getZoom()`/`getBearing()`/`getPitch()` を `render_hints` として上書き・追記してからシリアライズし、クリップボードにコピーするようにした。これは `map-intent-vnext.md` §5 が `render_hints` の用途として明記している「実用上の再オープンのため」に沿う挙動である。YAMLの読み書きに失敗した場合は、元のテキストをそのままコピーする安全側の挙動にフォールバックする。

**Consequences**: js-yaml 5.x はブラウザ向けのUMDバンドル(v3/v4にあった `dist/js-yaml.min.js` 相当)を廃止しており、ESM (`dist/js-yaml.mjs`) のみが配布されている。そのため、地図描画ページのスクリプトは `<script type="module">` に変更した(MapLibre GL JS自体は引き続きグローバル変数を公開する従来型の `<script>` タグで読み込み、モジュールスクリプトからは `maplibregl` グローバルとしてそのままアクセスしている)。Playwrightによる実ブラウザ確認で、パン・ズーム後にCopy Map Intentを押すと、実際の座標・ズームが `render_hints` に正しく反映されることを確認済み。フォームページ(`GET /`)のレイアウトは今回変更していない。
