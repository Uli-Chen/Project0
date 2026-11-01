#!/usr/bin/env bash
set -euo pipefail
export PATH=/home/squareofchen/.local/node/bin:$PATH
cd /home/squareofchen/opc
stage=${1:?Choose reader, bank, quick, or checkpoints}
python3 - "$stage" <<'PY'
import sys
stage=sys.argv[1]
levels={'reader':0,'bank':1,'quick':2,'checkpoints':3}
if stage not in levels: raise SystemExit('Unknown rollout stage')
n=levels[stage]
values={'QUESTION_BANK_ENABLED':n>=1,'QUICK_ENABLED':n>=2,'CHECKPOINTS_ENABLED':n>=3,'FOCUS_ENABLED':False}
p='.env.local'
lines=[line for line in open(p).read().splitlines() if line.split('=',1)[0].strip() not in values]
open(p,'w').write('\n'.join(lines+[k+'='+str(v).lower() for k,v in values.items()])+'\n')
PY
sudo systemctl restart opc
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/login >/dev/null; then
    NODE_ENV=production node --conditions=react-server --import tsx scripts/release-smoke.ts --allow-production
    exit 0
  fi
  sleep 1
done
exit 1
