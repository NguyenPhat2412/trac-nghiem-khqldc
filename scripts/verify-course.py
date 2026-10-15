#!/usr/bin/env python3
"""Read back the imported bank and exercise a 100-question practice attempt locally.

Creates one clearly named, unranked verification attempt; does not modify course content.
An optional pre-import snapshot in work/course-before-800.json checks preserved versions.
"""
import http.cookiejar
import json
import os
import runpy
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('VJU_URL', 'http://localhost:3000').rstrip('/')
env = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines()
           if '=' in line and not line.startswith('#'))


class Client:
    def __init__(self):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''

    def call(self, path, data=None, method=None):
        req = urllib.request.Request(BASE + '/api' + path,
            data=json.dumps(data).encode() if data is not None else None,
            method=method or ('POST' if data is not None else 'GET'),
            headers={'Content-Type': 'application/json', 'Origin': BASE, 'X-CSRF-Token': self.csrf})
        with self.http.open(req, timeout=60) as response:
            result = json.load(response)
        if isinstance(result, dict) and 'csrf' in result:
            self.csrf = result['csrf']
        return result


checks = []


def check(name, ok):
    assert ok, name
    checks.append(name)
    print('PASS', name)


source = json.loads((ROOT / 'content/course-2019.json').read_text())
summary = runpy.run_path(str(ROOT / 'scripts/validate-course.py'))['validate'](source)
check('800 structurally valid questions, 100 per chapter', summary['questions'] == 800)
admin = Client()
admin.call('/auth/login', {'username': env['ADMIN_USERNAME'], 'password': env['ADMIN_PASSWORD']})
catalog = admin.call('/catalog')
chapters = {n: next(c for c in catalog['chapters'] if c['title'] == f'Chương {n}. {title}')
            for n, title in enumerate(source['chapters'], 1)}
check('Public catalog shows 100 questions in each of eight chapters', all(c['count'] == 100 for c in chapters.values()))
questions = admin.call('/admin/questions')
lookup = {(q['chapterId'], q['text']): q for q in questions}
fields = ('text', 'options', 'correct', 'explanation', 'difficulty')
for q in source['questions']:
    saved = lookup[chapters[q['chapter']]['id'], q['text']]
    assert saved['status'] == 'PUBLISHED'
    assert all(saved[f] == q[f] for f in fields), q['text']
check('All 800 stored questions, choices, answers and explanations match source', True)
archive = json.loads((ROOT / 'content/archived-basic-questions.json').read_text())
check('Superseded questions are archived when present, not deleted', all(
    (chapters[q['chapter']]['id'], q['text']) not in lookup or
    lookup[chapters[q['chapter']]['id'], q['text']]['status'] == 'ARCHIVED'
    for q in archive['questions']))
quizzes = admin.call('/admin/quizzes')
current = [next(q for q in quizzes if q['status'] == 'PUBLISHED' and q['title'] == f'Chương {n} · {title}')
           for n, title in enumerate(source['chapters'], 1)]
for n, quiz in enumerate(current, 1):
    expected = {lookup[chapters[n]['id'], q['text']]['id'] for q in source['questions'] if q['chapter'] == n}
    assert len(quiz['questions']) == 100 and {q['id'] for q in quiz['questions']} == expected
    assert quiz['shuffle'] and quiz['timeLimitSeconds'] == 4000
check('Eight published quiz versions contain exactly their chapter’s 100 questions', True)
group = next(q for q in quizzes if q['title'] == 'Nhóm 7 · Lập kế hoạch · 50 câu' and q['status'] == 'PUBLISHED')
check('The separate original CSV quiz still has 50 questions', len(group['questions']) == 50)
before_path = ROOT / 'work/course-before-800.json'
if before_path.exists():
    before = json.loads(before_path.read_text())
    by_id = {q['id']: q for q in quizzes}
    for old in before['quizzes']:
        assert old['id'] in by_id and by_id[old['id']]['questions'] == old['questions']
    check('All previous quiz snapshots are unchanged', True)
    room = admin.call('/rooms/' + before['room']['id'])
    check('Open demo room retains its original question count', room['count'] == before['room']['count'])
player = Client()
actor = player.call('/session', {'name': 'QA · Ngân hàng 800 câu'})
quiz = current[2]
attempt = player.call('/attempts', {'quizId': quiz['id'], 'instantFeedback': True})
check('Guest starts a 100-question practice with unique questions and no answer keys',
      len(attempt['questions']) == len({q['id'] for q in attempt['questions']}) == 100
      and not attempt['ranked'] and all('correct' not in q for q in attempt['questions']))
keys = {q['id']: q['options'][q['correct']] for q in quiz['questions']}
q = attempt['questions'][0]
wrong = next(i for i, option in enumerate(q['options']) if option != keys[q['id']])
view = player.call('/attempts/' + attempt['id'] + '/answer', {'questionId': q['id'], 'answer': wrong}, 'PUT')
revealed = view['questions'][0]
check('Wrong answer immediately reveals the matching correct choice and source explanation',
      revealed['options'][revealed['correct']] == keys[q['id']] and bool(revealed['explanation'])
      and all('correct' not in item for item in view['questions'][1:]))
view = player.call('/attempts/' + attempt['id'] + '/answer', {'questionId': q['id'], 'answer': revealed['correct']}, 'PUT')
check('First choice stays locked after feedback and reload',
      view['answers'][q['id']] == wrong and player.call('/attempts/' + attempt['id'])['answers'][q['id']] == wrong)
q2 = attempt['questions'][1]
right = q2['options'].index(keys[q2['id']])
player.call('/attempts/' + attempt['id'] + '/answer', {'questionId': q2['id'], 'answer': right}, 'PUT')
done = player.call('/attempts/' + attempt['id'] + '/submit', {})
check('100-question practice grades one correct, one wrong and 98 blank as 1.00 points',
      done['status'] == 'DONE' and done['correct'] == 1 and done['score'] == 1
      and len(done['answers']) == 2)
again = player.call('/attempts/' + attempt['id'] + '/submit', {})
check('Repeated submission preserves score and elapsed time',
      again['score'] == done['score'] and again['durationMs'] == done['durationMs'])
check('Practice with immediate feedback is absent from ranked leaderboard',
      not any(row['playerId'] == actor['id'] for row in player.call('/leaderboard/' + quiz['id'])))
admin.call('/auth/logout', {})
result = {'passed': len(checks), 'checks': checks, 'content': summary, 'practiceId': attempt['id']}
(ROOT / 'work/course-800-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps({'passed': len(checks)}, ensure_ascii=False))
