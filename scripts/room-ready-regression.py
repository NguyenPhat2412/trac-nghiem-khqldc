#!/usr/bin/env python3
"""Local test DB: readiness ownership, idempotency, stale requests and host-only advancement."""
import json,time,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
BASE='http://localhost:8081/api'
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.actor={}
 def call(self,path,data=None,expected=200,method=None):
  req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),method=method or ('GET' if data is None else 'POST'),headers={'Content-Type':'application/json','Origin':'http://localhost:3000','X-CSRF-Token':self.actor.get('csrf','')})
  try:
   with self.opener.open(req,timeout=30) as r:code,raw=r.status,r.read()
  except urllib.error.HTTPError as e:code,raw=e.code,e.read()
  assert code==expected,(path,code,expected,raw[:100])
  v=json.loads(raw)
  if isinstance(v,dict) and 'csrf' in v:self.actor=v
  return v




env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
host=Client();host.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
a,b,outsider=Client(),Client(),Client()
for p in (a,b,outsider):p.call('/session',{'name':'Ready regression'})
qs=host.call('/admin/questions')[:2]
quiz=host.call('/admin/quizzes',{'title':'Readiness regression','status':'PUBLISHED','questionIds':[q['id'] for q in qs],'questionSeconds':5,'shuffle':True})
room=host.call('/admin/rooms',{'quizId':quiz['id']});code=room['id'];path='/rooms/'+code
for p in (a,b):p.call(path+'/join',{})
a.call(path+'/ready',{'questionId':qs[0]['id']},expected=400)
opened=host.call('/admin/rooms/'+code+'/start',{});qid=opened['question']['id']
a.call(path+'/ready',{'questionId':qid},expected=400)
outsider.call(path+'/ready',{'questionId':qid},expected=403)
host.call(path+'/ready',{'questionId':qid},expected=403)
for p in (a,b):p.call(path+'/answer',{'questionId':qid,'answer':0})
before=a.call(path);assert before['status']=='REVEAL' and before['myReady']==False
seen=a.call(path+'/ready',{'questionId':qid,'playerId':b.actor['id']})
assert seen['status']=='REVEAL' and seen['current']==0 and seen['myReady']
assert 'readyPlayers' not in seen and b.call(path)['myReady']==False
assert seen['ranking']==before['ranking']
assert a.call(path+'/ready',{'questionId':qid})['version']==seen['version']
assert host.call(path)['readyPlayers']==[a.actor['id']]
a.call('/admin/rooms/'+code+'/next',{},expected=403)
a.call(path+'/next',{},expected=404)
assert a.call(path)['current']==0
print('PASS readiness is private to self, idempotent, does not change score or advance room, and grants no host rights',flush=True)
# No timer may advance the explanation, including after the former 12-second interval.
time.sleep(13)
assert a.call(path)['status']=='REVEAL' and a.call(path)['current']==0
host.call('/admin/rooms/'+code+'/next',{})
a.call(path+'/ready',{'questionId':qid},expected=400)
assert a.call(path)['myReady']==False
newq=a.call(path)['question']['id']
for p in (a,b):p.call(path+'/answer',{'questionId':newq,'answer':0})
a.call(path+'/ready',{'questionId':qid},expected=400)
a.call(path+'/ready',{'questionId':newq})
assert host.call(path)['readyPlayers']==[a.actor['id']]
host.call('/admin/rooms/'+code+'/next',{})
a.call(path+'/ready',{'questionId':newq},expected=400)
print('PASS explanation waits beyond 12 seconds; stale/early/finished requests rejected, next question resets readiness, host finishes normally',flush=True)
host.call('/auth/logout',{})
