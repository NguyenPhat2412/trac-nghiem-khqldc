#!/usr/bin/env python3
"""Import the reviewed course snapshot using admin APIs. Safe to rerun: matches chapter/title/text.
Run from project root with .env configured. Does not modify historical attempts or rooms.
"""
import json
import os
import http.cookiejar
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
           if '=' in line and not line.startswith('#'))
base = os.environ.get('VJU_URL', 'http://localhost:3000').rstrip('/')
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf = ''


def call(path, body=None, method=None):
    req = urllib.request.Request(base + '/api' + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method or ('POST' if body is not None else 'GET'),
        headers={'Content-Type': 'application/json', 'Origin': base, 'X-CSRF-Token': csrf})
    with client.open(req, timeout=60) as r:
        return json.load(r)


actor = call('/auth/login', {'username': env.get('ADMIN_USERNAME', 'admin'), 'password': env['ADMIN_PASSWORD']})
csrf = actor['csrf']
assert actor['role'] == 'ADMIN'
source = json.loads((root / 'content/course-2019.json').read_text())
old_chapters = call('/admin/chapters')
chapter_ids = {}
for n, title in enumerate(source['chapters'], 1):
    title = f'Chương {n}. {title}'
    existing = next((c for c in old_chapters if c['title'] == title), None)
    description = ('Theo giáo trình 2019. Câu hỏi từ Blooket do người dùng cung cấp.' if n < 3 else
                   'Theo giáo trình 2019. Gồm 50 câu từ CSV Nhóm 7 và 4 câu ôn tập cơ bản tự biên soạn.' if n == 3 else
                   'Theo giáo trình 2019. Câu ôn tập cơ bản tự biên soạn; có trang tham khảo trong lời giải.')
    chapter = existing or call('/admin/chapters', {
        'title': title, 'position': n, 'status': 'PUBLISHED',
        'description': description})
    if existing and existing['description'] != description:
        chapter = call('/admin/chapters/' + existing['id'], existing | {'description': description}, 'PUT')
    chapter_ids[n] = chapter['id']
existing_questions = call('/admin/questions')
known = {(q['chapterId'], q['text']) for q in existing_questions}
pending = []
for q in source['questions']:
    chapter_id = chapter_ids[q['chapter']]
    if (chapter_id, q['text']) not in known:
        pending.append({k: q[k] for k in ('text', 'options', 'correct', 'explanation', 'difficulty')} |
                       {'chapterId': chapter_id, 'status': 'PUBLISHED', 'imageUrl': ''})
if pending:
    call('/admin/import/commit', pending)
all_questions = call('/admin/questions')
quizzes = call('/admin/quizzes')
for n, title in enumerate(source['chapters'], 1):
    quiz_title = f'Chương {n} · {title}'
    if any(q['title'] == quiz_title and q['status'] == 'PUBLISHED' for q in quizzes):
        continue
    # Keep the original chapter quiz snapshot separate from the later Nhóm 7 bank.
    chapter_texts = {q['text'] for q in source['questions'] if q['chapter'] == n and q['source'] != 'csv-nhom7'}
    ids = [q['id'] for q in all_questions if q['chapterId'] == chapter_ids[n] and q['text'] in chapter_texts and q['status'] == 'PUBLISHED']
    call('/admin/quizzes', {'title': quiz_title,
        'description': 'Nguồn Blooket · Chương 1–2' if n < 3 else 'Tự biên soạn theo giáo trình 2019 · Ôn tập cơ bản',
        'status': 'PUBLISHED', 'questionIds': ids, 'timeLimitSeconds': max(240, len(ids) * 40),
        'questionSeconds': 30, 'shuffle': True})

group_title = 'Nhóm 7 · Lập kế hoạch · 50 câu'
if not any(q['title'] == group_title and q['status'] == 'PUBLISHED' for q in quizzes):
    group_texts = {q['text'] for q in source['questions'] if q['source'] == 'csv-nhom7'}
    group_ids = [q['id'] for q in all_questions if q['chapterId'] == chapter_ids[3] and q['text'] in group_texts and q['status'] == 'PUBLISHED']
    assert len(group_ids) == 50, 'Bộ Nhóm 7 cần đủ 50 câu trước khi xuất bản'
    call('/admin/quizzes', {'title': group_title,
        'description': 'Nguồn: Nhom 7 - Quizz.csv · Giữ đáp án từ tệp được cung cấp',
        'status': 'PUBLISHED', 'questionIds': group_ids, 'timeLimitSeconds': 2000,
        'questionSeconds': 30, 'shuffle': True})

# Archive only the original, explicitly labelled demo content, after successful import.
demo = {c['id'] for c in old_chapters if c['description'] == 'Dữ liệu minh họa · Cần đối chiếu giáo trình trước khi sử dụng chính thức.'}
for q in quizzes:
    if q['status'] == 'PUBLISHED' and q['description'] == 'Bộ câu hỏi minh họa':
        call('/admin/quizzes/' + q['id'], {
            'title': q['title'], 'description': q['description'], 'status': 'ARCHIVED',
            'questionIds': [x['id'] for x in q['questions']], 'shuffle': q['shuffle'],
            'timeLimitSeconds': q['timeLimitSeconds'], 'questionSeconds': q['questionSeconds']}, 'PUT')
for c in old_chapters:
    if c['id'] in demo:
        call('/admin/chapters/' + c['id'], c | {'status': 'ARCHIVED'}, 'PUT')
for q in existing_questions:
    if q['chapterId'] in demo:
        call('/admin/questions/' + q['id'], q | {'status': 'ARCHIVED'}, 'PUT')
catalog = call('/catalog')
result = {'chapters': len(chapter_ids), 'importedNow': len(pending),
          'courseQuestions': sum(c['count'] for c in catalog['chapters'] if c['id'] in chapter_ids.values()),
          'chapterIds': chapter_ids}
(root / 'work').mkdir(exist_ok=True)
(root / 'work/course-import.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
call('/auth/logout', {})
print(json.dumps(result | {'chapterIds': 'saved in work/course-import.json'}, ensure_ascii=False))
