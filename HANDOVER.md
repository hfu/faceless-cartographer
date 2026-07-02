# HANDOVER.md

## 件名

Staccato アーキテクチャにおける Cartographer 実装プロジェクト引き継ぎ

## 目的

`unopengis/staccato-spec` が定義する Staccato アーキテクチャ(User / Staff / Cartographer / Library の4者モデル)のうち、**Cartographer**(インターネット側の地図描画サービス)を実装する。Cartographer の仕事は一つだけ: 投稿された Map Intent(構造化された YAML)を受け取り、決定的に MapLibre GL JS の地図として描画すること。利用者の意図解釈は Staff の責務であり、Cartographer はそれをしない。

## 上位構想: Staccato アーキテクチャにおける位置づけ

Staccato は信頼境界を挟んで責務を分離する。

```text
User          自然言語で問いを投げ、Map Intent の転送(エンタープライズ→インターネット)に責任を持つ
Staff         エンタープライズ内で動作し、問いを解釈して Map Intent を生成する。起動時に設定された
              カタログからしかレイヤーを解決してはならない(unopengis/staccato-spec ADR 0002)
Cartographer  本プロジェクト。インターネット側で動作し、Map Intent を受け取って描画する
Library       カタログメタデータを公開する。参照実装は hfu/layers-martin
```

Cartographer は意図的に「faceless」である: 公開エンドポイントは `GET /` と `POST /` のみで、URLに地図の状態(ズーム・中心座標・選択レイヤー等)を一切持たせない。これは提案ではなく規範的な決定であり(`unopengis/staccato-spec` の [ADR 0001](https://github.com/unopengis/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md))、覆すには新たな ADR が必要とされている。共有の一次artifactは Map Intent のテキスト自体であり、URLではない。

### なぜ Cartographer は「軽く」あるべきか

2つの理由が同じ制約に収束する。

1. **情報管理上の理由**: Cartographer は公開のインターネット向けサービスである。Map Intent がエンタープライズ内部のビジネスロジック(なぜその判断をしたか)を漏らすことは望ましくない。Map Intent は `source_id` や `area.bbox` のように技術的に具体化されているため、機微な文脈を運ぶ必要がない。Staffが「なぜ」を、Cartographerは「何を」だけを受け取る。
2. **情報技術上の理由**: Staffはエンタープライズ内で高価な高性能LLMと組み合わせられる一方、Cartographerは安価にスケールする必要がある公開サービスである。**中核の描画パスにLLMを一切必要としない**設計が前提。Map Intent → MapLibreスタイル+ソース、という決定的な変換で完結する。

この方針から、本実装のコアパイプライン(`src/mapIntent.ts` → `src/catalog.ts` → `src/style.ts`)はLLMに依存しない。将来的にLLMによる自然文の説明パネルを追加する可能性はあるが、それは分離可能なオプション機能として扱う(下記「現在の状態」参照)。

## 現在の状態(2026-07-02 時点)

- 実装は Express + TypeScript(`tsx` で直接実行、ビルドステップなし)。`src/mapIntent.ts`(パース・バリデーション)→ `src/catalog.ts`(カタログ解決)→ `src/style.ts`(MapLibreスタイル構築)という決定的なパイプラインを、`src/server.ts`/`src/render.ts` が `GET /`・`POST /` として提供する。
- `hfu/layers-martin` の実カタログ(`https://hfu.github.io/layers-martin/catalog`)に対して実際に動作確認済み。土砂災害警戒区域の検証済み例(標準地図 + 警戒区域3件 + 任意レイヤー1件)が、実際にブラウザで正しく描画されることを Playwright のスクリーンショットで確認した(青い警戒区域が標準地図の上に正しく重なる)。この例は `src/render.ts` の `EXAMPLE_MAP_INTENT` として初期フォームにそのまま埋め込まれている。
- テスト17件(`src/*.test.ts`)全パス。`src/catalog.test.ts` は実際に `layers-martin` の生カタログへHTTPで問い合わせる統合テストで、モックは使っていない。CI(`.github/workflows/ci.yml`)は typecheck + test を実行し green。
- デプロイ先は自己ホストの Raspberry Pi 4B + cloudflared([D9](DECISIONS.md#d9-デプロイ先は自己ホストのraspberry-pi-4b--cloudflared)、`cartographer.optgeo.org`)に決定。systemdユニットとデプロイ手順を `deploy/` に用意した(Pi実機での適用は運用者側の作業)。まだ実際にはデプロイされていない。
- 未着手: LLMによる自然文の説明パネル(方針だけ決定: ワンショットでCLIを呼び出す形にする。デフォルトは `claude -p`。実装は未着手。D9によりRaspberry Pi上の通常プロセスで動くことが確定したため、この方針のまま実装できる)。
- Express から Hono への移行は検討の上で見送った([D10](DECISIONS.md#d10-express-から-hono-への移行は今回見送る))。デプロイ先がエッジランタイムでなくなったため、移行の主な動機が無くなったため。
- `POST /` のレンダリング結果は地図全面表示 + 左上フローティングパネルのレイアウトに変更し、「Copy Map Intent」はその時点の地図の中心座標・ズーム・向きを `render_hints` として反映してからコピーするようにした([D11](DECISIONS.md#d11-地図全面レイアウトとcopy-map-intent時のrender_hints反映))。

具体的な設計判断とその理由は [DECISIONS.md](DECISIONS.md) を参照。

## v1 のスコープ外(意図的に対象外)

- ユーザーアカウント、Map Intent のリクエストを超えた永続化、URLベースの履歴機能
- `catalog_type: "stac"` の解決(`martin`/`layers_txt` のみ実装。将来追加しやすいようインターフェースは `catalog_type` で分岐する形にしてある)
- 中核描画パスでのLLM利用
- URLベースの共有機能(ADR 0001 が「Alternatives Considered」として明示的に却下している: クエリ/hash状態、opaqueなpermalink ID、暗号化URLトークン)

## 参照情報

- `unopengis/staccato-spec`: `spec/architecture-principles.md`、`spec/map-intent-vnext.md`(Map Intent スキーマの正)、`spec/catalog-integration.md`、`spec/usecase.md`、`spec/background.md`、`spec/adr/0001-faceless-cartographer.md`、`spec/adr/0002-staff-startup-catalog-contract.md`。この文書で扱っていない事項はすべてそちらが正。
- `hfu/layers-martin`: 参照 Library 実装。`README.md`/`HANDOVER.md`/`DECISIONS.md`/`STAFF_PROMPT.md` に、このカタログ固有の性質(`bounds`/`attribution` の欠落率、既知の抑制ポリシー等)が記録されている。カタログの形が変わった場合はまずそちらを確認する。

## 次の担当者へ

- 各ソースファイル(`src/*.ts`)の冒頭コメントに、なぜその実装になっているかの理由を書いてある。まずコードとそのコメントを読むのが早い。
- 設計判断の背景・議論の経緯は [DECISIONS.md](DECISIONS.md) を参照。
- 開発コマンドやアーキテクチャの見取り図は [README.md](README.md) を参照。
