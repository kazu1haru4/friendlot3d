# Friendlot 3D ログイン試作

## ファイル
- `index.html`: ログイン・新規登録UIと3Dゲーム
- `character.json`: キャラカタログ
- `worker.js`: Cloudflare Worker API。JS単体ZIPを別途配布

## 最低限必要な設定
1. Cloudflare Workersの専用Workerに `worker.js` の中身を貼ってDeploy。
2. Settings > BindingsでD1 bindingを追加：Variable name `DB`、database `friendlot3d-db`。
3. Settings > Variables and Secretsで `SESSION_SECRET` をSecretとして設定。32文字以上のランダムな文字列を使う。
4. DeployしたWorkerのURLを、ゲームのログイン画面に入力。
5. GitHub Pagesの同じフォルダに `index.html` と `character.json` を置く。

## 認証
ユーザーIDは英数字とアンダースコア、3〜24文字。パスワードは8〜128文字。PBKDF2-SHA256 + saltで保存し、24時間の署名付きセッションを発行します。管理者ID allowlistは `kazu1haru100` と `kazu1haru4sub`。管理者権限はそのIDで登録したアカウントにだけ付与されます。最初にそれらのIDを登録する人が管理者になるので、管理者IDを登録する前に本人だけが行える状態を確保してください。

## 注意
セーブ取得APIの接続土台はありますが、ゲームの所持キャラ/Cashを自動保存する処理はまだゲーム側に完全統合されていません。公開前に登録を試し、CORSやWorkerの動作を確認してください。既存のフレンドチャットは変更しません。
