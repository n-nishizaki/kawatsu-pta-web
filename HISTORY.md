# 作業履歴 — 川津小学校PTA Webサイト リプレイス

> 作成: 2026-03-10
> リポジトリ: `n-nishizaki/kawatsu-pta-web`
> 公開URL: `https://n-nishizaki.github.io/kawatsu-pta-web/`

---

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| 現行サイト | http://kawatsupta.byonia.net/ （レンタルサーバー・HTML直編集） |
| 目標 | **0円運用** かつ **非技術者でも更新可能** |
| 採用アーキテクチャ | Google ドキュメント → GAS → GitHub API → GitHub Pages（Jekyll） |

---

## 作業セッション履歴

### セッション 1（2026-03-09 前半）— 基盤構築

#### 実施内容

**アーキテクチャ設計**
- Google ドキュメント → GAS → GitHub API → Jekyll/Markdown という構成に決定
- 当初は GAS が直接 HTML を生成する案もあったが、Google Docs のインラインスタイル混入問題を避けるため Markdown 経由に変更

**サイトテンプレート作成**（`e0d7b44` 初回公開）
- Jekyll ベースの静的サイト構成を構築
  - `_layouts/default.html` — 共通レイアウト（ヘッダー・ナビ・フッター）
  - `index.html` — ホーム（更新情報一覧 + 執行部挨拶）
  - `info.html` — 役立ち情報
  - `contact.html` — コンタクト（Google フォーム埋め込み）
  - `event.html` — お知らせ一覧（年別・月別グルーピング）
  - `css/style.css` — 現行サイトに準じたシンプルデザイン
- `_config.yml` に `baseurl: /kawatsu-pta-web` を設定

**旧アーキテクチャからの移行**（`2e60250`）
- 初期に試した `data/posts.json` + `posts/*.html` 方式を廃止
- Jekyll の `_posts/` Markdown 方式に一本化

**GAS スクリプト作成**（`gas/Code.gs`）
- Google ドキュメントに「PTA公開」カスタムメニューを追加
- `publishDocument()` — ドキュメントを Markdown に変換して `_posts/YYYY-MM-DD-*.md` として GitHub に push
- `publishDocumentMembersOnly()` — `members_only: true` フロントマターを付与して会員限定扱いにして公開
- Markdown 変換で対応する書式: 見出し・太字・斜体・箇条書き・リンク

**バグ修正・改善**
- `relative_url` フィルタ未使用による CSS/JS リンク切れを修正（`f84e267`）
- Google Drive URL を `uc?id=` 形式から `lh3.googleusercontent.com` 形式に統一（`b58254e`, `1905997`）
  理由: `uc?id=` は GitHub Pages からの参照でリダイレクトが発生し表示が不安定
- GAS にてテキスト変換を強化: 太字(`**`)・斜体(`*`)・文字色・フォントサイズを Markdown/HTML に変換する `convertTextToMarkdown()` を追加（`101c4b0`）
- Google フォームの iframe 埋め込みを `contact.html` に設置（`f84e267`）

---

### セッション 2（2026-03-09 後半）— スプレッドシート連携・各種修正

#### 実施内容

**スプレッドシート連携の実装**（`3b100cc`, `340fb65`）

ホームの「ご挨拶」・役立ち情報・リンク集を Google スプレッドシートから更新できる仕組みを構築。

スプレッドシート構成（ID: `14UI3jfK5OBSsoqm2xDgOWKReUNDUipVK_mlGJaiYBHc`）:

| シート名 | カラム構成 |
|---|---|
| ご挨拶 | A1: ラベル, B1: 本文テキスト |
| 役立ち情報 | A: タイトル（`【会員限定】`プレフィックスで会員限定フラグ）, B: 説明, C: URL |
| リンク集 | A: 名称, B: URL |

実装方式:
- `_data/greeting.json` — ご挨拶テキストを格納
- `_data/info.json` — 役立ち情報リンク・外部リンクを格納
- `index.html`, `info.html` を Liquid テンプレートに更新（`site.data.greeting`, `site.data.info` を参照）
- 「会員限定」バッジ（`.badge-members`）を Liquid 条件分岐で表示制御

**GAS をドキュメント用とスプレッドシート用に分離**（`4fdfae7`）

| ファイル | バインド先 | 主な機能 |
|---|---|---|
| `gas/Code.gs` | Google ドキュメント | `publishDocument()` — 記事を Markdown に変換して push |
| `gas/SpreadsheetCode.gs` | Google スプレッドシート | `publishSiteInfo()` — ご挨拶・役立ち情報・リンク集を JSON として push |

