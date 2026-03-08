/**
 * PTA サイト 共通 JavaScript
 * - 現在のページに合わせてナビをハイライト
 * - ホームページの更新情報を posts.json から動的に読み込み
 * - お知らせページの投稿リストを posts.json から動的に読み込み
 */

// ===== ナビのアクティブ状態を設定 =====
(function setActiveNav() {
  const path = location.pathname;
  const links = document.querySelectorAll('#nav a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === 'index.html' && (path.endsWith('/') || path.endsWith('index.html'))) {
      link.classList.add('active');
    } else if (href !== 'index.html' && path.endsWith(href)) {
      link.classList.add('active');
    }
  });
})();

// ===== posts.json を取得するユーティリティ =====
async function fetchPosts() {
  const res = await fetch('data/posts.json');
  if (!res.ok) throw new Error('posts.json の読み込みに失敗しました');
  return res.json();
}

// ===== 投稿日から「NEW」バッジを表示するか判定（30日以内） =====
function isNew(dateStr) {
  const postDate = new Date(dateStr);
  const diff = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30;
}

// ===== ホームページ：更新情報リストを表示 =====
async function renderHomeNews(containerId, limit = 20) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const posts = await fetchPosts();
    const recent = posts.slice(0, limit);

    if (recent.length === 0) {
      container.innerHTML = '<li class="loading">記事がありません</li>';
      return;
    }

    container.innerHTML = recent.map(post => {
      const newBadge = isNew(post.date) ? '<span class="badge-new">NEW</span>' : '';
      const membersBadge = post.members_only ? '<span class="badge-members">会員限定</span>' : '';
      const dateLabel = post.date.replace(/-/g, '/');
      const link = post.url
        ? `<a href="${post.url}">${post.title}</a>`
        : post.title;
      return `
        <li>
          <span class="date">${dateLabel}</span>
          <span class="title">${link}${newBadge}${membersBadge}をアップしました。</span>
        </li>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<li class="loading">読み込みエラー</li>';
    console.error(e);
  }
}

// ===== お知らせページ：年/月別リストを表示 =====
async function renderEventList(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p class="loading">読み込み中...</p>';

  try {
    const posts = await fetchPosts();

    // 年→月→記事 の構造に整理
    const grouped = {};
    posts.forEach(post => {
      const [year, month] = post.date.split('-');
      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = [];
      grouped[year][month].push(post);
    });

    const years = Object.keys(grouped).sort((a, b) => b - a);

    container.innerHTML = years.map(year => {
      const months = Object.keys(grouped[year]).sort((a, b) => b - a);
      const monthsHtml = months.map(month => {
        const items = grouped[year][month];
        const itemsHtml = items.map(post => {
          const day = post.date.split('-')[2];
          const newBadge = isNew(post.date) ? '<span class="badge-new">NEW</span>' : '';
          const membersBadge = post.members_only ? '<span class="badge-members">会員限定</span>' : '';
          const link = post.url
            ? `<a href="${post.url}">${post.title}</a>`
            : post.title;
          return `<li><span class="day">${parseInt(day, 10)}日</span><span>${link}${newBadge}${membersBadge}</span></li>`;
        }).join('');
        return `
          <div class="month-group">
            <div class="month-label">${parseInt(month, 10)}月</div>
            <ul class="post-list">${itemsHtml}</ul>
          </div>`;
      }).join('');

      return `
        <div class="year-group">
          <h2>${year}年</h2>
          ${monthsHtml}
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="loading">読み込みエラー</p>';
    console.error(e);
  }
}
