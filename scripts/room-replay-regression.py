#!/usr/bin/env python3
"""Local test database only: private room replay, exclusions, idempotence and access control."""
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
host, a, b, outsider = Client(), Client(), Client(), Client()
host.call('/auth/login', {'username': env['ADMIN_USERNAME'], 'password': env['ADMIN_PASSWORD']})
for player in (a, b, outsider):
    player.call('/session', {'name': 'Replay regression'})
pool = host.call('/admin/questions')[:40]
assert len(pool) >= 30
quiz = host.call('/admin/quizzes', {'title': 'Replay regression', 'status': 'PUBLISHED', 'questionIds': [q['id'] for q in pool], 'questionSeconds': 30, 'shuffle': False})
room = host.call('/admin/rooms', {'quizId': quiz['id'], 'questionCount': 10, 'untimed': True, 'advanceWhenReady': True})
code = room['id']
for player in (a, b):
    player.call('/rooms/' + code + '/join', {})
a.call('/rooms/' + code + '/replay', {}, expected=400)
outsider.call('/rooms/' + code + '/replay', {}, expected=403)
host.call('/rooms/' + code + '/replay', {}, expected=403)
host.call('/admin/rooms/' + code + '/start', {})

def complete(code, players):
    canonical = {q['id']: q for q in snapshot(code)['questions']}
    for i in range(10):
        for player in players:
            state = player.call('/rooms/' + code)
            assert state['status'] == 'QUESTION' and state['current'] == i
            assert 'correct' not in state['question']
            question = state['question']
            key = canonical[question['id']]
            choice = question['options'].index(key['options'][key['correct']])
            player.call('/rooms/' + code + '/answer', {'questionId': question['id'], 'answer': choice})
        for player in players:
            player.call('/rooms/' + code + '/ready', {'questionId': question['id']})
    result = players[0].call('/rooms/' + code)
    assert result['status'] == 'FINISHED' and result['count'] == 10
    assert all(float(row['score']) == 100 for row in result['ranking'])
    return result

old = complete(code, [a, b])
assert old['replayAvailable']
saved_token = a.actor['csrf']
a.actor['csrf'] = 'invalid'
a.call('/rooms/' + code + '/replay', {}, expected=403)
a.actor['csrf'] = saved_token
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=2) as executor:
    ids = list(executor.map(lambda _: a.call('/rooms/' + code + '/replay', {})['id'], range(2)))
assert ids[0] == ids[1]
child = ids[0]
assert b.call('/rooms/' + code).get('replayRoomId') is None
state = a.call('/rooms/' + child)
assert state['count'] == 10 and state['untimed'] and state['advanceWhenReady'] and state['personalReplay']
assert state['status'] == 'QUESTION' and state['deadline'] == 0 and not state['host']
assert len(state['members']) == 1 and state['members'][0]['id'] == a.actor['id']
first_set = {q['id'] for q in snapshot(code)['questions']}
second_set = {q['id'] for q in snapshot(child)['questions']}
assert len(second_set) == 10 and not first_set.intersection(second_set)
assert a.call('/rooms/' + code)['ranking'] == old['ranking']
assert a.call('/rooms/' + code)['details'] == old['details']
assert 'replays' not in a.call('/rooms/' + code)
print('PASS fresh 10 disjoint questions, single learner starts immediately, modes and old results preserved, concurrent duplicate returns same room', flush=True)
for other in (b, outsider):
    other.call('/rooms/' + child, expected=403)
    other.call('/rooms/' + child + '/join', {}, expected=400)
a.call('/admin/rooms/' + child + '/next', {}, expected=403)
a.call('/admin/rooms', {'quizId': quiz['id']}, expected=403)
other_child = b.call('/rooms/' + code + '/replay', {'playerId': a.actor['id'], 'count': 100})['id']
assert other_child != child and b.call('/rooms/' + other_child)['count'] == 10
assert b.call('/rooms/' + other_child)['members'][0]['id'] == b.actor['id']
print('PASS CSRF, outsider access, guest host actions denied; identity and configuration cannot be overridden', flush=True)
subprocess.run(['docker', 'compose', '--profile', 'test', 'restart', 'test-backend'], check=True, stdout=subprocess.DEVNULL)
for _ in range(45):
    try:
        urllib.request.urlopen('http://localhost:8081/actuator/health', timeout=2).read()
        break
    except Exception:
        time.sleep(1)
assert a.call('/rooms/' + code + '/replay', {})['id'] == child
assert a.call('/rooms/' + child)['question'] == state['question']
assert {q['id'] for q in snapshot(child)['questions']} == second_set
complete(child, [a])
grandchild = a.call('/rooms/' + child + '/replay', {})['id']
assert not second_set.intersection({q['id'] for q in snapshot(grandchild)['questions']})
print('PASS restart keeps replay identity and questions; complete replay and continue to another disjoint set', flush=True)
small = host.call('/admin/quizzes', {'title': 'Replay insufficient pool', 'status': 'PUBLISHED', 'questionIds': [q['id'] for q in pool[:10]], 'questionSeconds': 30, 'shuffle': False})
small_room = host.call('/admin/rooms', {'quizId': small['id'], 'untimed': True, 'advanceWhenReady': True})['id']
a.call('/rooms/' + small_room + '/join', {})
host.call('/admin/rooms/' + small_room + '/start', {})
end = complete(small_room, [a])
assert not end['replayAvailable'] and end['replayReason']
a.call('/rooms/' + small_room + '/replay', {}, expected=400)
print('PASS insufficient fresh pool explains limitation and refuses repetition', flush=True)
host.call('/auth/logout', {})
