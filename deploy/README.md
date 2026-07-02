# デプロイ手順(Raspberry Pi 4B + cloudflared)

デプロイ先は自己ホストの Raspberry Pi 4B。`cloudflared`(Cloudflare Tunnel)経由で `cartographer.optgeo.org` として公開する([DECISIONS.md](../DECISIONS.md) D9)。このディレクトリの内容は Raspberry Pi 上での作業を想定したテンプレート/手順書であり、Claude からは Pi 本体に直接アクセスできないため、実際の適用は運用者が行う。

## 前提

- Raspberry Pi OS (64-bit, aarch64)。依存パッケージ(express, js-yaml, tsx 等)はいずれも Pure JS またはプリビルドの aarch64 バイナリを持つため、追加のクロスコンパイル対応は不要。
- Node.js 22 系(このプロジェクトの動作確認済みバージョン)。
- `cloudflared` がインストール済みで、Cloudflare アカウントに `optgeo.org` ゾーンが登録済みであること。

## 1. Node.js のインストール(未導入の場合)

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v22.x であることを確認
```

## 2. アプリの配置

```sh
cd /home/pi
git clone https://github.com/hfu/faceless-cartographer.git
cd faceless-cartographer
npm install --omit=dev
npm run typecheck   # devDependencies が要るので npm install (dev込み) で一時的に確認してもよい
```

## 3. systemd サービスとして登録

```sh
sudo cp deploy/faceless-cartographer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now faceless-cartographer
sudo systemctl status faceless-cartographer
curl -s http://localhost:3000/ | head -5   # HTML が返れば起動確認OK
```

`deploy/faceless-cartographer.service` の `User`/`WorkingDirectory` は実際の配置(ユーザー名・パス)に合わせて調整すること。

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
npm install --omit=dev
sudo systemctl restart faceless-cartographer
```

## 動作確認

```sh
curl -sI https://cartographer.optgeo.org/ | head -5
```

`Referrer-Policy: no-referrer` ヘッダーがアプリ側から付与されていることも確認する(`src/server.ts` 参照)。cloudflared 自体が別途 TLS を終端するため、アプリ側で HTTPS を扱う必要はない。
