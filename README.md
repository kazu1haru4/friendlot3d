# Friendlot 3D (starter)

スマホ・タブレットのブラウザで遊ぶ、Three.js ベースの3Dワールド試作です。

## 起動
静的サイトとして配信してください。`index.html` を `file://` で直接開くと `character.json` の読み込みが制限される場合があります。

- GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save
- Cloudflare Pages: GitHub リポジトリを接続し、Framework preset `None`、Build command は空欄、Build output directory は `/` に設定

## キャラを追加する
`character.json` の `characters` 配列にオブジェクトを追加します。

```json
{
  "id": "new-character",
  "name": "新キャラ",
  "emoji": "⭐",
  "color": "#8f7cff",
  "accent": "#fff0c8",
  "rarity": "レア"
}
```

- `id`: 英数字とハイフンで一意にする
- `name`: ゲーム内表示名
- `emoji`: 図鑑でのアイコン
- `color`: キャラのメイン色（HEX）
- `accent`: お腹・足などの差し色（HEX）
- `rarity`: レア度表示用データ

## 今の段階でできること
- 3Dフィールド、木、道、追従カメラ
- キーボード操作とスマホ用バーチャルスティック
- ジャンプ
- `character.json` からキャラを読み込み、フィールドに配置
- 仮のキャラクターモデルを自動生成

## まだ未実装
オンラインマルチプレイ、アカウント認証、セーブデータ、購入・収益システム、管理者機能、正式なキャラモデル/アニメーションはこれから追加します。
このスターターはそれらを実装済みと装うものではありません。

## Cloudflare Worker
`worker/worker.js` は任意の D1 バインディング `DB` を確認するだけの安全な初期エンドポイントです。D1 に接続しただけでは、ゲームのセーブ機能やログイン機能はできません。実データを扱う前に認証・権限チェック・テーブル設計を追加してください。
