#!/usr/bin/env python3
"""Local experience room: only advance after every human confirms reading. Run from project root."""
import argparse,json,time,http.cookiejar,urllib.request
from pathlib import Path
BASE='http://localhost:3000/api'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--questions',type=int,default=6,choices=range(1,21))
parser.add_argument('--seconds',type=int,default=180,choices=range(5,301))
parser.add_argument('--state',default='work/manual-demo.json')
parser.add_argument('--untimed',action='store_true',help='No answer deadline; explanations still wait for the learner.')
args=parser.parse_args()
class Client:
 def __init__(self):
  self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
 def call(self,path,data=None,method=None):
  req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),method=method or ('GET' if data is None else 'POST'),headers={'Content-Type':'application/json','Origin':'http://localhost:3000','X-CSRF-Token':self.csrf})
  with self.http.open(req,timeout=15) as r: result=json.load(r)
  if isinstance(result,dict) and 'csrf' in result:self.csrf=result['csrf']
  return result
env=dict(x.split('=',1) for x in Path('.env').read_text().splitlines() if '=' in x and not x.startswith('#'))
host=Client();host.call('/auth/login',{'username':env['ADMIN_USERNAME'],'password':env['ADMIN_PASSWORD']})
catalog=host.call('/catalog');chapter=next(c for c in catalog['chapters'] if 'Chương 1.' in c['title'])
qs=[q for q in host.call('/admin/questions') if q['chapterId']==chapter['id'] and q['status']=='PUBLISHED'][:args.questions]
payload={'title':f'Đọc xong rồi chuyển · {len(qs)} câu','description':f'Phòng trải nghiệm: {len(qs)} câu, {args.seconds} giây mỗi câu; ba người chơi minh họa. Đọc xong rồi bấm để chuyển.','status':'PUBLISHED','questionIds':[q['id'] for q in qs],'timeLimitSeconds':1200,'questionSeconds':args.seconds,'shuffle':True}
if args.untimed:
 payload['title']='Không giới hạn thời gian · '+str(len(qs))+' câu'
 payload['description']='Phòng thử: đọc kỹ câu hỏi, trả lời rồi bấm sau khi xem xong lời giải. Không có đồng hồ đếm ngược.'
quiz=host.call('/admin/quizzes',payload)
room=host.call('/admin/rooms',{'quizId':quiz['id'],'untimed':args.untimed,'advanceWhenReady':True});code=room['id']
host.call('/admin/quizzes/'+quiz['id'],payload|{'status':'ARCHIVED'},'PUT')
bots=[]
for name in ['An · minh họa','Bình · minh họa','Chi · minh họa']:
 bot=Client();bot.call('/session',{'name':name});bot.call('/rooms/'+code+'/join',{});bots.append(bot)
Path(args.state).write_text(json.dumps({'room':code,'url':'http://localhost:3000/room/'+code}))
print('Ready room '+code,flush=True)
seen=set();end=time.monotonic()+14400
while time.monotonic()<end:
 state=host.call('/rooms/'+code)
 if state['status']=='LOBBY' and len(state['members'])>3:
  host.call('/admin/rooms/'+code+'/start',{});print('Student joined; room started.',flush=True)
 elif state['status']=='QUESTION' and state['current'] not in seen:
  for i,bot in enumerate(bots):
   time.sleep(2+i)
   view=bot.call('/rooms/'+code)
   if view['status']=='QUESTION':bot.call('/rooms/'+code+'/answer',{'questionId':view['question']['id'],'answer':(state['current']+i)%4})
  seen.add(state['current'])
 elif state['status']=='REVEAL':
  for bot in bots:
   view=bot.call('/rooms/'+code)
   if view['status']!='REVEAL' or view['current']!=state['current']:break
   if not view.get('myReady'):bot.call('/rooms/'+code+'/ready',{'questionId':view['question']['id']})
 elif state['status']=='FINISHED':break
 time.sleep(1)
host.call('/auth/logout',{})
print('Demo host stopped.',flush=True)
