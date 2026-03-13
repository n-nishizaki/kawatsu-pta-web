#!/usr/bin/env python3
"""
ステップ2: 移行済み記事の画像を旧サーバから GitHub リポジトリに移動し、
Markdown 内の URL を GitHub Pages の URL に差し替える。

【フロー】
  1. GitHub _posts/ から migrated-*.md の一覧取得
  2. 各 MD ファイルの内容を取得・Base64 デコード
  3. 旧サーバ画像URL（http://kawatsupta.byonia.net/report/...）を抽出
  4. 画像ごとに:
       a. 旧サーバからダウンロード
       b. GitHub の assets/images/migrated/{YYYYMMDD}/ に push
       c. MD 内の URL を GitHub Pages URL に置換
  5. 更新後の MD を GitHub に push

【使い方】
  python migrate_images.py --dry-run          # 確認のみ（DL・push なし）
  python migrate_images.py                    # 全件実行
  python migrate_images.py --from 20240101    # 2024年以降のみ
  python migrate_images.py --from 20240101 --to 20241231

【設定】
  tools/config.py の PAGES_BASE_URL を設定してください。
  例: PAGES_BASE_URL = 'https://yourname.github.io/kawatsu-pta-web'
"""

import re
import time
import base64
import argparse
import requests

import config

# ──────────────────────────────────────────────────────────────────────────────
# 定数
# ──────────────────────────────────────────────────────────────────────────────

OLD_BASE    = 'http://kawatsupta.byonia.net/report/'
IMAGE_DIR   = 'assets/images/migrated'   # GitHub リポジトリ内のパス
SLEEP_SEC   = 1.0                         # GitHub API レート制限対策

# 旧サーバ画像URL のパターン
# キャプチャ: (filename, date_raw)  例: ('20250925_1.jpg', '20250925')
OLD_IMG_RE = re.compile(
    r'http://kawatsupta\.byonia\.net/report/((\d{8})[^)\s"\']+\.(?:jpe?g|png|gif|webp))',
    re.IGNORECASE
)


# ──────────────────────────────────────────────────────────────────────────────
# GitHub API ヘルパー
# ──────────────────────────────────────────────────────────────────────────────

def _headers():
    return {
        'Authorization': f'token {config.GITHUB_TOKEN}',
        'Content-Type':  'application/json',
    }


def _api(path):
    return (
        f'https://api.github.com/repos/{config.GITHUB_OWNER}/{config.GITHUB_REPO}'
        f'/contents/{path}'
    )


def github_get_file(path):
    """GitHub からファイル情報を取得して (content_str, sha) を返す"""
    resp = requests.get(
        _api(path), headers=_headers(),
        params={'ref': config.GITHUB_BRANCH}, timeout=15
    )
    resp.raise_for_status()
    data    = resp.json()
    content = base64.b64decode(data['content']).decode('utf-8')
    return content, data['sha']


def github_push(path, content_bytes, message, dry_run=False):
    """
    バイナリ or テキスト (bytes) を GitHub に push する。
    既存ファイルがあれば上書き。成功時 True。
    """
    if dry_run:
        return True

    url = _api(path)

    # 既存 sha 取得（上書き更新に必要）
    get_r = requests.get(url, headers=_headers(),
                         params={'ref': config.GITHUB_BRANCH}, timeout=15)
    sha   = get_r.json().get('sha') if get_r.status_code == 200 else None

    payload = {
        'message': message,
        'content': base64.b64encode(content_bytes).decode('ascii'),
        'branch':  config.GITHUB_BRANCH,
    }
    if sha:
        payload['sha'] = sha

    put_r = requests.put(url, headers=_headers(), json=payload, timeout=30)
    return put_r.status_code in (200, 201)


# ──────────────────────────────────────────────────────────────────────────────
# 記事一覧取得
# ──────────────────────────────────────────────────────────────────────────────

def get_migrated_posts():
    """GitHub _posts/ から migrated-*.md のファイル情報リストを返す（日付昇順）"""
    resp = requests.get(
        _api('_posts'), headers=_headers(),
        params={'ref': config.GITHUB_BRANCH}, timeout=15
    )
    resp.raise_for_status()
    files = resp.json()
    result = [
        f for f in files
        if re.match(r'\d{4}-\d{2}-\d{2}-migrated-\d{8}\.md$', f['name'])
    ]
    result.sort(key=lambda f: f['name'])
    return result


# ──────────────────────────────────────────────────────────────────────────────
# 記事ごとの画像移行
# ──────────────────────────────────────────────────────────────────────────────

