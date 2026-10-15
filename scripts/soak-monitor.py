#!/usr/bin/env python3
"""Observe the local test backend during a soak; never resets databases or services."""
import json,subprocess,time,urllib.request
from pathlib import Path
folder=Path('work/soak-30min-100students');samples=[]
while True:
 try:
  state=json.loads((folder/'results.json').read_text())
  stats=subprocess.check_output(['docker','stats','--no-stream','--format','{{json .}}','vju-quiz-test-backend-1','vju-quiz-db-1'],text=True)
  process=subprocess.check_output(['docker','exec','vju-quiz-test-backend-1','cat','/proc/1/status'],text=True)
  process={line.split(':',1)[0]:line.split(':',1)[1].strip() for line in process.splitlines() if line.startswith(('VmRSS:','VmSize:','Threads:'))}
  query="select json_build_object('connections',count(*),'active',count(*) filter(where state='active'),'lockWaits',count(*) filter(where wait_event_type='Lock')) from pg_stat_activity where datname='vju_quiz_test';"
  database=json.loads(subprocess.check_output(['docker','compose','exec','-T','db','psql','-U','vju','-d','vju_quiz_test','-Atc',query],text=True))
  start=time.monotonic()
  with urllib.request.urlopen('http://localhost:3000/api/catalog',timeout=10) as response:main_ok=response.status==200
  samples.append({'at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'round':state['completedRounds'],'containers':[json.loads(line) for line in stats.splitlines()],'process':process,'database':database,'mainHealthy':main_ok,'mainCatalogMs':round((time.monotonic()-start)*1000,2)})
  (folder/'monitor.json').write_text(json.dumps(samples,indent=2))
  if state['status']!='running':break
 except Exception as e:
  samples.append({'at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'observationError':str(e)})
  (folder/'monitor.json').write_text(json.dumps(samples,indent=2))
 time.sleep(30)
