/**
 * 川津小学校PTA サイト公開スクリプト
 *
 * 【使い方】
 * 1. Google ドキュメントを開く
 * 2. メニューに「PTA公開」が表示される
 * 3. 「このドキュメントを公開する」をクリック
 * 4. 確認ダイアログで「はい」→ 数分以内にサイトに反映される
 *
 * 【ドキュメントの書き方】
 * ドキュメントの1行目: 日付（例: 2026-01-22）
 * 2行目以降: 本文
 * タイトル: Google ドキュメントのファイル名がそのまま記事タイトルになります
 *
 * 【初期設定（スクリプトプロパティに以下を設定）】
 * GITHUB_TOKEN  : GitHub の Personal Access Token (repo 権限が必要)
 * GITHUB_OWNER  : GitHub アカウント名 (例: kawatsupta)
 * GITHUB_REPO   : リポジトリ名 (例: kawatsupta.github.io)
 */

// ===== メニューを追加 =====
function onOpen() {
  DocumentApp.getUi()
    .createMenu('PTA公開')
    .addItem('このドキュメントを公開する', 'publishDocument')
    .addSeparator()
    .addItem('会員限定として公開する', 'publishDocumentMembersOnly')
    .addToUi();
}

// ===== 公開（通常） =====
function publishDocument() {
  _publish(false);
}

// ===== 公開（会員限定） =====
function publishDocumentMembersOnly() {
  _publish(true);
}

// ===== メインの公開処理 =====
function _publish(membersOnly) {
  const ui = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();

  // --- メタデータを取得 ---
  const title = doc.getName();
  const body = doc.getBody();
  const firstParagraph = body.getParagraphs()[0].getText().trim();

  // 1行目が日付（YYYY-MM-DD形式）かチェック
  let date = '';
  let contentStartIndex = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstParagraph)) {
    date = firstParagraph;
    contentStartIndex = 1;
  } else {
    // 日付がない場合は今日の日付を使用
    date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    contentStartIndex = 0;
    ui.alert(
      '日付の設定',
      '1行目に日付（例: 2026-01-22）が見つからなかったため、今日の日付（' + date + '）を使用します。',
      ui.ButtonSet.OK
    );
  }

  // --- 確認ダイアログ ---
  const membersLabel = membersOnly ? '【会員限定】' : '';
  const confirmMsg =
    '以下の内容でWebサイトに公開します。よろしいですか？\n\n' +
    'タイトル: ' + title + '\n' +
    '日付: ' + date + '\n' +
    (membersOnly ? '種別: 会員限定\n' : '') +
    '\n※公開後は数分でサイトに反映されます。';

  const result = ui.alert('公開確認', confirmMsg, ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  // --- ドキュメントの本文を HTML に変換 ---
  const html = convertDocToHtml(doc, contentStartIndex);

  // --- ファイル名を生成 (YYYYMMDD-slugified-title.html) ---
  const slug = slugify(title);
  const dateCompact = date.replace(/-/g, '');
  const filename = dateCompact + '-' + slug + '.html';
  const filepath = 'posts/' + filename;
  const postUrl = filepath;

  // --- 完全な HTML ページを生成 ---
  const fullHtml = buildPostPage(title, date, html);

  // --- GitHub に push ---
  try {
    pushToGitHub(filepath, fullHtml, title + ' を公開');
    updatePostsJson(date, title, postUrl, membersOnly);
    ui.alert(
      '公開完了',
      '「' + title + '」を公開しました！\n' +
      '数分後にサイトに反映されます。\n\n' +
      'ファイル: ' + filename,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '公開に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
  }
}

// ===== Google ドキュメントを HTML に変換 =====
function convertDocToHtml(doc, startIndex) {
  const body = doc.getBody();
  const paragraphs = body.getParagraphs();
  let html = '';

  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.getText();
    if (!text.trim()) continue;

    const heading = para.getHeading();
    if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.HEADING2) {
      html += '<h2>' + escapeHtml(text) + '</h2>\n';
    } else if (heading === DocumentApp.ParagraphHeading.HEADING3) {
      html += '<h3>' + escapeHtml(text) + '</h3>\n';
    } else {
      html += '<p>' + escapeHtml(text) + '</p>\n';
    }
  }

  // インライン画像を処理（Google ドライブの画像リンクに置き換え）
  const images = body.getImages();
  // 注意: 画像の自動処理は GAS の制限により難しいため、
  // 画像は Google ドライブにアップし、本文中に以下の形式で記載してください:
  // [画像: DRIVE_FILE_ID]
  // スクリプトがこれを <img> タグに変換します。
  html = html.replace(/\[画像:\s*([^\]]+)\]/g, function(match, fileId) {
    return '<img src="https://drive.google.com/uc?id=' + fileId.trim() + '&export=view" alt="写真">\n';
  });

  return html;
}