def process_post(file_info, dry_run=False):
    """
    1記事分の画像移行を実行する。
    返り値: (成功件数, スキップ件数, 失敗件数)
    """
    content, sha = github_get_file(file_info['path'])

    # 旧サーバ画像URL を全て抽出（重複除去・順序保持）
    seen, matches = set(), []
    for m in OLD_IMG_RE.finditer(content):
        filename, date_raw = m.group(1), m.group(2)
        if filename not in seen:
            seen.add(filename)
            matches.append((filename, date_raw))

    if not matches:
        return 0, 0, 0  # 移行済みまたは画像なし

    ok_count = fail_count = 0
    new_content = content

    for filename, date_raw in matches:
        old_url    = OLD_BASE + filename
        asset_path = f'{IMAGE_DIR}/{date_raw}/{filename}'
        new_url    = f'{config.PAGES_BASE_URL}/{asset_path}'

        if not dry_run:
            # ── a. 旧サーバからダウンロード ──
            try:
                img_resp = requests.get(old_url, timeout=20)
                if img_resp.status_code != 200:
                    print(f'      ✗ DL失敗: {filename} (HTTP {img_resp.status_code})')
                    fail_count += 1
                    continue
                img_bytes = img_resp.content
            except Exception as e:
                print(f'      ✗ DL例外: {filename}: {e}')
                fail_count += 1
                continue

            # ── b. GitHub に push ──
            ok = github_push(
                asset_path, img_bytes,
                f'[migrate-img] {filename}'
            )
            if not ok:
                print(f'      ✗ push失敗: {filename}')
                fail_count += 1
                continue

            time.sleep(SLEEP_SEC)

        # ── c. URL 差し替え ──
        new_content = new_content.replace(OLD_BASE + filename, new_url)
        ok_count += 1

    # ── d. MD ファイルを更新 ──
    if ok_count > 0 and new_content != content:
        if not dry_run:
            ok = github_push(
                file_info['path'],
                new_content.encode('utf-8'),
                f'[migrate-img] URL差し替え: {file_info["name"]}',
                dry_run=False
            )
            if not ok:
                print(f'      ✗ MD更新失敗: {file_info["name"]}')
                fail_count += ok_count
                ok_count = 0
            else:
                time.sleep(SLEEP_SEC)

    return ok_count, 0, fail_count


# ──────────────────────────────────────────────────────────────────────────────
# メイン
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='移行済み記事の画像を旧サーバから GitHub Pages に移行する'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='URL抽出の確認のみ（ダウンロード・push はしない）'
    )
    parser.add_argument(
        '--from', dest='from_date', metavar='YYYYMMDD',
        help='処理開始日（この日付以降のみ対象）'
    )
    parser.add_argument(
        '--to', dest='to_date', metavar='YYYYMMDD',
        help='処理終了日（この日付以前のみ対象）'
    )
    args = parser.parse_args()

    print('移行済み記事一覧を GitHub から取得中...')
    posts = get_migrated_posts()

    # 日付フィルター
    if args.from_date or args.to_date:
        def in_range(f):
            m = re.search(r'migrated-(\d{8})\.md$', f['name'])
            d = m.group(1) if m else '00000000'
            if args.from_date and d < args.from_date:
                return False
            if args.to_date and d > args.to_date:
                return False
            return True
        posts = [p for p in posts if in_range(p)]

    print(f'{len(posts)} 件の記事を処理します')
    if args.dry_run:
        print('[DRY RUN モード] ダウンロード・push はスキップします\n')

    total_ok = total_fail = 0

    for i, post in enumerate(posts, 1):
        m        = re.search(r'migrated-(\d{8})\.md$', post['name'])
        date_str = m.group(1) if m else '?'
        label    = f'[{i:3d}/{len(posts)}] {date_str}'

        try:
            ok, skip, fail = process_post(post, dry_run=args.dry_run)
            total_ok   += ok
            total_fail += fail

            if ok == 0 and fail == 0:
                status = '対象なし'
            elif fail > 0:
                status = f'{ok} 枚 OK / {fail} 枚失敗'
            else:
                status = f'{ok} 枚 OK'

            print(f'{label} → {status}')

        except Exception as e:
            print(f'{label} → ERROR: {e}')
            total_fail += 1

    print(f'\n{"=" * 40}')
    print(f'完了: 画像 {total_ok} 枚移行成功, {total_fail} 枚失敗')
    if total_fail > 0:
        print('※ 失敗分は --from/--to で絞り込んで再実行できます')


if __name__ == '__main__':
    main()
