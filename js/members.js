/**
 * 会員専用ページ 復号・表示ロジック
 *
 * セキュリティ設計:
 * - このファイルにパスワードは一切書かれていない
 * - ユーザーが入力したパスワードが復号キー（SHA-256）になる
 * - 復号結果が valid JSON かどうかで認証チェックを兼ねる
 */

// Enter キーでログイン
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('member-pw').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') memberLogin();
  });
  document.getElementById('member-id').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('member-pw').focus();
  });
});

// ===== 暗号化ユーティリティ（XOR + SHA-256 キー）=====

async function getKey(password) {
  const data = new TextEncoder().encode(password);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function decrypt(base64, password) {
  const key = await getKey(password);
  const bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
  const plain = bytes.map(function (b, i) { return b ^ key[i % 32]; });
  return new TextDecoder().decode(plain);
}

// ===== ログイン処理 =====

async function memberLogin() {
  var id = document.getElementById('member-id').value.trim();
  var pw = document.getElementById('member-pw').value.trim();
  var btn = document.getElementById('login-btn');

  // ID チェック（非秘密な識別子）
  if (id !== 'PTA') {
    showLoginError('IDまたはパスワードが違います');
    return;
  }

  if (!pw) {
    showLoginError('パスワードを入力してください');
    return;
  }

  btn.disabled = true;
  btn.textContent = '確認中...';
  hideLoginError();

  try {
    // 暗号化データを取得（MEMBERS_DATA_URL は members.html で Jekyll が生成）
    var dataUrl = typeof MEMBERS_DATA_URL !== 'undefined'
      ? MEMBERS_DATA_URL
      : '/data/members.json';
    var resp = await fetch(dataUrl);

    if (!resp.ok) throw new Error('データ取得失敗: ' + resp.status);

    var json = await resp.json();

    // データ未設定の場合
    if (!json.data) {
      showContent({ sports_clubs: [], newsletters: [] });
      return;
    }

    // 復号を試みる（失敗 = パスワード間違い）
    var plain;
    try {
      plain = await decrypt(json.data, pw);
    } catch (e) {
      showLoginError('IDまたはパスワードが違います');
      return;
    }

    // valid JSON かチェック（= パスワード正否の判定）
    var content;
    try {
      content = JSON.parse(plain);
    } catch (e) {
      showLoginError('IDまたはパスワードが違います');
      return;
    }

    // 認証成功 → コンテンツ表示
    showContent(content);

  } catch (e) {
    showLoginError('エラーが発生しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ログイン';
  }
}

// ===== コンテンツ表示 =====

function showContent(content) {
  document.getElementById('login-area').style.display = 'none';
  document.getElementById('members-content').style.display = 'block';

  var hasContent = false;

  // スポ少情報
  if (content.sports_clubs && content.sports_clubs.length > 0) {
    var tbody = document.getElementById('sports-tbody');
    tbody.innerHTML = '';
    content.sports_clubs.forEach(function (club, idx) {
      var tr = document.createElement('tr');
      tr.style.background = idx % 2 === 0 ? '#f9f9f9' : '#fff';
      tr.innerHTML =
        '<td style="padding:10px 8px; border-bottom:1px solid #eee;">' + esc(club.name) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:pre-wrap;">' + esc(club.days) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:nowrap;">' + esc(club.grades) + '</td>' +
        '<td style="padding:10px 8px; border-bottom:1px solid #eee; white-space:nowrap;">' + esc(club.contact) + '</td>';
      tbody.appendChild(tr);
    });
    document.getElementById('section-sports').style.display = 'block';
    hasContent = true;
  }

  // 広報誌バックナンバー
  if (content.newsletters && content.newsletters.length > 0) {
    var ul = document.getElementById('newsletter-list');
    ul.innerHTML = '';
    content.newsletters.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.innerHTML =
        '<a href="' + esc(item.url) + '" target="_blank" rel="noopener">' +
          esc(item.label) + '：<span style="text-decoration:underline;">ＰＤＦファイル</span>' +
          (item.size ? '　（File Size ' + esc(item.size) + '）' : '') +
          (idx === 0 ? '　<span style="background:#e00;color:#fff;font-size:0.75em;padding:2px 6px;border-radius:2px;vertical-align:middle;">NEW</span>' : '') +
        '</a>';
      ul.appendChild(li);
    });
    document.getElementById('section-newsletter').style.display = 'block';
    hasContent = true;
  }

  if (!hasContent) {
    document.getElementById('section-empty').style.display = 'block';
  }
}

// ===== ヘルパー =====

function showLoginError(msg) {
  var el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideLoginError() {
  document.getElementById('login-error').style.display = 'none';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
