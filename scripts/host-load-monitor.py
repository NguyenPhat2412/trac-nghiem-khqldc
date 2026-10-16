#!/usr/bin/env python3
"""Bounded read-only host CPU sampling for a local soak; no database sessions or process control."""
import json,sys,time,subprocess
from pathlib import Path
folder=Path(sys.argv[1]); folder.mkdir(parents=True,exist_ok=True); samples=[]
for _ in range(240):
 rows=[]
 for line in subprocess.check_output(['ps','-Ao','pcpu=,comm='],text=True).splitlines():
  parts=line.strip().split(None,1)
  if len(parts)!=2:continue
  try:cpu=float(parts[0])
  except ValueError:continue
  rows.append((cpu,Path(parts[1]).name))
 samples.append({'at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'cpuPercentSum':round(sum(c for c,_ in rows),1),'compilerProcesses':sum(n=='clang++' for _,n in rows),'compilerCpuPercent':round(sum(c for c,n in rows if n=='clang++'),1),'vmCpuPercent':round(sum(c for c,n in rows if n=='com.apple.Virtualization.VirtualMachine'),1)})
 (folder/'host-load.json').write_text(json.dumps(samples,indent=2))
 try:
  if json.loads((folder/'results.json').read_text()).get('status') in ('passed','failed'):break
 except (FileNotFoundError,json.JSONDecodeError):pass
 time.sleep(10)
