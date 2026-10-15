#!/usr/bin/env python3
"""Local test DB only: cold history, legacy conversion, rollback, restart and private views."""
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
def restart():
 subprocess.run(['docker','compose','--profile','test','restart','test-backend'],check=True,stdout=subprocess.DEVNULL)
 for _ in range(40):
  try:
   with urllib.request.urlopen('http://localhost:8081/actuator/health',timeout=1) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(.5)
 raise AssertionError('Test backend did not recover')

env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
admin=Client();admin.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
a,b,outside=Client(),Client(),Client()
for p in (a,b,outside):p.call('/session',{'name':'Storage student'})
saved_csrf=a.actor['csrf'];a.actor['csrf']='invalid'
assert a.call('/rooms/123456/join',{},expected=403)['message']=='Phiên không hợp lệ. Hãy tải lại trang.'
a.actor['csrf']=saved_csrf
questions=admin.call('/admin/questions')[:3]
quiz=admin.call('/admin/quizzes',{'title':'Storage regression','status':'PUBLISHED','questionIds':[q['id'] for q in questions],'timeLimitSeconds':0,'questionSeconds':300,'shuffle':True})
code=admin.call('/admin/rooms',{'quizId':quiz['id']})['id']
for p in (a,b):p.call('/rooms/'+code+'/join',{})
expected={a.actor['id']:{},b.actor['id']:{}}
for index in range(2):
 opened=admin.call('/admin/rooms/'+code+('/start' if index==0 else '/next'),{})
 qid=opened['question']['id']
 before=a.call('/rooms/'+code);assert 'correct' not in before['question']
 first=a.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':index})
 assert first['status']=='QUESTION' and 'correct' not in first['question']
 repeat=a.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':(index+1)%4})
 assert repeat['version']==first['version'] and repeat['myAnswer']==index
 if index==1:
  restart();restored=a.call('/rooms/'+code)
  assert restored['myAnswer']==index and restored['version']==first['version']
  assert restored['question']['options']==first['question']['options']
 for p,choice in ((a,index),(b,(index+2)%4)):
  if p is b:p.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':choice})
  expected[p.actor['id']][qid]=choice
 print('PASS first choice, no early key, round',index+1,flush=True)
# Persist a canonical legacy room before opening the last (blank) question.
raw=json.loads(sql("select data::text from rooms where id='"+code+"';"))
raw['quiz']=json.loads(sql("select data::text from room_snapshots where room_id='"+code+"';"))
history=json.loads(sql("select coalesce(json_object_agg(player_id,data),'{}') from room_history where room_id='"+code+"';"))
for pid,m in raw['members'].items():
 for field in ('answers','times'):m[field]={**history.get(pid,{}).get(field,{}),**m[field]}
 m['completedCorrect']=0;m['completedDurationMs']=0
legacy=str(secrets.randbelow(900000)+100000);raw.update(id=legacy,compact=False)
encoded=json.dumps(raw).replace("'","''");sql("insert into rooms(id,data) values ('"+legacy+"','"+encoded+"'::jsonb);")
legacy_before=a.call('/rooms/'+legacy)
outside.call('/rooms/'+legacy+'/answer',{'questionId':'wrong','answer':0},expected=403)
assert sql("select count(*) from room_snapshots where room_id='"+legacy+"';")=='0'
assert json.loads(sql("select data::text from rooms where id='"+legacy+"';"))==raw
print('PASS unauthorized legacy conversion rolls back both storage and cache',flush=True)
# A legitimate locked read converts without changing version, permutation, ranking or choices.
after=a.call('/rooms/'+legacy+'/join',{})
for key in ('question','myAnswer','ranking','version'):assert after[key]==legacy_before[key],key
assert sql("select count(*) from room_snapshots where room_id='"+legacy+"';")=='1'
print('PASS legacy conversion preserves snapshot, totals, blanks and answer order',flush=True)
for room in (code,legacy):
 admin.call('/admin/rooms/'+room+'/next',{})
 final=admin.call('/admin/rooms/'+room+'/finish',{})
 assert final['early'] and len(final['details'])==2
 for p in (a,b):
  view=p.call('/rooms/'+room);assert len(view['details'])==1
  detail=view['details'][0];assert detail['playerId']==p.actor['id'] and len(detail['questions'])==3
  for item in detail['questions']:
   assert item['answer']==expected[p.actor['id']].get(item['question']['id'],-1)
  rank=next(x for x in view['ranking'] if x['playerId']==p.actor['id'])
  assert rank['durationMs']==sum(q['durationMs'] for q in detail['questions'])
  assert rank['correct']==sum(q['answer']==q['question']['correct'] for q in detail['questions'])
 outside.call('/rooms/'+room,expected=403)
 assert a.call('/admin/questions',expected=403)['message']=='Cần tài khoản quản lý'
 report=admin.call('/admin/report?room='+room)
 assert report['total']==2
 for row in report['rows']:
  rank=next(x for x in final['ranking'] if x['playerId']==row['playerId'])
  assert row['correct']==rank['correct'] and row['durationMs']==rank['durationMs'] and row['score']==rank['score']
 assert len(report['questions'])==3 and all(q['count']==2 for q in report['questions'])
 print('PASS cold final history, early finish, report/score/time reconciliation and privacy',room,flush=True)
# Editing source content cannot poison immutable cached or restarted room snapshots.
q=questions[0];original=q['text'];q['text']='Changed after room started'
admin.call('/admin/questions/'+q['id'],q,method='PUT')
for room in (code,legacy):
 view=a.call('/rooms/'+room)
 assert next(x['question']['text'] for x in view['details'][0]['questions'] if x['question']['id']==q['id'])==original
restart()
for room in (code,legacy):
 view=a.call('/rooms/'+room)
 assert next(x['question']['text'] for x in view['details'][0]['questions'] if x['question']['id']==q['id'])==original
q['text']=original;admin.call('/admin/questions/'+q['id'],q,method='PUT')
print('PASS completed rooms and immutable question snapshots survive restart',flush=True)
admin.call('/auth/logout',{})
print('PASS room storage regression',flush=True)
