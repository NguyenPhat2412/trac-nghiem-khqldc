#!/usr/bin/env python3
"""Verify deployed proxy boundaries on an isolated gateway/backend and the test DB.

Requires the built images and vju_quiz_test from test-integration.sh.
Never resets a database or sends traffic to the live quiz backend.
"""
import json
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
work = root / 'work' / 'security-proxy'
work.mkdir(parents=True, exist_ok=True)


def run(*args, stdin=None):
    return subprocess.check_output(args, input=stdin, text=True, cwd=root, stderr=subprocess.STDOUT)


config = json.loads(run('docker', 'compose', 'config', '--format', 'json'))
production = config['services']['backend']['environment']
assert production['SERVER_FORWARD_HEADERS_STRATEGY'] == 'native'
gateway_ip = config['services']['gateway']['networks']['ingress']['ipv4_address']
assert production['SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES'] == '\\Q' + gateway_ip + '\\E'
env = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
           if '=' in line and not line.startswith('#'))
nginx = (root / 'nginx.conf').read_text().replace('http://backend:8080', 'http://security-backend:8080')
nginx = nginx.replace('http://frontend:3000', 'http://security-backend:8080')
(work / 'nginx.conf').write_text(nginx)
trust = work / 'trusted-proxy'
trust.mkdir(exist_ok=True)
(trust / 'edge.conf').unlink(missing_ok=True)
(work / 'edge.conf').write_text('''server {
 listen 80;
 location / {
  proxy_pass http://security-gateway;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header Forwarded "";
 }
}''')
fixture = {
    'services': {
        'security-backend': {
            'image': 'vju-quiz-backend', 'env_file': str(root / '.env'),
            'environment': {'DATABASE_URL': 'jdbc:postgresql://db:5432/vju_quiz_test',
                            'DATABASE_USER': 'vju', 'SERVER_FORWARD_HEADERS_STRATEGY': 'native',
                            'SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES': '\\Q172.30.43.2\\E'},
            'networks': ['db', 'ingress']},
        'security-gateway': {
            'image': config['services']['gateway']['image'],
            'volumes': [str(work / 'nginx.conf') + ':/etc/nginx/conf.d/default.conf:ro',
                        str(trust) + ':/etc/nginx/trusted-proxy:ro'],
            'networks': {'ingress': {'ipv4_address': '172.30.43.2'}},
            'depends_on': ['security-backend']},
        'security-edge': {
            'image': config['services']['gateway']['image'],
            'volumes': [str(work / 'edge.conf') + ':/etc/nginx/conf.d/default.conf:ro'],
            'networks': {'ingress': {'ipv4_address': '172.30.43.3'}},
            'depends_on': ['security-gateway']},
    },
    'networks': {
        'db': {'external': True, 'name': config['networks']['default']['name']},
        'ingress': {'ipam': {'config': [{'subnet': '172.30.43.0/24', 'ip_range': '172.30.43.128/25'}]}}}}
for label in ['a', 'b', 'c']:
    fixture['services']['client-' + label] = {
        'image': 'vju-quiz-frontend', 'entrypoint': ['node', '-e', 'setInterval(()=>{},1000)'],
        'networks': ['ingress']}
(work / 'compose.json').write_text(json.dumps(fixture, indent=2))
compose = ['docker', 'compose', '-p', 'vju-security-verify', '-f', str(work / 'compose.json')]


def node(client, script):
    return run(*compose, 'exec', '-T', 'client-' + client, 'node', '--input-type=module', stdin=script).strip()


