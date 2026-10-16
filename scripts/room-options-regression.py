#!/usr/bin/env python3
"""Local test DB: room creation options and server-side advancement when everyone is ready."""
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




from concurrent.futures import ThreadPoolExecutor
import subprocess

env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
host=Client();host.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
players=[Client() for _ in range(3)];outside=Client()
for p in [*players,outside]:p.call('/session',{'name':'Room options regression'})
qs=host.call('/admin/questions')[:2]
quiz=host.call('/admin/quizzes',{'title':'Room options regression','status':'PUBLISHED','questionIds':[q['id'] for q in qs],'questionSeconds':5,'shuffle':True})
players[0].call('/admin/rooms',{'quizId':quiz['id'],'untimed':True,'advanceWhenReady':True},expected=403)
def create(options):
 room=host.call('/admin/rooms',{'quizId':quiz['id'],**options})
 for p in players:p.call('/rooms/'+room['id']+'/join',{})
 return room
old=create({});assert old['untimed']==False and old['advanceWhenReady']==False
for untimed in (False,True):
 for auto in (False,True):
  r=create({'untimed':untimed,'advanceWhenReady':auto});code=r['id'];path='/rooms/'+code
  opened=host.call('/admin/rooms/'+code+'/start',{});qid=opened['question']['id']
  assert opened['untimed']==untimed and opened['advanceWhenReady']==auto and (opened['deadline']==0)==untimed
  players[0].call(path+'/ready',{'questionId':qid},expected=400)
  for p in players:p.call(path+'/answer',{'questionId':qid,'answer':0})
  before=host.call(path)
  outside.call(path+'/ready',{'questionId':qid},expected=403)
  one=players[0].call(path+'/ready',{'questionId':qid,'playerId':players[1].actor['id']});assert one['status']=='REVEAL' and one['current']==0
  assert not players[1].call(path)['myReady']
  assert players[0].call(path+'/ready',{'questionId':qid})['version']==one['version']
  # Persist partial readiness across a cold restart for the fully self-paced combination.
  if untimed and auto:
   subprocess.run(['docker','compose','--profile','test','restart','test-backend'],check=True,stdout=subprocess.DEVNULL)
   for i in range(30):
    try:urllib.request.urlopen('http://localhost:8081/actuator/health',timeout=2).read();break
    except Exception:time.sleep(1)
   assert players[0].call(path)['myReady'] and not players[1].call(path)['myReady']
  with ThreadPoolExecutor(max_workers=2) as pool:
   list(pool.map(lambda p:p.call(path+'/ready',{'questionId':qid}),players[1:]))
  after=host.call(path)
  if auto:
   assert after['current']==1 and after['status']=='QUESTION' and 'correct' not in after['question']
   players[0].call(path+'/ready',{'questionId':qid},expected=400)
   assert host.call(path)['current']==1
  else:
   assert after['current']==0 and after['status']=='REVEAL' and after['ranking']==before['ranking']
   host.call('/admin/rooms/'+code+'/next',{})
  current=host.call(path);newq=current['question']['id']
  for p in players:p.call(path+'/answer',{'questionId':newq,'answer':0})
  for p in players:p.call(path+'/ready',{'questionId':newq})
  if not auto:host.call('/admin/rooms/'+code+'/next',{})
  end=players[0].call(path);assert end['status']=='FINISHED' and len(end['details'])==1 and len(end['details'][0]['questions'])==2
  assert len(end['ranking'])==3
  print('PASS settings',{'untimed':untimed,'advanceWhenReady':auto},'wait for all, preserve ownership, advance once, finish with private history',flush=True)
# Single learner needs no host process to move or finish.
r=host.call('/admin/rooms',{'quizId':quiz['id'],'untimed':True,'advanceWhenReady':True});code=r['id'];p=players[0];p.call('/rooms/'+code+'/join',{});host.call('/admin/rooms/'+code+'/start',{})
for i in range(2):
 v=p.call('/rooms/'+code);qid=v['question']['id'];p.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':0});p.call('/rooms/'+code+'/ready',{'questionId':qid})
assert p.call('/rooms/'+code)['status']=='FINISHED'
print('PASS single learner completes independently; legacy request defaults unchanged; guest cannot create/configure rooms',flush=True)
host.call('/auth/logout',{})