分離の背景: `DocumentApp.getUi()` は Google ドキュメントにのみメニューを追加できる。スプレッドシートのメニューには `SpreadsheetApp.getUi()` を使うスクリプトを別途バインドする必要がある。

**ご挨拶の改行対応**（`5715064`）
- スプレッドシートから取得したテキスト内の `\n` が HTML で無視される問題を修正
- `index.html` の Liquid テンプレートに `| newline_to_br` フィルターを追加

**ヒーロー画像の表示修正**（`5715064`）
- 現行サイト（http://kawatsupta.byonia.net/）に合わせ、画像を切り抜きなしで全体表示に変更

```css
/* 修正前 */
#hero { max-height: 280px; overflow: hidden; }
#hero img { height: 280px; object-fit: cover; }

/* 修正後 */
#hero { width: 100%; }
#hero img { width: 100%; height: auto; display: block; }
```

**キャッシュ問題の調査と修正**

*症状*: CSS の変更がブラウザに反映されない。`curl` では正しい内容が返るが、ブラウザでは古いファイルが表示される。

*調査結果*: `n-nishizaki.github.io` の個人ブログ（Chirpy テーマ）が PWA Service Worker をルートスコープ (`https://n-nishizaki.github.io/`) で登録しており、サブパス `kawatsu-pta-web/` 配下のリクエストもキャッシュファーストで返していた。

*修正*: `n-nishizaki.github.io/_config.yml` の `pwa.cache.deny_paths` に `/kawatsu-pta-web` を追加し、GitHub API 経由でコミット（commit: `273fec5`）。

```yaml
# n-nishizaki.github.io/_config.yml
pwa:
  cache:
    deny_paths:
      - "/kawatsu-pta-web"   # ← 追加
```

*ブラウザ側の対処*: 上記変更のデプロイ後、Chrome の DevTools → Application → Service Workers → Unregister で古い SW を手動削除する（または シークレットモードで確認）。

---

## 現在の git ログ（最新順）

```
5715064 ご挨拶の改行対応 & ヒーロー画像を全体表示に修正
d012e86 役立ち情報・リンク集を更新
a6d7a61 ご挨拶を更新
4fdfae7 GAS をドキュメント用とスプレッドシート用に分離
340fb65 スプレッドシート連携：テンプレートとGASスクリプト更新
3b100cc スプレッドシート連携：ご挨拶・役立ち情報・リンク集をデータ化
217fc34 テスト記事です を公開
f84e267 Google フォーム埋め込み・ヒーロー画像設定・relative_url バグ修正
101c4b0 GAS: 太字・斜体・文字色・フォントサイズをMarkdown/HTMLに変換するconvertTextToMarkdownを追加
...（以下省略）
e0d7b44 初回公開: Jekyll/Markdown ベース PTA サイト
```

---

## 主要ファイル構成

```
PTA-web/
├── _config.yml           # Jekyll 設定（baseurl, title 等）
├── _layouts/
│   └── default.html      # 共通レイアウト（ヘッダー・ナビ・フッター）
├── _data/
│   ├── greeting.json     # ご挨拶テキスト（スプレッドシートから自動更新）
│   └── info.json         # 役立ち情報・リンク集（スプレッドシートから自動更新）
├── _posts/               # 記事（GAS が自動生成・push）
├── css/
│   └── style.css         # サイトスタイル
├── js/
│   └── auth.js           # 会員限定コンテンツ制御
├── gas/
│   ├── Code.gs           # Google ドキュメントバインド用（記事投稿）
│   └── SpreadsheetCode.gs # スプレッドシートバインド用（サイト情報更新）
├── docs/
│   ├── requirements.md   # 要件定義書
│   └── setup.md          # 初期設定手順
├── index.html            # ホーム
├── event.html            # お知らせ一覧
├── info.html             # 役立ち情報
└── contact.html          # コンタクト
```

---

## 残課題・今後の作業

| # | タスク | 優先度 |
|---|---|---|
| 1 | キャッシュ問題：ブラウザの古い Service Worker を削除して動作確認 | 高 |
| 2 | Google フォームの作成（コンタクト用） | 高 |
| 3 | Google ドライブの整備（会員限定ファイルの共有設定） | 中 |
| 4 | 担当者向けマニュアルの作成 | 中 |
| 5 | 公開・旧サイトとの並行運用開始 | 中 |
| 6 | GAS スクリプトプロパティの設定手順をマニュアルに追記 | 中 |
| 7 | 旧サイトアーカイブ（Google ドライブに保存） | 低 |
| 8 | 旧サイト閉鎖 | 低（移行安定後） |
