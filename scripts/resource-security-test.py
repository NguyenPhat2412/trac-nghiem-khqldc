#!/usr/bin/env python3
"""Bounded abuse checks against disposable localhost:8081 ONLY."""
import concurrent.futures, http.cookiejar, json, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path
BASE='http://localhost:8081/api'
checks=[]
class Client:
 def __init__(self):
  self.actor={};self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path,data=None,method=None,expected=(200,),headers=None):
  h={'Content-Type':'application/json','Origin':'http://localhost:3000','X-CSRF-Token':self.actor.get('csrf','')};h.update(headers or {})
  request=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),method=method or ('GET' if data is None else 'POST'),headers=h)
  try:
   with self.http.open(request,timeout=30) as r:status,raw=r.status,r.read();response_headers=r.headers
  except urllib.error.HTTPError as e:status,raw=e.code,e.read();response_headers=e.headers
  assert status in expected,(path,status,raw[:120]);value=json.loads(raw.decode("utf-8",errors="replace"))
  if isinstance(value,dict) and 'csrf' in value:self.actor=value
  return status,value,response_headers

def sql(statement):
 return subprocess.check_output(['docker','compose','exec','-T','db','psql','-U','vju','-d','vju_quiz_test','-v','ON_ERROR_STOP=1','-Atc',statement],text=True)
def check(name):checks.append(name);print('PASS',name,flush=True)
def hidden(v):
 return (not any(k in v for k in ('correct','explanation','optionSeed','bannedIds')) and all(hidden(x) for x in v.values())) if isinstance(v,dict) else all(hidden(x) for x in v) if isinstance(v,list) else True

env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'))
admin=Client();admin.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
questions=admin.call('/admin/questions')[1];q=next(q for q in questions if q['status']=='PUBLISHED')
quiz=admin.call('/admin/quizzes',{'title':'Resource safety fixture','description':'Test database only','questionIds':[q['id']],'status':'PUBLISHED','timeLimitSeconds':0,'questionSeconds':300,'shuffle':True})[1]
player=Client();player.call('/session',{'name':'Concurrent allocation'})
sql('DELETE FROM allocation_budgets;')
def start(_):return player.call('/attempts',{'quizId':quiz['id']},expected=(200,429))
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:results=list(executor.map(start,range(12)))
assert sum(x[0]==200 for x in results)==5
assert all(hidden(x[1]['questions']) for x in results if x[0]==200)
check('Concurrent starts enforce exactly five active attempts without revealing keys')
player.call('/attempts',{'chapterIds':[q['chapterId']],'count':1,'timeLimitSeconds':0},expected=(429,))
check('Custom practice shares active allocation guard')
completed=next(x[1] for x in results if x[0]==200);player.call('/attempts/'+completed['id']+'/submit',{})
player.call('/attempts',{'quizId':quiz['id']})
player.call('/attempts',{'retryId':completed['id']},expected=(429,))
check('Submitting releases active slot; retry shares quota')
other=Client();other.call('/session',{'name':'New cookie'})
sql("UPDATE allocation_budgets SET used=200 WHERE scope LIKE 'attempt-ip-minute:%';")
other.call('/attempts',{'quizId':quiz['id']},expected=(429,))
other.call('/attempts',{'quizId':quiz['id']},expected=(429,),headers={'X-Forwarded-For':'203.0.113.91','Forwarded':'for=203.0.113.91'})
check('Changing identity or forged forwarding headers cannot reset source budget')
if '--restart' in sys.argv:
 sql("UPDATE allocation_budgets SET used=5000 WHERE scope LIKE 'attempt-ip-day:%';")
 subprocess.run(['docker','compose','--profile','test','restart','test-backend'],check=True,stdout=subprocess.DEVNULL)
 for _ in range(30):
  try:urllib.request.urlopen('http://localhost:8081/actuator/health',timeout=2);break
  except Exception:time.sleep(1)
 other.call('/attempts',{'quizId':quiz['id']},expected=(429,))
 check('Daily source budget and guest session survive backend restart')
sql('DELETE FROM allocation_budgets;')
admin.call('/catalog')
chapter=admin.call('/admin/chapters',{'title':'Cache invalidation fixture','description':'Public summary only','position':999,'status':'PUBLISHED'})[1]
assert any(c['id']==chapter['id'] for c in other.call('/catalog')[1]['chapters'])
admin.call('/admin/chapters/'+chapter['id'],dict(chapter,status='ARCHIVED'),'PUT')
catalog=other.call('/catalog')[1];assert all(c['id']!=chapter['id'] for c in catalog['chapters']) and hidden(catalog)
check('Public catalog cache invalidates immediately after publish/archive and contains no keys')
room=admin.call('/admin/rooms',{'quizId':quiz['id']})[1];code=room['id']
player.call('/rooms/'+code+'/join',{});admin.call('/admin/rooms/'+code+'/kick',{'playerId':player.actor['id']})
player.call('/rooms/'+code+'/join',{},expected=(403,));player.call('/rooms/'+code,expected=(403,))
other.call('/rooms/'+code+'/join',{});admin.call('/admin/rooms/'+code+'/start',{})
view=other.call('/rooms/'+code);assert hidden(view[1]) and 'no-store' in view[2].get('Cache-Control','')
check('Kick frees seat but denies kicked actor; private room response stays no-store')
other.call('/admin/questions',expected=(403,));other.call('/attempts/'+completed['id'],expected=(403,))
check('Other guest cannot read private attempt or administration')
admin.call('/admin/rooms/'+code+'/finish',{});admin.call('/auth/logout',{})
Path('work/resource-security-results.json').write_text(json.dumps({'checks':checks,'passed':len(checks)},indent=2,ensure_ascii=False))
