#!/usr/bin/env python3
"""Local test database only: fixed random subsets, validation, reconnect and scoring."""
import http.cookiejar
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://localhost:8081/api'

class Client:
    def __init__(self):
        self.actor = {}
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, path, data=None, expected=200):
        req = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
            headers={'Content-Type': 'application/json', 'Origin': 'http://localhost:3000', 'X-CSRF-Token': self.actor.get('csrf', '')})
        try:
            with self.http.open(req, timeout=30) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        assert status == expected, (path, status, expected, raw[:150])
        result = json.loads(raw)
        if isinstance(result, dict) and 'csrf' in result:
            self.actor = result
        return result


def snapshot(code):
    raw = subprocess.check_output(['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'vju', '-d',
        'vju_quiz_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
        "select data::text from room_snapshots where room_id='" + code + "'"], text=True)
    return json.loads(raw)


env = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
host, a, b = Client(), Client(), Client()
host.call('/auth/login', {'username': env['ADMIN_USERNAME'], 'password': env['ADMIN_PASSWORD']})
for player in (a, b):
    player.call('/session', {'name': 'Question count regression'})
pool = host.call('/admin/questions')
while len(pool) < 60:
    pool.append(host.call('/admin/questions', {**pool[0], 'text': 'Test question ' + str(len(pool)), 'status': 'PUBLISHED'}))
source_ids = [q['id'] for q in pool[:60]]
quiz = host.call('/admin/quizzes', {'title': 'Random count regression', 'status': 'PUBLISHED',
    'questionIds': source_ids, 'questionSeconds': 30, 'shuffle': False})
base = {'quizId': quiz['id'], 'untimed': True, 'advanceWhenReady': True}
a.call('/admin/rooms', {**base, 'questionCount': 10}, expected=403)
for invalid in (-1, 0, 1, 11, 100, 2147483647):
    host.call('/admin/rooms', {**base, 'questionCount': invalid}, expected=400)
small = host.call('/admin/quizzes', {'title': 'Too small', 'status': 'PUBLISHED', 'questionIds': source_ids[:12], 'questionSeconds': 30})
host.call('/admin/rooms', {**base, 'quizId': small['id'], 'questionCount': 20}, expected=400)
print('PASS invalid counts, insufficient pool and guest create denied', flush=True)
rooms = []
for count in (10, 20, 50, None):
    room = host.call('/admin/rooms', {**base, 'questionCount': count})
    snap = snapshot(room['id'])
    ids = [q['id'] for q in snap['questions']]
    assert room['count'] == len(ids) == (count or 60)
    assert len(set(ids)) == len(ids) and set(ids) <= set(source_ids)
    if count is None:
        assert ids == source_ids  # Full quiz preserves its original no-shuffle order.
    rooms.append(room)
    print('PASS exact unique subset size', count or 'all', flush=True)
legacy = host.call('/admin/rooms', base)
assert legacy['count'] == 60
repeat = host.call('/admin/rooms', {**base, 'questionCount': 10})
assert {q['id'] for q in snapshot(repeat['id'])['questions']} != {q['id'] for q in snapshot(rooms[0]['id'])['questions']}
original = next(q for q in host.call('/admin/quizzes') if q['id'] == quiz['id'])
assert [q['id'] for q in original['questions']] == source_ids
print('PASS fresh random draw per room, legacy default and original quiz unchanged', flush=True)
room = rooms[0]
code = room['id']
snap_before = snapshot(code)
for player in (a, b):
    player.call('/rooms/' + code + '/join', {})
host.call('/admin/rooms/' + code + '/start', {})
seen = []
for index in range(10):
    first, second = a.call('/rooms/' + code), b.call('/rooms/' + code)
    qid = first['question']['id']
    assert first['count'] == second['count'] == 10
    assert qid == second['question']['id'] and qid not in seen
    assert 'correct' not in first['question'] and 'explanation' not in first['question']
    if index == 0:
        subprocess.run(['docker', 'compose', '--profile', 'test', 'restart', 'test-backend'], check=True, stdout=subprocess.DEVNULL)
        for _ in range(45):
            try:
                urllib.request.urlopen('http://localhost:8081/actuator/health', timeout=2).read()
                break
            except Exception:
                time.sleep(1)
        assert a.call('/rooms/' + code)['question'] == first['question']
        assert snapshot(code) == snap_before
    correct = next(q['correct'] for q in snap_before['questions'] if q['id'] == qid)
    for player in (a, b):
        player.call('/rooms/' + code + '/answer', {'questionId': qid, 'answer': correct})
    for player in (a, b):
        player.call('/rooms/' + code + '/ready', {'questionId': qid})
    seen.append(qid)
end = a.call('/rooms/' + code)
assert end['status'] == 'FINISHED' and end['count'] == 10
assert all(row['correct'] == 10 and float(row['score']) == 100 for row in end['ranking'])
assert len(end['details']) == 1 and len(end['details'][0]['questions']) == 10
assert seen == [q['id'] for q in snap_before['questions']]
print('PASS all players share 10 fixed questions, restart/reconnect stable, no early key, finish and score on selected 10', flush=True)
host.call('/auth/logout', {})
