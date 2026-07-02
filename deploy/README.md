# デプロイ手順(Raspberry Pi 4B + cloudflared)

デプロイ先は自己ホストの Raspberry Pi 4B。`cloudflared`(Cloudflare Tunnel)経由で `cartographer.optgeo.org` として公開する([DECISIONS.md](../DECISIONS.md) D9)。このディレクトリの内容は Raspberry Pi 上での作業を想定したテンプレート/手順書であり、Claude からは Pi 本体に直接アクセスできないため、実際の適用は運用者が行う。

## 前提

- Raspberry Pi OS (64-bit, aarch64)。依存パッケージ(express, js-yaml, tsx 等)はいずれも Pure JS またはプリビルドの aarch64 バイナリを持つため、追加のクロスコンパイル対応は不要。
- Node.js 22 系(このプロジェクトの動作確認済みバージョン)。
- [`just`](https://github.com/casey/just)(タスクランナー)。
- `cloudflared` がインストール済みで、Cloudflare アカウントに `optgeo.org` ゾーンが登録済みであること。

## 1. Node.js と just のインストール(未導入の場合)

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v22.x であることを確認

curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | sudo bash -s -- --to /usr/local/bin
just --version
```

## 2. アプリの配置と起動

クローンして `.env` をコピーし、`just serve` を実行すれば起動する(初回は依存パッケージの自動インストールも行われる)。

```sh
cd /home/pi
git clone https://github.com/hfu/faceless-cartographer.git
cd faceless-cartographer
cp .env.example .env   # 必要なら PORT 等を編集
just serve
```

`Ctrl-C` で停止する。動作確認できたら `Ctrl-C` で止め、次の手順で systemd に登録する(手動起動したままにしない)。

`just check`(typecheck + test)で一通り確認しておくとよい。

## 3. systemd サービスとして登録

```sh
sudo cp deploy/faceless-cartographer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now faceless-cartographer
sudo systemctl status faceless-cartographer
curl -s http://localhost:3000/ | head -5   # HTML が返れば起動確認OK
```

`deploy/faceless-cartographer.service` の `User`/`WorkingDirectory`、および `ExecStart` の `just` のパス(`which just` の結果に合わせる)は、実際の配置に合わせて調整すること。`PORT` は `.env` 側で指定する(systemd ユニット側には持たせていない。手動起動と同じ `.env` を共有するため)。

## 4. cloudflared でトンネル公開

```sh
cloudflared tunnel login
cloudflared tunnel create faceless-cartographer
cloudflared tunnel route dns faceless-cartographer cartographer.optgeo.org
```

`~/.cloudflared/config.yml` に以下を追記(トンネルIDは `tunnel create` の出力に合わせる):

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: cartographer.optgeo.org
    service: http://localhost:3000
  - service: http_status:404
```

```sh
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## 5. 更新の反映

CI/CD による自動デプロイはまだ組んでいない(v1時点)。更新時は手動で以下を実行する。

```sh
cd /home/pi/faceless-cartographer
git pull
just install
sudo systemctl restart faceless-cartographer
```

## 動作確認

```sh
curl -sI https://cartographer.optgeo.org/ | head -5
```

`Referrer-Policy: no-referrer` ヘッダーがアプリ側から付与されていることも確認する(`src/server.ts` 参照)。cloudflared 自体が別途 TLS を終端するため、アプリ側で HTTPS を扱う必要はない。
