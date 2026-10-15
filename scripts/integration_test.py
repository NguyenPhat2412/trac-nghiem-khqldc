#!/usr/bin/env python3
"""Real HTTP regression tests. Run only against a disposable test database."""
import os,json,time,urllib.request,urllib.error,http.cookiejar,concurrent.futures,statistics,platform
BASE=os.environ.get('TEST_URL','http://localhost:8081')+'/api'
class Client:
 def __init__(self):
  self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf='';self.actor=None
 def call(self,path,method='GET',body=None,expected=200,csrf=True):
  headers={'Content-Type':'application/json','Origin':'http://localhost:3000'}
  if csrf:headers['X-CSRF-Token']=self.csrf
  req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
  try:
   with self.opener.open(req,timeout=30) as res:status=res.status;raw=res.read()
  except urllib.error.HTTPError as e:status=e.code;raw=e.read()
  assert status==expected,(method,path,status,expected,raw[:300])
  try:data=json.loads(raw)
  except ValueError:return raw
  if isinstance(data,dict) and 'csrf' in data:self.csrf=data['csrf'];self.actor=data
  return data
 def guest(self,name='Cùng tên'):return self.call('/session','POST',{'name':name})
 def login(self,name=None,password=None):return self.call('/auth/login','POST',{'username':name or os.environ.get('ADMIN_USERNAME','admin'),'password':password or os.environ['ADMIN_PASSWORD']})
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
admin=Client();admin.login();cat=admin.call('/catalog');quiz=cat['quizzes'][0];full=next(q for q in admin.call('/admin/quizzes') if q['id']==quiz['id'])
a,b=Client(),Client();a.guest();b.guest()
check('Same names have separate identities',a.actor['id']!=b.actor['id'])
a.call('/admin/questions',expected=403);check('Guest cannot manage content',True)
x=a.call('/attempts','POST',{'quizId':quiz['id']});qid=x['questions'][0]['id']
check('Answer keys hidden during attempt',all('correct' not in q and 'explanation' not in q for q in x['questions']))
b.call('/attempts/'+x['id'],expected=403);check('Private attempts protected',True)
a.call('/attempts/'+x['id']+'/answer','PUT',{'questionId':qid,'answer':0},expected=403,csrf=False);check('CSRF token required',True)
# Keys use snapshot option text even after shuffling.
keys={q['id']:q['options'][q['correct']] for q in full['questions']}
for q in x['questions']:a.call('/attempts/'+x['id']+'/answer','PUT',{'questionId':q['id'],'answer':q['options'].index(keys[q['id']]),'flagged':True})
res=a.call('/attempts/'+x['id']+'/submit','POST',{})
check('Server grades shuffled answers correctly',res['score']==100 and res['correct']==len(x['questions']))
again=a.call('/attempts/'+x['id']+'/submit','POST',{});check('Repeated submission is idempotent',again['durationMs']==res['durationMs'])
a.call('/attempts/'+x['id']+'/answer','PUT',{'questionId':qid,'answer':0},expected=400);check('Finished attempts immutable',True)
y=a.call('/attempts','POST',{'quizId':quiz['id']});a.call('/attempts/'+y['id']+'/submit','POST',{})
board=a.call('/leaderboard/'+quiz['id']);mine=next(r for r in board if r['playerId']==a.actor['id'])
check('Leaderboard retains best attempt and counts repeats',mine['score']==100 and mine['attempts']==2)
retry=a.call('/attempts','POST',{'retryId':y['id']});check('Wrong-answer retry excluded from ranking',not retry['ranked'])
custom=a.call('/attempts','POST',{'chapterIds':[cat['chapters'][0]['id']],'count':1,'timeLimitSeconds':1});time.sleep(1.2);expired=a.call('/attempts/'+custom['id']);check('Deadline auto-submits saved answers',expired['status']=='DONE' and expired['durationMs']==1000)
# Snapshot survives question edits and new quiz version.
question=next(q for q in admin.call('/admin/questions') if q['id']==qid);original=question['text'];question['text']='QA changed question';admin.call('/admin/questions/'+qid,'PUT',question)
check('Attempt snapshot unchanged after edit',next(q for q in a.call('/attempts/'+x['id'])['questions'] if q['id']==qid)['text']==original)
new={'title':'QA version','description':'Test only','status':'PUBLISHED','questionIds':[q['id'] for q in full['questions']],'timeLimitSeconds':240,'questionSeconds':5,'shuffle':True}
v=admin.call('/admin/quizzes/'+quiz['id'],'PUT',new);check('Published edit creates a new version',v['id']!=quiz['id'] and v['version']==2)
# Import invalid batch must commit nothing.
before=len(admin.call('/admin/questions'));bad=dict(question);bad['correct']=8
admin.call('/admin/import/commit','POST',[question,bad],expected=400);check('Invalid import is atomic',len(admin.call('/admin/questions'))==before)
admin.call('/admin/import/commit','POST',[question]);check('Valid import creates questions',len(admin.call('/admin/questions'))==before+1)
# Editor permissions and room lifecycle.
editorpass='TestEditorPassword-1234';staff=admin.call('/admin/staff','POST',{'username':'qa_editor','name':'QA Editor','password':editorpass,'role':'EDITOR','enabled':True})
editor=Client();editor.login('qa_editor',editorpass);editor.call('/admin/staff',expected=403);check('Editor cannot grant roles',True)
room=admin.call('/admin/rooms','POST',{'quizId':v['id']});code=room['id']
a.call('/rooms/'+code+'/join','POST',{});b.call('/rooms/'+code+'/join','POST',{})
editor.call('/admin/rooms/'+code+'/start','POST',{},expected=403);check('Editor cannot control another host room',True)
a.call('/admin/rooms/'+code+'/start','POST',{},expected=403);check('Guest cannot host',True)
admin.call('/admin/rooms/'+code+'/lock','POST',{});c=Client();c.guest('Người đến sau');c.call('/rooms/'+code+'/join','POST',{},expected=400);check('Locked lobby rejects new members',True)
admin.call('/admin/rooms/'+code+'/lock','POST',{});c.call('/rooms/'+code+'/join','POST',{});admin.call('/admin/rooms/'+code+'/kick','POST',{'playerId':c.actor['id']});c.call('/rooms/'+code,expected=403);check('Kicked player loses room access',True)
r=admin.call('/admin/rooms/'+code+'/start','POST',{});rq=r['question'];a.call('/rooms/'+code+'/answer','POST',{'questionId':'wrong','answer':0},expected=400);check('Cannot answer an unopened question',True)
a.call('/rooms/'+code+'/answer','POST',{'questionId':rq['id'],'answer':0});a.call('/rooms/'+code+'/answer','POST',{'questionId':rq['id'],'answer':1});check('First room answer locked',a.call('/rooms/'+code)['myAnswer']==0)
check('Room does not reveal keys early','correct' not in a.call('/rooms/'+code)['question'])
b.call('/rooms/'+code+'/answer','POST',{'questionId':rq['id'],'answer':1});r=admin.call('/rooms/'+code);check('All responses close question',r['status']=='REVEAL' and 'correct' in r['question'])
a.call('/rooms/'+code+'/answer','POST',{'questionId':rq['id'],'answer':0},expected=400);check('Closed question rejects answers',True)
r=admin.call('/admin/rooms/'+code+'/next','POST',{});check('Rejoin resumes same player',a.call('/rooms/'+code+'/join','POST',{})['current']==1)
time.sleep(5.3);r=a.call('/rooms/'+code);check('Server closes question without host connection',r['status']=='REVEAL')
end=admin.call('/admin/rooms/'+code+'/finish','POST',{});check('Early finish grades only opened questions',end['early'] and len(end['details'][0]['questions'])==2)
check('Student sees only their own detailed responses',len(a.call('/rooms/'+code)['details'])==1)
check('Editor report restricted to own rooms',editor.call('/admin/report')['total']==0)
check('Admin report contains results',admin.call('/admin/report')['total']>=4)
csv=admin.call('/admin/report.csv');check('CSV report exported',b'QA' in csv or len(csv)>100)
admin.call('/admin/staff/'+staff['id'],'PUT',{'name':'QA Editor','role':'EDITOR','enabled':False});editor.call('/admin/questions',expected=401);check('Disabled account session revoked',True)
# Concurrent room answers: all participants join, synchronized burst, final ranking stable.
load=admin.call('/admin/rooms','POST',{'quizId':v['id']});loadcode=load['id']
players=[]
for i in range(100):
 client=Client();client.guest('Tải thử '+str(i+1));client.call('/rooms/'+loadcode+'/join','POST',{});players.append(client)
live=admin.call('/admin/rooms/'+loadcode+'/start','POST',{});questionid=live['question']['id']
def answer_one(pair):
 i,client=pair;t=time.perf_counter();client.call('/rooms/'+loadcode+'/answer','POST',{'questionId':questionid,'answer':i%4});return (time.perf_counter()-t)*1000
with concurrent.futures.ThreadPoolExecutor(max_workers=100) as pool:latencies=list(pool.map(answer_one,enumerate(players)))
loadresult=admin.call('/rooms/'+loadcode);check('100 concurrent submissions retained exactly once',loadresult['answered']==100 and loadresult['status']=='REVEAL' and len(loadresult['ranking'])==100)
report={'passed':len(checks),'checks':checks,'load':{'players':100,'responses':100,'p50_ms':round(statistics.median(latencies),2),'p95_ms':round(sorted(latencies)[94],2),'max_ms':round(max(latencies),2)},'machine':platform.platform(),'timestamp':time.time()}
with open('work/integration-results.json','w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report['load']),flush=True)
