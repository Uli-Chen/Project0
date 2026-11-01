#!/usr/bin/env bash
# Run on the existing auglearn host only after the staged release passes npm run check.
set -euo pipefail
export PATH=/home/squareofchen/.local/node/bin:$PATH
app=/home/squareofchen/opc
stage=/home/squareofchen/opc-release-20261101-wp8
stamp=$(date -u +%Y%m%dT%H%M%SZ)
rollback="/home/squareofchen/opc-before-wp8-$stamp"
test -f "$stage/.next/BUILD_ID"
test -f "$app/.env.local"
cp "$app/.env.local" "$stage/.env.local"
chmod 600 "$stage/.env.local"
# Install compatible reader first. Flags are enabled separately after smoke tests.
python3 - "$stage/.env.local" <<'PY'
import sys
p=sys.argv[1]
flags={'QUESTION_BANK_ENABLED':'false','QUICK_ENABLED':'false','CHECKPOINTS_ENABLED':'false','FOCUS_ENABLED':'false'}
lines=open(p).read().splitlines()
lines=[line for line in lines if line.split('=',1)[0].strip() not in flags]
open(p,'w').write('\n'.join(lines+[k+'='+v for k,v in flags.items()])+'\n')
PY
cd "$app"
NODE_ENV=production npm run db:backup
sudo systemctl stop opc
switched=false
recover() {
  if [ "$switched" = true ]; then
    sudo systemctl stop opc || true
    mv "$app" "$app-failed-$stamp"
    mv "$rollback" "$app"
  fi
  sudo systemctl start opc || true
}
trap recover ERR
cd "$stage"
NODE_ENV=production npm run db:migrate
NODE_ENV=production npm run db:import-questions
NODE_ENV=production npm run db:migrate-0.4
mv "$app" "$rollback"
mv "$stage" "$app"
switched=true
sudo systemctl start opc
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/login >/dev/null; then
    trap - ERR
    printf 'Compatible reader active; previous code: %s\n' "$rollback"
    exit 0
  fi
  sleep 1
done
false
