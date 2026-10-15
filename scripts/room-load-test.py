import json,time,statistics,urllib.request,urllib.error,http.cookiejar,concurrent.futures,sys
from pathlib import Path
BASE='http://localhost:8081/api';phase=sys.argv[1] if len(sys.argv)>1 else 'after'
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.actor={}
 def call(self,path,data=None,method=None,expected=200):
  req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),method=method or ('GET' if data is None else 'POST'),headers={'Content-Type':'application/json','Origin':'http://localhost:3000','X-CSRF-Token':self.actor.get('csrf','')})
  try:
   with self.opener.open(req,timeout=60) as r:code,raw=r.status,r.read()
  except urllib.error.HTTPError as e:code,raw=e.code,e.read()
  assert code==expected,(path,code,expected,raw[:120])
  obj=json.loads(raw)
  if isinstance(obj,dict) and 'csrf' in obj:self.actor=obj
  return obj
admin=Client();env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l and not l.startswith('#'));admin.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
cat=admin.call('/catalog');chapter=cat['chapters'][0]['id']
quizzes=admin.call('/admin/quizzes');quiz=next((q for q in quizzes if q['title']=='Performance 100' and q['status']=='PUBLISHED'),None)
if not quiz:
 source=json.loads(Path('content/course-2019.json').read_text())['questions'][:100]
 rows=[{k:v for k,v in q.items() if k in ['text','options','correct','explanation','difficulty']}|{'chapterId':chapter,'imageUrl':'','status':'PUBLISHED'} for q in source]
 admin.call('/admin/import/commit',rows)
 qs=admin.call('/admin/questions');ids=[q['id'] for q in qs if q['text'] in {x['text'] for x in rows}][:100];assert len(ids)==100
 quiz=admin.call('/admin/quizzes',{'title':'Performance 100','description':'Test DB only','status':'PUBLISHED','questionIds':ids,'timeLimitSeconds':0,'questionSeconds':300,'shuffle':True})
room=admin.call('/admin/rooms',{'quizId':quiz['id']});code=room['id'];players=[]
for i in range(100):
 p=Client();p.call('/session',{'name':'Load '+str(i)});p.call('/rooms/'+code+'/join',{});players.append(p)
print('100 players joined 100-question quiz',flush=True)
opened=admin.call('/admin/rooms/'+code+'/start',{});qid=opened['question']['id']
def measure(fn):
 def call(pair):
  i,p=pair;t=time.perf_counter();v=fn(i,p);return (time.perf_counter()-t)*1000
 with concurrent.futures.ThreadPoolExecutor(max_workers=100) as pool:a=sorted(pool.map(call,enumerate(players)))
 return {'p50_ms':round(statistics.median(a),2),'p95_ms':round(a[94],2),'max_ms':round(a[-1],2)}
reads=measure(lambda i,p:p.call('/rooms/'+code));print('Room reads',reads,flush=True)
answers=measure(lambda i,p:p.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':i%4}));print('Answers',answers,flush=True)
end=admin.call('/rooms/'+code);assert end['answered']==100 and end['status']=='REVEAL'
# Send duplicated/out-of-order requests and observe ownership/reveal boundaries in the same fixture.
outsider=Client();outsider.call('/session',{'name':'Outside'});outsider.call('/rooms/'+code,expected=403)
mixed = None
if phase != 'before':
 opened=admin.call('/admin/rooms/'+code+'/next',{});qid=opened['question']['id']
 def reader(p):
  for _ in range(3):p.call('/rooms/'+code);time.sleep(.12)
 def answer(pair):
  i,p=pair;t=time.perf_counter();p.call('/rooms/'+code+'/answer',{'questionId':qid,'answer':i%4});return (time.perf_counter()-t)*1000
 with concurrent.futures.ThreadPoolExecutor(max_workers=200) as pool:
  readers=[pool.submit(reader,p) for p in players]
  submissions=[pool.submit(answer,pair) for pair in enumerate(players)]
  latency=sorted(f.result() for f in submissions)
  for f in readers:f.result()
 mixed={'p50_ms':round(statistics.median(latency),2),'p95_ms':round(latency[94],2),'max_ms':round(latency[-1],2),'concurrentReads':300}
 assert admin.call('/rooms/'+code)['answered']==100
 print('Mixed reads/answers',mixed,flush=True)
admin.call('/admin/rooms/'+code+'/finish',{})
lobby=admin.call('/admin/rooms',{'quizId':quiz['id']})['id']
for p in players:p.call('/rooms/'+lobby+'/join',{})
for p in players:admin.call('/admin/rooms/'+lobby+'/kick',{'playerId':p.actor['id']})
outsider.call('/rooms/'+lobby+'/join',{},expected=400 if phase=='before' else 200)
print('Kicked-capacity check',phase,flush=True)
result={'phase':phase,'players':100,'questions':100,'reads':reads,'answers':answers,'mixed':mixed,'answered':100,'kickedCapacityRecovered':phase!='before'}
Path('work/extended-load-'+phase+'.json').write_text(json.dumps(result,indent=2))
admin.call('/auth/logout',{})
