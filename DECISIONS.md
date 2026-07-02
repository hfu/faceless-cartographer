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
| [D12](#d12-入力には寛容出力には厳格3リポジトリ間の整合性確認で見つけたギャップの是正) | 入力には寛容、出力には厳格(3リポジトリ間の整合性確認で見つけたギャップの是正) | Accepted | 2026-07-03 |
| [D13](#d13-gettopページに現在のstaffプロンプトを表示する) | `GET /` トップページに現在のStaffプロンプトを表示する | Accepted | 2026-07-03 |
| [D14](#d14-凡例現在表示中のレイヤーのみ右下折りたたみ) | 凡例(現在表示中のレイヤーのみ・右下・折りたたみ) | Accepted | 2026-07-03 |
| [D15](#d15-構造化エラーフィードバックはmap-intentへの埋め込みで環流させる) | 構造化エラーフィードバックはMap Intentへの埋め込みで環流させる | Accepted | 2026-07-03 |
| [D16](#d16-必須レイヤー全滅時は空の地図をそのまま出す) | 必須レイヤー全滅時は空の地図をそのまま出す | Accepted | 2026-07-03 |

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

## D12: 入力には寛容、出力には厳格(3リポジトリ間の整合性確認で見つけたギャップの是正)

**Status**: Accepted

**Context**: `faceless-cartographer`/`hfu/layers-martin`/`unopengis/staccato-spec` の3リポジトリ間の整合性を確認したところ、以下が見つかった。

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

## D14: 凡例(現在表示中のレイヤーのみ・右下・折りたたみ)

**Status**: Accepted

**Context**: [layers-martin D18](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d18-tilejsonを拡張しlegend_image_urlを新設する) で `legend_image_url` が追加されたことを受け、画面上に実際に凡例を表示できるようになった。表示方針として、(a) 表示中レイヤーのみか全レイヤーか、(b) 画面上の配置、(c) 常時展開か折りたたみか、の判断が必要だった。

**Decision**: MapLibreの attribution 表示が「現在表示中のレイヤーのみ」を合成する仕様([layers-martin D17](https://github.com/hfu/layers-martin/blob/main/DECISIONS.md#d17-faceless-cartographer-との整合性確認catalog_contextversion-と-attribution可視性の文書化)参照)に凡例も揃える。Staffが多数のレイヤーを送ってきた場合でも画面が凡例で埋め尽くされないようにするための一貫した設計判断でもある。配置は「凡例は右下」というウェブ地図の慣習に従う。`<details>`/`<summary>` によるネイティブの折りたたみUIとし、追加のJSライブラリは使わない。任意レイヤーのチェックボックスをトグルすると、凡例の中身もリアルタイムで更新される。

**Consequences**: 凡例を持たないレイヤーのみが表示されている場合、凡例パネル自体が非表示になる(`data-has-entries="false"`)。モバイル幅では `max-width: min(16rem, calc(100vw - 2rem))` で画面からはみ出さないようにしている。

## D15: 構造化エラーフィードバックはMap Intentへの埋め込みで環流させる

**Status**: Accepted

**Context**: `spec/background.md` §10 が提案する構造化エラーレスポンス(`error_code`/`provenance_snapshot`等)は、専用のJSON APIとして実装することもできたが、そもそも現状この Cartographer に機械的なクライアントは存在せず(ADR 0001の人間介在フローが前提)、専用API化は現時点では過剰实装になると判断した。

**Decision**: `missing_layers`/`unrenderable_layers` の情報を、専用APIではなく「Copy Map Intent」でコピーされる Map Intent 自体に `cartographer_feedback`(非規範的な拡張フィールド)として埋め込む。問題が無い場合はこのフィールド自体を付与しない。これにより、User が Map Intent をコピーして Staff に戻した場合、高性能な Staff エージェントであればこの `cartographer_feedback` を読み取って次の応答に反映できる、という**任意の(optional)フィードバックの環流経路**が生まれる。Cartographer 側から Staff への直接通信は発生させず、あくまで人間が運ぶ Map Intent というテキストに相乗りさせるだけなので、faceless の設計(URLで状態を持たない、人間介在の受け渡し)とも整合する。

**Consequences**: `cartographer_feedback` は `map-intent-vnext.md` にはまだ存在しない、このプロジェクト独自の非規範的拡張である。D2で確立した「未知キーは無視されてよい」という前提の通り、これを理解しない Staff/Cartographer 実装からは単に無視される。将来 `unopengis/staccato-spec` 側で `background.md` §10 の構造化エラー形式が正式化された場合、フィールド名・形状をそちらに合わせて改名する可能性がある。

## D16: 必須レイヤー全滅時は空の地図をそのまま出す

**Status**: Accepted

**Context**: `required_layers` の全件が解決に失敗した場合の挙動を検討した。専用の失敗画面を作る案もあったが、実装コストと必要性を天秤にかけた。

**Decision**: 専用の失敗画面は作らない。全件失敗しても、レイヤーの無い(背景も無い)空の地図がそのまま描画され、`missing_layers` 通知パネルで全件が missing として表示される。既存の「一部解決できても描画は続ける」(D3)という設計をそのまま延長した形であり、コード変更は不要だった。

**Consequences**: 将来、空の地図が実際に使い勝手が悪いと分かった場合(例えば「地図がまっさら」の意味が利用者に伝わりにくい等)、専用の失敗画面や、せめて白地図等のCartographer側デフォルト背景を差し込む案を再検討してよい。

## バックログ(未決定・保留)

### 凡例(legend)が画面上で分からない(解消: D14 + layers-martin D18)

~~実際に使ってみると...~~ 2026-07-03、`layers-martin` 側にTileJSON拡張 `legend_image_url` を新設し(D18)、Cartographer側に表示中レイヤーのみの折りたたみ凡例パネルを実装した(D14)。解消済みのため削除。

### デジタル庁デザインシステムへの準拠

日本のデジタル庁が公開している[デザインシステム](https://design.digital.go.jp/)に、可能な範囲で準拠していきたい。現状のUI(D11のフローティングパネル、D14の凡例)は独自のCSSで組んでおり、デジタル庁デザインシステムのコンポーネント・カラートークン・タイポグラフィ等とは特に揃えていない。

すぐに着手する優先度ではないが、方向性として: (a) デザインシステムをそのまま採用する(コンポーネントライブラリとして導入)か、(b) カラートークンやスペーシングの考え方だけ参考にしつつ独自実装を続けるか、(c) 政府機関向けサービスではないためどこまで律儀に準拠する必要があるか、といった判断が必要になる。着手する際に改めて検討する。
