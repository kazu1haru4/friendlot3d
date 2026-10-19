# フレンドロット3D：管理者イベント版

## 管理者ID
- `kazu1haru100`
- `kazu1haru4sub`

IDだけでログインできる設計ではありません。Worker側にそれぞれのパスワードをSecretとして設定してください。パスワードをチャットや公開HTMLに書かないでください。

## ファイル
- `index.html`: ゲームと管理者パネル
- `character.json`: キャラデータ
- `worker.js`: Cloudflare Worker API（JS単体ZIPで別途配布）
- `schema.sql`: D1テーブル定義（Workerが初回アクセス時に自動作成するため通常は不要）

## Cloudflare Worker設定
1. Workerコードを `worker.js` に置き換える。
2. Settings > Bindings で D1 database binding を追加。Variable name は `DB`、database は `friendlot3d-db`。
3. Settings > Variables and Secrets で以下の **Secrets** を追加する（通常の変数ではなくSecret推奨）。
   - `ADMIN_KAZU1HARU100_PASSWORD`: 管理者ID `kazu1haru100` の強いパスワード
   - `ADMIN_KAZU1HARU4SUB_PASSWORD`: 管理者ID `kazu1haru4sub` の別の強いパスワード
   - `SESSION_SECRET`: 32文字以上のランダムな秘密文字列
4. Deployする。
5. GitHub Pagesの `index.html` と `character.json` を更新する。
6. ゲーム内の「管理者」→ API URL に WorkerのURLを入れてログイン。

## 動作
- 管理者パネルで属性イベントを開始・終了
- イベント状態をD1に保存し、全プレイヤーが `/api/event` から読める
- 5/10/15/30分の自動終了
- Worker側でID許可リスト、パスワード、1時間の署名付きセッションを検証

## 大事な制限
この実装は管理者イベントの状態を共有しますが、現時点ではイベントによるキャラ出現率・属性見た目・収益倍率のゲーム内効果までは適用していません。また既存ゲーム自体はアカウントログインやマルチプレイを持っていません。オンラインの全プレイヤーに実際のイベント効果を反映するには、ゲームAPIとキャラ出現処理もWorker側に接続する必要があります。管理者パスワードは必ず自分でCloudflareのSecret設定画面に入力し、チャットで送らないでください。
