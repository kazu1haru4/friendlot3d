# FRIENDLOT 3D サーバー選択ファイル

## 同梱物
- `server-select.html`：公開サーバー／プライベートサーバーの選択画面
- `server-api-addon.js`：既存Cloudflare Workerに追加するAPIルート例

## 重要
これはサーバー選択画面とD1サーバールーム機能の**導入用ひな形**です。既存の`index.html`の3Dシーンを維持するため、既存ゲームを上書きしません。現状のままではリアルタイム同期、盗難の確定処理、通知、サーバー退出・再接続、招待管理画面までは完成していません。`server-select.html`の入室ボタンはWorkerにルートを追加するまでエラーになります。

## 1. HTMLを置く
`server-select.html`をGitHub Pagesで`index.html`と同じフォルダに追加します。まずはログイン後に`server-select.html`を開いて画面を確認できます。
サーバー選択後は`index.html`に戻り、選択したルーム情報が`sessionStorage.friendlot3d_server`に入ります。既存ゲームはまだこの情報を使っていないため、ゲーム側の接続処理は別途必要です。

## 2. Worker APIを追加する
1. Cloudflareの`riendlot3d-api` Workerの現在のコードをバックアップします。
2. `server-api-addon.js`の`handleServerRoutes`と補助関数を既存Workerコードへ追加します。
3. 既存の`fetch`処理で、ログイン済みユーザーを既存JWT検証で取得した後、通常ルート処理の前に次を呼びます。

```js
const serverResponse = await handleServerRoutes(request, env, user);
if (serverResponse) return serverResponse;
```

`user`は既存の認証検証結果で、`user.id`がログイン中のユーザーIDになるよう接続してください。クライアントから送られたIDをそのまま信用しないでください。実際のWorkerでユーザーオブジェクトの形式が違う場合は合わせる必要があります。

4. D1 binding名が`DB`であることを確認してからDeployします。
5. ログイン後に`server-select.html`を開き、入室APIをテストします。

## 3. 本番化する前に必要
- ゲーム内の全アクションをサーバー権威で検証する（購入、収益、盗難、返却、キャラ所有権）
- WebSocket/Durable Objectsなどを使ったリアルタイム同期
- 参加者一覧、退出、再接続、満員処理、サーバーの寿命管理
- 招待コードの再発行・無効化、オーナー退出時の扱い
- プライベートサーバー状態と各ユーザーのセーブの整合性テスト

**注意：** サンプルの`state/set`は参加メンバーなら状態JSONを書き換えられる試作APIです。本番ゲームでそのまま使うと不正なキャラ・Cashの変更ができるため、盗難や経済データには使用しないでください。既存のログイン・セーブAPIを置き換えないでください。
