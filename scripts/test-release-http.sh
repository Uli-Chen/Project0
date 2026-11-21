#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

scratch=$(mktemp -d)
service_pid=
cleanup() {
  if [ -n "$service_pid" ]; then
    kill "$service_pid" 2>/dev/null || true
    wait "$service_pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

port=$(node -e 'const server = require("node:net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });')
export DATABASE_PATH="$scratch/app.db" DATABASE_BACKUP_DIR="$scratch/backups"
export SMOKE_BASE_URL="http://127.0.0.1:$port" APP_ORIGIN="http://127.0.0.1:$port" TEST_BASE_URL="http://127.0.0.1:$port"
export NODE_ENV=production LLM_API_KEY="" LLM_PAYLOADS_ENABLED=false REGISTRATION_ENABLED=true
export QUESTION_BANK_ENABLED=true QUICK_ENABLED=true CHECKPOINTS_ENABLED=true

npm run db:migrate
npm run db:import-questions
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$port" >"$scratch/server.log" 2>&1 &
service_pid=$!
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "$SMOKE_BASE_URL/login" >/dev/null 2>&1; then
    if kill -0 "$service_pid" 2>/dev/null && npm run test:auth && npm run smoke:release -- --allow-production; then exit 0; fi
    break
  fi
  kill -0 "$service_pid" 2>/dev/null || break
  sleep 1
done
cat "$scratch/server.log" >&2
exit 1
