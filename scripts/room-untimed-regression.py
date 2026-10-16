#!/usr/bin/env python3
"""Local test DB: untimed room persistence, scoring and normal timed-room isolation."""
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




import subprocess

def sql(q):return subprocess.check_output(['docker','compose','exec','-T','db','psql','-U','vju','-d','vju_quiz_test','-At','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
host=Client();host.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
a,b,outsider=Client(),Client(),Client()
for p in (a,b,outsider):p.call('/session',{'name':'Untimed regression'})
qs=host.call('/admin/questions')[:2]
quiz=host.call('/admin/quizzes',{'title':'Untimed regression','status':'PUBLISHED','questionIds':[q['id'] for q in qs],'questionSeconds':5,'shuffle':True})
code=host.call('/admin/rooms',{'quizId':quiz['id']})['id'];path='/rooms/'+code
for p in (a,b):p.call(path+'/join',{})
a.call('/admin/rooms/'+code+'/untimed',{},expected=403)
assert not a.call(path)['untimed']
host.call('/admin/rooms/'+code+'/untimed',{})
opened=host.call('/admin/rooms/'+code+'/start',{});qid=opened['question']['id']
assert opened['untimed'] and opened['deadline']==0
host.call('/admin/rooms/'+code+'/untimed',{},expected=400)
# Simulate a question that has been open a day; never alter the main database.
assert code.isdigit() and len(code)==6
sql("update rooms set data=jsonb_set(data,'{openedAt}',to_jsonb((extract(epoch from now())*1000)::bigint-86400000)) where id='"+code+"';")
subprocess.run(['docker','compose','--profile','test','restart','test-backend'],check=True,stdout=subprocess.DEVNULL)
for i in range(30):
 try:
  urllib.request.urlopen('http://localhost:8081/actuator/health',timeout=2).read();break
 except Exception:time.sleep(1)
else:raise AssertionError('Backend unavailable')
time.sleep(6)
v=a.call(path);assert v['untimed'] and v['deadline']==0 and v['status']=='QUESTION' and 'correct' not in v['question']
a.call(path+'/ready',{'questionId':qid},expected=400)
outsider.call(path+'/answer',{'questionId':qid,'answer':0},expected=403)
first=a.call(path+'/answer',{'questionId':qid,'answer':0});assert first['status']=='QUESTION' and 'correct' not in first['question']
second=b.call(path+'/answer',{'questionId':qid,'answer':0});assert second['status']=='REVEAL'
assert all(x['durationMs']>=86400000 for x in second['ranking'])
a.call(path+'/ready',{'questionId':qid});assert a.call(path)['status']=='REVEAL'
print('PASS untimed survives restart and simulated 24-hour age; no expiry/key leak, late-in-clock answers accepted, own readiness only',flush=True)
host.call('/admin/rooms/'+code+'/next',{})
v=a.call(path);assert v['deadline']==0 and v['status']=='QUESTION' and not v['myReady']
newq=v['question']['id'];a.call(path+'/answer',{'questionId':newq,'answer':0})
time.sleep(1)
finished=host.call('/admin/rooms/'+code+'/finish',{})
peer=next(d for d in finished['details'] if d['playerId']==b.actor['id']);last=peer['questions'][-1]
assert last['answer']==-1 and last['durationMs']>=1000
assert next(x for x in finished['ranking'] if x['playerId']==b.actor['id'])['durationMs']==sum(q['durationMs'] for q in peer['questions'])
print('PASS next question remains untimed; early-finish blank duration matches elapsed time and history',flush=True)
# A separate room from the same quiz keeps its configured deadline.
normal=host.call('/admin/rooms',{'quizId':quiz['id']})['id'];a.call('/rooms/'+normal+'/join',{})
opened=host.call('/admin/rooms/'+normal+'/start',{});assert not opened['untimed'] and opened['deadline']>0
time.sleep(6)
v=a.call('/rooms/'+normal);assert v['status']=='REVEAL'
a.call('/rooms/'+normal+'/answer',{'questionId':v['question']['id'],'answer':0},expected=400)
print('PASS normal rooms retain configured timeout and reject late answers; guest cannot disable timer',flush=True)
host.call('/admin/rooms/'+normal+'/finish',{});host.call('/auth/logout',{})
