#!/usr/bin/env python3
"""Security regressions; use a disposable database (default: test-backend)."""
import csv
import http.cookiejar
import io
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get('TEST_URL', 'http://localhost:8081').rstrip('/')
env = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines()
           if '=' in line and not line.startswith('#'))
checks = []
requests = 0


class Client:
    def __init__(self):
        self.actor = {}
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, path, body=None, method=None, expected=200, csrf=True, headers=None):
        global requests
        h = {'Content-Type': 'application/json', 'Origin': 'http://localhost:3000'}
        if csrf:
            h['X-CSRF-Token'] = self.actor.get('csrf', '')
        h.update(headers or {})
        req = urllib.request.Request(BASE + path, method=method or ('POST' if body is not None else 'GET'),
                                     headers=h, data=None if body is None else json.dumps(body).encode())
        try:
            with self.opener.open(req, timeout=15) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        requests += 1
        allowed = (expected,) if isinstance(expected, int) else expected
        assert status in allowed, (path, status, allowed, raw[:150])
        try:
            result = json.loads(raw)
        except ValueError:
            return raw
        if isinstance(result, dict) and 'csrf' in result:
            self.actor = result
        return result


def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)


def hidden(value):
    if isinstance(value, dict):
        return not any(k in value for k in ('correct', 'explanation')) and all(hidden(v) for v in value.values())
    return not isinstance(value, list) or all(hidden(v) for v in value)


anonymous, guest, other, admin = Client(), Client(), Client(), Client()
guest.call('/api/session', {'name': 'Sinh viên kiểm thử'})
other.call('/api/session', {'name': 'Sinh viên kiểm thử'})
admin.call('/api/auth/login', {'username': env.get('ADMIN_USERNAME', 'admin'), 'password': env['ADMIN_PASSWORD']})
catalog = guest.call('/api/catalog')
check('Public catalog has no keys or explanations', hidden(catalog))
prefixes = ['/api/admin', '/api/%61dmin', '/%61pi/admin', '/%61pi/%61dmin', '/api/adm%69n']
for prefix in prefixes:
    for resource in ['questions', 'chapters', 'quizzes', 'import/template', 'staff', 'report', 'report.csv', 'rooms']:
        anonymous.call(prefix + '/' + resource, expected=401)
        guest.call(prefix + '/' + resource, expected=403)
    for resource, body in [('chapters', {}), ('questions', {}), ('quizzes', {}), ('import/commit', []), ('rooms', {})]:
        guest.call(prefix + '/' + resource, body, expected=403)
    for resource in ['questions', 'chapters', 'quizzes', 'staff']:
        guest.call(prefix + '/' + resource + '/missing', {}, method='PUT', expected=403)
    for action in ['start', 'next', 'finish', 'lock', 'kick']:
        guest.call(prefix + '/rooms/000000/' + action, {}, expected=403)
    admin.call(prefix + '/chapters', {}, expected=403, csrf=False)
    assert isinstance(admin.call(prefix + '/questions'), list)
check('All encoded admin aliases enforce roles and CSRF; authorized reads remain available')
for path in ['/api/admin%2fquestions', '/api/admin;test/questions', '/api//admin/questions',
             '/api/./admin/questions', '/api/x/../admin/questions', '/api/%2561dmin/questions',
             '/api/%2e/admin/questions', '//api/admin/questions', '/API/admin/questions']:
    anonymous.call(path, expected=(400, 401, 403, 404))
    guest.call(path, expected=(400, 403, 404))
check('Ambiguous separators, dot segments, double encoding and case variants never expose content')
for path in ['/api/session', '/%61pi/session', '/api/%73ession', '/api/auth/login', '/%61pi/auth/%6cogin']:
    anonymous.call(path, {}, expected=403, headers={'Origin': 'https://untrusted.invalid'})
    anonymous.call(path, {}, expected=403, headers={'Content-Type': 'text/plain'})
alias_guest = Client()
alias_guest.call('/%61pi/%73ession', {'name': 'Tên hợp lệ'})
check('Encoded bootstrap routes preserve origin/content-type checks and valid guest entry')

quiz = catalog['quizzes'][0]
attempt = guest.call('/api/attempts', {'quizId': quiz['id']})
check('Ranked attempt initially hides every answer key', hidden(attempt['questions']))
for path in ['/api/attempts/', '/%61pi/%61ttempts/']:
    other.call(path + attempt['id'], expected=403)
    other.call(path + attempt['id'] + '/submit', {}, expected=403)
guest.call('/%61pi/attempts/' + attempt['id'] + '/answer',
           {'questionId': attempt['questions'][0]['id'], 'answer': 0}, method='PUT', csrf=False, expected=403)
answered = guest.call('/api/attempts/' + attempt['id'] + '/answer',
                      {'questionId': attempt['questions'][0]['id'], 'answer': 0}, method='PUT')
check('Ranked answers remain hidden after answering; owner and encoded CSRF checks hold', hidden(answered['questions']))
result = guest.call('/api/attempts/' + attempt['id'] + '/submit', {})
check('Submission legitimately reveals owner feedback', all('correct' in q for q in result['questions']))

room = admin.call('/api/admin/rooms', {'quizId': quiz['id']})
code = room['id']
guest.call('/api/rooms/' + code + '/join', {})
other.call('/api/rooms/' + code + '/join', {})
outsider = Client()
outsider.call('/api/session', {'name': 'Người ngoài phòng'})
outsider.call('/api/rooms/' + code, expected=403)
opened = admin.call('/api/admin/rooms/' + code + '/start', {})
student = guest.call('/api/rooms/' + code)
check('Open room exposes no answer key, even to host', hidden(student['question']) and hidden(opened['question']))
guest.call('/api/rooms/' + code + '/answer', {'questionId': student['question']['id'], 'answer': 0})
check('Answering first does not reveal the room key early', hidden(guest.call('/api/rooms/' + code)['question']))
other.call('/api/rooms/' + code + '/answer', {'questionId': student['question']['id'], 'answer': 1})
check('Closed question legitimately reveals the correct answer', 'correct' in guest.call('/api/rooms/' + code)['question'])
admin.call('/api/admin/rooms/' + code + '/finish', {})

formula = '=HYPERLINK("https://x","a\nb")'
csv_player = Client()
csv_player.call('/api/session', {'name': formula})
csv_attempt = csv_player.call('/api/attempts', {'quizId': quiz['id']})
csv_player.call('/api/attempts/' + csv_attempt['id'] + '/submit', {})
raw = admin.call('/api/admin/report.csv').decode('utf-8-sig')
rows = list(csv.reader(io.StringIO(raw)))
assert any(row[0] == "'" + formula for row in rows[1:])
assert not any(row[0] == formula for row in rows[1:])
check('Persisted multiline student name is escaped at CSV export, preserving cell content')
Path('work/security-api-results.json').write_text(json.dumps(
    {'passed': len(checks), 'requests': requests, 'checks': checks, 'timestamp': time.time()}, ensure_ascii=False, indent=2))
print(f'{len(checks)} groups passed; {requests} real HTTP requests')