helper = '''
import assert from 'node:assert/strict';
async function call(path, body, extra={}, direct=false) {
 const res=await fetch((direct?'http://security-backend:8080':'http://security-gateway')+path,
 {method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000',...extra},body:JSON.stringify(body)});
 return res.status;
}
const bad={username:'security-nonexistent',password:'invalid'};
const spoof=i=>({'X-Forwarded-For':`203.0.113.${i+1}`,'X-Real-IP':`198.51.100.${i+1}`,Forwarded:`for=192.0.2.${i+1}`});
'''
checks = []
try:
    run(*compose, 'up', '-d')
    for attempt in range(45):
        try:
            ready = node('a', "console.log((await fetch('http://security-backend:8080/actuator/health')).status)")
            if ready == '200':
                break
        except subprocess.CalledProcessError:
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Isolated backend did not start')
    node('a', helper + '''
for(let i=0;i<10;i++) assert.equal(await call('/api/auth/login',bad),401);
assert.equal(await call('/api/auth/login',bad),429);
for(let i=0;i<4;i++) assert.equal(await call('/api/auth/login',bad,spoof(i)),429);
''')
    checks.append('One gateway client is limited; spoofed forwarding headers cannot reset its quota')
    node('b', helper + '''assert.equal(await call('/api/auth/login',bad),401);''' +
         'assert.equal(await call("/api/auth/login",' + json.dumps({
             'username': env.get('ADMIN_USERNAME', 'admin'), 'password': env['ADMIN_PASSWORD']}) + '),200);')
    checks.append('Second gateway client retains its quota and can log in legitimately')
    node('c', helper + '''
for(let i=0;i<10;i++) assert.equal(await call('/api/auth/login',bad,spoof(i),true),401);
assert.equal(await call('/api/auth/login',bad,spoof(20),true),429);
''')
    checks.append('Untrusted direct peer cannot forge client identity even with native forwarding enabled')
    node('a', helper + '''
for(let i=0;i<150;i++) assert.equal(await call('/api/session',{}),400);
assert.equal(await call('/api/session',{},spoof(30)),429);
''')
    node('b', helper + "assert.equal(await call('/api/session',{name:'Phiên khách hợp lệ'}),200);")
    checks.append('Guest-entry quotas are isolated too; legitimate guest entry remains available')
    # Verify aliases through the actual nginx configuration, not only Tomcat.
    node('b', '''
import assert from 'node:assert/strict';
for(const path of ['/api/admin/questions','/api/%61dmin/questions','/%61pi/admin/questions','/%61pi/%61dmin/questions'])
 assert.equal((await fetch('http://security-gateway'+path)).status,401);
assert.equal((await fetch('http://security-gateway/api/catalog')).status,200);
''')
    checks.append('Gateway aliases deny anonymous answer-key access; public catalog still works')
    # Enable exactly the supplied deployment template for the known outer edge.
    (trust / 'edge.conf').write_text((root / 'deploy/trusted-proxy/edge.conf.example').read_text()
                                   .replace('192.0.2.10', '172.30.43.3'))
    run(*compose, 'exec', '-T', 'security-gateway', 'nginx', '-t')
    run(*compose, 'exec', '-T', 'security-gateway', 'nginx', '-s', 'reload')
    time.sleep(1)
    edge_helper = helper.replace('http://security-gateway', 'http://security-edge')
    node('a', edge_helper + '''
for(let i=0;i<3;i++) assert.equal(await call('/api/auth/login',bad,spoof(i)),429);
assert.equal(await call('/api/session',{},spoof(30)),429);
''')
    node('b', edge_helper + '''
assert.equal(await call('/api/auth/login',bad),401);
assert.equal(await call('/api/session',{name:'Khách qua hai proxy'}),200);
''' + 'assert.equal(await call("/api/auth/login",' + json.dumps({
        'username': env.get('ADMIN_USERNAME', 'admin'), 'password': env['ADMIN_PASSWORD']}) + '),200);')
    checks.append('Two-proxy chain preserves separate login/guest quotas and rejects forged headers')
    node('c', helper + "assert.equal(await call('/api/auth/login',bad,spoof(40)),429);")
    checks.append('Trusting the specified outer edge does not trust arbitrary direct clients')
    for check in checks:
        print('PASS', check)
    (root / 'work/security-proxy-results.json').write_text(json.dumps(
        {'passed': len(checks), 'checks': checks, 'timestamp': time.time()}, indent=2))
finally:
    run(*compose, 'down')
