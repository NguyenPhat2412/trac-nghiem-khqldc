#!/usr/bin/env python3
"""Additional real API checks against the disposable test-backend."""
import os, json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path

base = os.environ.get('TEST_URL', 'http://localhost:8081') + '/api'
env = dict(x.split('=', 1) for x in Path('.env').read_text().splitlines() if '=' in x and not x.startswith('#'))


class Client:
    def __init__(self):
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.actor = {}

    def call(self, route, body=None, method=None, status=200):
        req = urllib.request.Request(base + route, data=json.dumps(body).encode() if body is not None else None,
            method=method or ('POST' if body is not None else 'GET'), headers={'Content-Type':'application/json',
                'Origin':'http://localhost:3000','X-CSRF-Token':self.actor.get('csrf','')})
        try:
            with self.client.open(req) as r: code, raw = r.status, r.read()
        except urllib.error.HTTPError as e: code, raw = e.code, e.read()
        assert code == status, (route, code, raw[:250])
        result = json.loads(raw)
        if isinstance(result,dict) and 'csrf' in result: self.actor = result
        return result


checks=[]
def check(name, truth):
    assert truth, name
    checks.append(name)
    print('PASS',name)


admin=Client();admin.call('/auth/login',{'username':env.get('ADMIN_USERNAME','admin'),'password':env['ADMIN_PASSWORD']})
catalog=admin.call('/catalog');quiz=catalog['quizzes'][0]
full=next(x for x in admin.call('/admin/quizzes') if x['id']==quiz['id'])
keys={q['id']:q['options'][q['correct']] for q in full['questions']}
players=[]
for i in range(8):
    p=Client();p.call('/session',{'name':'Fair play '+str(i)});players.append(p)
p=players[0]
a=p.call('/attempts',{'quizId':quiz['id'],'instantFeedback':True})
check('Instant-feedback attempt is unranked and initially hides all keys',not a['ranked'] and all('correct' not in q for q in a['questions']))
q=a['questions'][0];wrong=next(i for i,x in enumerate(q['options']) if x!=keys[q['id']])
v=p.call('/attempts/'+a['id']+'/answer',{'questionId':q['id'],'answer':wrong},'PUT')
check('Wrong selection reveals only the answered question',v['questions'][0]['options'][v['questions'][0]['correct']]==keys[q['id']] and all('correct' not in x for x in v['questions'][1:]))
v=p.call('/attempts/'+a['id']+'/answer',{'questionId':q['id'],'answer':v['questions'][0]['correct']},'PUT')
check('Direct API cannot replace first learning choice',v['answers'][q['id']]==wrong)
players[1].call('/attempts/'+a['id'],status=403)
event={'eventId':'same-event','kind':'TAB_HIDDEN'}
players[1].call('/attempts/'+a['id']+'/integrity',event,status=403)
check('Private feedback and events enforce ownership',True)
for _ in range(2):p.call('/attempts/'+a['id']+'/integrity',event)
for _ in range(2):p.call('/attempts/'+a['id']+'/integrity',{'eventId':'same-fullscreen','kind':'FULLSCREEN_EXIT'})
p.call('/attempts/'+a['id']+'/submit',{})
check('Learning results do not enter ranked board',not any(x['playerId']==p.actor['id'] for x in p.call('/leaderboard/'+quiz['id'])))
row=next(x for x in admin.call('/admin/report')['rows'] if x['playerId']==p.actor['id'])
check('Focus and fullscreen events persist once each',row['integrity']['tabHidden']==1 and row['integrity']['fullscreenExit']==1)
qz=admin.call('/admin/quizzes',{'title':'QA fair play','description':'Test only','status':'PUBLISHED','questionIds':[q['id'] for q in full['questions']], 'timeLimitSeconds':240,'questionSeconds':30,'shuffle':True})
room=admin.call('/admin/rooms',{'quizId':qz['id']});code=room['id']
for p in players:p.call('/rooms/'+code+'/join',{})
admin.call('/admin/rooms/'+code+'/start',{})
views=[p.call('/rooms/'+code) for p in players]
check('Players receive differing answer layouts',len({tuple(v['question']['options']) for v in views})>1)
for p,v in zip(players,views):
    current=p.call('/rooms/'+code)
    assert current['question']['options']==v['question']['options']
    assert 'correct' not in v['question'] and 'integrity' not in v
players[0].call('/rooms/'+code+'/integrity',event)
players[0].call('/rooms/'+code+'/integrity',event)
players[0].call('/rooms/'+code+'/integrity',{'eventId':'room-fullscreen','kind':'FULLSCREEN_EXIT'})
host=admin.call('/rooms/'+code)
signals=next(x for x in host['integrity'] if x['playerId']==players[0].actor['id'])['signals']
check('Only host sees persisted focus and fullscreen signals',signals['tabHidden']==1 and signals['fullscreenExit']==1 and 'integrity' not in players[0].call('/rooms/'+code))
answers=[]
for p,v in zip(players,views):
    q=v['question'];choice=q['options'].index(keys[q['id']]);answers.append(choice)
    p.call('/rooms/'+code+'/answer',{'questionId':q['id'],'answer':choice})
for p,v,answer in zip(players,views,answers):
    state=p.call('/rooms/'+code)
    assert state['myAnswer']==answer==state['question']['correct']
    assert state['distribution'][answer]==8 and sum(state['distribution'])==8
check('Shuffled answers grade correctly and reveal matching distributions',all(x['score']==100 for x in state['ranking']))
admin.call('/admin/rooms/'+code+'/finish',{})
check('Review retains each player answer layout',all(p.call('/rooms/'+code)['details'][0]['questions'][0]['answer']==answer for p,answer in zip(players,answers)))
Path('work/fair-play-api-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks},indent=2))