// ===== 完全な HTML ページを組み立て =====
function buildPostPage(title, date, bodyHtml) {
  const [y, m, d] = date.split('-');
  const dateLabel = y + '年' + parseInt(m) + '月' + parseInt(d) + '日';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | 川津小学校PTA</title>
  <link rel="stylesheet" href="../css/style.css">
</head>
<body>

<div id="header">
  <h1><a href="../index.html">川津小学校ＰＴＡ</a></h1>
  <a href="https://www.facebook.com/kawatusyouPTA" target="_blank" class="fb-link" title="Facebook">&#x1F1EB;</a>
</div>

<nav id="nav">
  <ul>
    <li><a href="../index.html">ホーム</a></li>
    <li><a href="../event.html">お知らせ</a></li>
    <li><a href="../info.html">役立ち情報</a></li>
    <li><a href="../contact.html">コンタクト</a></li>
  </ul>
</nav>

<div id="main">

  <div class="post-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="post-date">${dateLabel}</div>
  </div>

  <div class="post-body">
${bodyHtml}
  </div>

  <div class="back-link">
    <a href="../event.html">&laquo; お知らせ一覧に戻る</a>
  </div>

</div>

<div id="footer">
  Copyright &copy; 川津小学校ＰＴＡ All Rights Reserved.
</div>

<script src="../js/main.js"></script>
</body>
</html>`;
}

// ===== posts.json を更新 =====
function updatePostsJson(date, title, url, membersOnly) {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');

  // 現在の posts.json を取得
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/posts.json`;
  const getRes = UrlFetchApp.fetch(apiUrl, {
    headers: { 'Authorization': 'token ' + token },
    muteHttpExceptions: true
  });

  let posts = [];
  let sha = null;

  if (getRes.getResponseCode() === 200) {
    const existing = JSON.parse(getRes.getContentText());
    sha = existing.sha;
    posts = JSON.parse(Utilities.newBlob(Utilities.base64Decode(existing.content.replace(/\n/g, ''))).getDataAsString());
  }

  // 新しい投稿を先頭に追加
  const newPost = { date, title, url, members_only: membersOnly };
  // 同じURLがあれば更新、なければ先頭に追加
  const existingIdx = posts.findIndex(p => p.url === url);
  if (existingIdx >= 0) {
    posts[existingIdx] = newPost;
  } else {
    posts.unshift(newPost);
  }

  const content = JSON.stringify(posts, null, 2);
  pushToGitHub('data/posts.json', content, '記事一覧を更新: ' + title, sha);
}

// ===== GitHub API でファイルを push =====
function pushToGitHub(filepath, content, commitMessage, existingSha) {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('GITHUB_OWNER');
  const repo = props.getProperty('GITHUB_REPO');
  const token = props.getProperty('GITHUB_TOKEN');

  if (!owner || !repo || !token) {
    throw new Error(
      'スクリプトプロパティが設定されていません。\n' +
      'GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO を設定してください。'
    );
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filepath}`;

  // 既存ファイルの SHA を取得（ファイルの更新に必要）
  let sha = existingSha;
  if (!sha) {
    const getRes = UrlFetchApp.fetch(apiUrl, {
      headers: { 'Authorization': 'token ' + token },
      muteHttpExceptions: true
    });
    if (getRes.getResponseCode() === 200) {
      sha = JSON.parse(getRes.getContentText()).sha;
    }
  }

  // ファイルを作成 or 更新
  const payload = {
    message: commitMessage,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API エラー: HTTP ' + code + '\n' + putRes.getContentText());
  }
}

// ===== ユーティリティ =====
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(str) {
  // 日本語タイトルをそのまま使うとURLが長くなるので短縮する
  // ファイル名として安全な文字だけ残す
  return str
    .replace(/[^\w\u3040-\u30FF\u4E00-\u9FFF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
