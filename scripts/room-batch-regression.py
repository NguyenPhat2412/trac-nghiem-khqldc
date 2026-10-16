#!/usr/bin/env python3
"""Disposable local test DB: concurrent retries and a real deferred COMMIT failure."""
import json,time,secrets,subprocess,urllib.request,urllib.error,http.cookiejar
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

def sql(q):return subprocess.check_output(['docker','compose','exec','-T','db','psql','-U','vju','-d','vju_quiz_test','-At','-v','ON_ERROR_STOP=1'],input=q,text=True).strip()

from concurrent.futures import ThreadPoolExecutor

def concurrent(jobs):
 with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
  return list(pool.map(lambda f:f(),jobs))

env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
admin=Client();admin.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
players=[Client() for _ in range(3)];outside=Client()
for p in [*players,outside]:p.call('/session',{'name':'Batch regression'})
question=admin.call('/admin/questions')[0]
quiz=admin.call('/admin/quizzes',{'title':'Batch transaction regression','status':'PUBLISHED','questionIds':[question['id']],'timeLimitSeconds':0,'questionSeconds':300,'shuffle':True})
def room():
 code=admin.call('/admin/rooms',{'quizId':quiz['id']})['id']
 assert len(code)==6 and code.isdigit()
 for p in players:p.call('/rooms/'+code+'/join',{})
 opened=admin.call('/admin/rooms/'+code+'/start',{})
 return code,opened
code,opened=room();qid=opened['question']['id'];path='/rooms/'+code+'/answer'
jobs=[lambda i=i:players[0].call(path,{'questionId':qid,'answer':i%4}) for i in range(16)]
jobs += [lambda:outside.call(path,{'questionId':qid,'answer':0},expected=403),lambda:admin.call(path,{'questionId':qid,'answer':0},expected=403),lambda:players[1].call(path,{'questionId':'unopened-question','answer':0},expected=400)]
results=concurrent(jobs)
choices={r['myAnswer'] for r in results[:16]};assert len(choices)==1
assert all(r['status']=='QUESTION' and 'correct' not in r['question'] for r in results[:16])
after=players[0].call('/rooms/'+code)
assert after['answered']==1 and after['version']==opened['version']+1
assert players[1].call('/rooms/'+code)['myAnswer']==-1
print('PASS concurrent repeated clicks preserve one choice and one state change; mixed invalid/outsider/admin requests cannot expose keys or alter peers',flush=True)
admin.call('/admin/rooms/'+code+'/finish',{})
code,opened=room();qid=opened['question']['id'];path='/rooms/'+code+'/answer'
name='batch_failure_'+code
try:
 sql("create function "+name+"() returns trigger language plpgsql as $$ begin raise exception 'intentional deferred commit failure'; return NEW; end $$; create constraint trigger "+name+" after update on rooms deferrable initially deferred for each row when (NEW.id='"+code+"') execute function "+name+"();")
 replies=concurrent([lambda p=p:p.call(path,{'questionId':qid,'answer':0},expected=500) for p in players])
 assert all('correct' not in r and 'question' not in r for r in replies)
 for p in players:
  v=p.call('/rooms/'+code)
  assert v['status']=='QUESTION' and v['answered']==0 and v['myAnswer']==-1 and v['version']==opened['version']
  assert 'correct' not in v['question']
 print('PASS real deferred COMMIT failure: no success acknowledgement, answer key, partial write, or version advance',flush=True)
finally:
 sql('drop trigger if exists '+name+' on rooms; drop function if exists '+name+'();')
concurrent([lambda p=p:p.call(path,{'questionId':qid,'answer':0}) for p in players])
for p in players:
 v=p.call('/rooms/'+code);assert v['status']=='REVEAL' and v['answered']==3 and v['myAnswer']==0
admin.call('/admin/rooms/'+code+'/next',{})
for p in players:
 v=p.call('/rooms/'+code);assert len(v['details'])==1 and v['details'][0]['playerId']==p.actor['id']
print('PASS retry after failed commit persists each answer once and keeps final details private',flush=True)

# A committed expired state under another transaction's lock remains private and readable.
quiz=admin.call('/admin/quizzes',{'title':'Expiry contention regression','status':'PUBLISHED','questionIds':[question['id']],'timeLimitSeconds':0,'questionSeconds':5,'shuffle':True})
code,opened=room()
holder=subprocess.Popen(['docker','compose','exec','-T','db','psql','-U','vju','-d','vju_quiz_test','-At','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
holder.stdin.write("begin; select id from rooms where id='"+code+"' for update; select pg_sleep(7); commit;\n");holder.stdin.close();holder.stdin=None
try:
 until=time.monotonic()+2
 while sql("select id from rooms where id='"+code+"' for update skip locked;"):
  assert time.monotonic()<until,'Lock holder did not start';time.sleep(.02)
 time.sleep(max(0,opened['deadline']/1000-time.time()+.05))
 started=time.monotonic()
 views=concurrent([lambda p=p:p.call('/rooms/'+code) for p in players])
 duration=round((time.monotonic()-started)*1000)
 assert duration<1000,duration
 assert all(v['status']=='QUESTION' and 'correct' not in v['question'] for v in views)
 assert holder.poll() is None,'Lock should still be held during read assertions'
 print('PASS expired reads do not queue behind another transaction or reveal uncommitted keys:',duration,'ms',flush=True)
finally:
 holder.wait(timeout=10)
 assert holder.returncode==0,holder.stderr.read()
started=time.monotonic()
view=players[0].call('/rooms/'+code)
assert view['status']=='REVEAL' and view['answered']==0 and 'correct' in view['question']
assert (time.monotonic()-started)*1000<1000
admin.call('/admin/rooms/'+code+'/next',{})
print('PASS expiry commits after contention clears and emits the real revealed state',flush=True)

admin.call('/auth/logout',{})
