#!/usr/bin/env python3
"""Import the reviewed course snapshot using admin APIs. Safe to rerun: matches chapter/title/text.
Run from project root with .env configured. Does not modify historical attempts or rooms.
"""
import json
import os
import http.cookiejar
import urllib.request
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = json.loads((root / 'content/course-2019.json').read_text())
runpy.run_path(str(root / 'scripts/validate-course.py'))['validate'](source)
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
old_chapters = call('/admin/chapters')
chapter_ids = {}
for n, title in enumerate(source['chapters'], 1):
    title = f'Chương {n}. {title}'
    existing = next((c for c in old_chapters if c['title'] == title), None)
    description = ('100 câu ôn tập · ' +
                   ('Gồm câu Blooket được cung cấp và câu tự biên soạn theo giáo trình 2019.' if n < 3 else
                    '50 câu CSV Nhóm 7 về lập kế hoạch và 50 câu tự biên soạn về ra quyết định.' if n == 3 else
                    'Tự biên soạn theo giáo trình 2019, có lời giải và trang tham khảo.'))
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
questions_by_id = {q['id']: q for q in all_questions}
quizzes = call('/admin/quizzes')
for n, title in enumerate(source['chapters'], 1):
    quiz_title = f'Chương {n} · {title}'
    chapter_texts = {q['text'] for q in source['questions'] if q['chapter'] == n}
    ids = [q['id'] for q in all_questions if q['chapterId'] == chapter_ids[n] and q['text'] in chapter_texts and q['status'] == 'PUBLISHED']
    assert len(ids) == 100, f'Chương {n} cần đúng 100 câu đã xuất bản'
    description = '100 câu ôn tập · Có câu hiểu bản chất và tình huống vận dụng. Nguồn và lời giải theo từng câu; không phải đề thi chính thức.'
    current = next((q for q in quizzes if q['title'] == quiz_title and q['status'] == 'PUBLISHED'), None)
    snapshot_fields = ('text', 'options', 'correct', 'explanation', 'difficulty', 'imageUrl')
    snapshot_current = current and all(
        q['id'] in questions_by_id and all(q[field] == questions_by_id[q['id']][field] for field in snapshot_fields)
        for q in current['questions'])
    if current and {q['id'] for q in current['questions']} == set(ids) and current['description'] == description and snapshot_current:
        continue
    # A new published version archives the old version; its snapshots and results remain intact.
    previous = current or max((q for q in quizzes if q['title'] == quiz_title), key=lambda q: q['version'], default=None)
    call('/admin/quizzes' + ('/' + previous['id'] if previous else ''), {'title': quiz_title,
        'description': description,
        'status': 'PUBLISHED', 'questionIds': ids, 'timeLimitSeconds': 4000,
        'questionSeconds': 30, 'shuffle': True}, 'PUT' if previous else 'POST')

group_title = 'Nhóm 7 · Lập kế hoạch · 50 câu'
if not any(q['title'] == group_title and q['status'] == 'PUBLISHED' for q in quizzes):
    group_texts = {q['text'] for q in source['questions'] if q['source'] == 'csv-nhom7'}
    group_ids = [q['id'] for q in all_questions if q['chapterId'] == chapter_ids[3] and q['text'] in group_texts and q['status'] == 'PUBLISHED']
    assert len(group_ids) == 50, 'Bộ Nhóm 7 cần đủ 50 câu trước khi xuất bản'
    call('/admin/quizzes', {'title': group_title,
        'description': 'Nguồn: Nhom 7 - Quizz.csv · Giữ đáp án từ tệp được cung cấp',
        'status': 'PUBLISHED', 'questionIds': group_ids, 'timeLimitSeconds': 2000,
        'questionSeconds': 30, 'shuffle': True})

# Archive four superseded basic questions only after replacement quizzes were published.
archive = json.loads((root / 'content/archived-basic-questions.json').read_text())
superseded = {(chapter_ids[q['chapter']], q['text']) for q in archive['questions']}
for q in existing_questions:
    if (q['chapterId'], q['text']) in superseded and q['status'] != 'ARCHIVED':
        call('/admin/questions/' + q['id'], q | {'status': 'ARCHIVED'}, 'PUT')

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
          'chapterCounts': {n: next(c['count'] for c in catalog['chapters'] if c['id'] == chapter_ids[n]) for n in chapter_ids},
          'chapterIds': chapter_ids}
assert result['courseQuestions'] == 800 and all(v == 100 for v in result['chapterCounts'].values()), result
(root / 'work').mkdir(exist_ok=True)
(root / 'work/course-import.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
call('/auth/logout', {})
print(json.dumps(result | {'chapterIds': 'saved in work/course-import.json'}, ensure_ascii=False))
