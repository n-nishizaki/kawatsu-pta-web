/**
 * 川津小学校PTA スプレッドシート連携スクリプト
 *
 * 【このスクリプトの設定場所】
 * Google ドキュメントではなく、スプレッドシート（info）に設定します。
 * スプレッドシートを開いて「拡張機能」→「Apps Script」からこのファイルを貼り付けてください。
 *
 * 【初期設定（スクリプトプロパティに以下を設定）】
 * GITHUB_TOKEN  : GitHub Fine-grained Personal Access Token (Contents: Read and Write)
 * GITHUB_OWNER  : GitHub アカウント名 (例: kawatsupta)
 * GITHUB_REPO   : リポジトリ名 (例: kawatsu-pta-web)
 */

// ===== メニューを追加 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PTA公開')
    .addItem('サイト情報を更新する（ご挨拶・役立ち情報・リンク集）', 'publishSiteInfo')
    .addToUi();
}

// ===== サイト情報を更新 =====
function publishSiteInfo() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'サイト情報の更新',
    'このスプレッドシートの内容でご挨拶・役立ち情報・リンク集を更新します。\nよろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- ご挨拶 ---
    var greetingSheet = ss.getSheetByName('ご挨拶');
    var greetingText = String(greetingSheet.getRange('B1').getValue());
    var greetingJson = JSON.stringify({ text: greetingText });
    pushToGitHub('_data/greeting.json', greetingJson, 'ご挨拶を更新');

    // --- 役立ち情報 ---
    var infoSheet = ss.getSheetByName('役立ち情報');
    var infoRows = infoSheet.getDataRange().getValues();
    var links = infoRows
      .filter(function(row) { return String(row[0]).trim(); })
      .map(function(row) {
        var title = String(row[0]).trim();
        var membersOnly = title.indexOf('【会員限定】') >= 0;
        return {
          name:         title.replace('【会員限定】', '').trim(),
          desc:         String(row[1] || '').trim(),
          url:          String(row[2] || '#').trim(),
          members_only: membersOnly
        };
      });

    // --- リンク集 ---
    var linkSheet = ss.getSheetByName('リンク集');
    var linkRows = linkSheet.getDataRange().getValues();
    var extLinks = linkRows
      .filter(function(row) { return String(row[0]).trim(); })
      .map(function(row) {
        return {
          name: String(row[0]).trim(),
          url:  String(row[1] || '#').trim()
        };
      });

    var infoJson = JSON.stringify({ links: links, ext_links: extLinks });
    pushToGitHub('_data/info.json', infoJson, '役立ち情報・リンク集を更新');

    ui.alert(
      '更新完了',
      'サイト情報を更新しました！\n数分後にサイトに反映されます。',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('エラー', '更新に失敗しました。\n\nエラー内容:\n' + e.message, ui.ButtonSet.OK);
    console.error(e);
  }
}

// ===== GitHub API でファイルを作成・更新 =====
function pushToGitHub(filepath, content, commitMessage) {
  var props = PropertiesService.getScriptProperties();
  var owner = props.getProperty('GITHUB_OWNER');
  var repo  = props.getProperty('GITHUB_REPO');
  var token = props.getProperty('GITHUB_TOKEN');

  if (!owner || !repo || !token) {
    throw new Error(
      'スクリプトプロパティが設定されていません。\n' +
      'GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO を設定してください。'
    );
  }

  var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filepath;

  // 既存ファイルの SHA を取得（更新時に必要）
  var sha;
  var getRes = UrlFetchApp.fetch(apiUrl, {
    headers: { 'Authorization': 'token ' + token },
    muteHttpExceptions: true
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  // ファイルを作成または更新
  var payload = {
    message: commitMessage,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  var putRes = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub API エラー: HTTP ' + code + '\n' + putRes.getContentText());
  }
}
