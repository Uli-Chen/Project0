#!/usr/bin/env bash
# Patch release on the already-authorized auglearn host. Build and validate the
# isolated directory first. Preserve current feature flags and the live database.
set -euo pipefail
export PATH=/home/squareofchen/.local/node/bin:$PATH
app=/home/squareofchen/opc
stage=${1:?Pass the validated isolated release directory}
case "$stage" in /home/squareofchen/opc-release-*) ;; *) echo 'Unexpected staging directory' >&2; exit 1;; esac
test -d "$stage"
test ! -L "$stage"
test -f "$stage/.next/BUILD_ID"
test -f "$stage/RELEASE_VERSION"
test -f "$app/.env.local"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
rollback="/home/squareofchen/opc-before-patch-$stamp"
test ! -e "$rollback"
cp "$app/.env.local" "$stage/.env.local"
chmod 600 "$stage/.env.local"
cd "$app"
NODE_ENV=production npm run db:backup
sudo systemctl stop opc
moved_old=false
recover() {
  if [ "$moved_old" = true ]; then
    sudo systemctl stop opc || true
    if [ -d "$app" ]; then mv "$app" "$app-failed-$stamp"; fi
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
moved_old=true
mv "$stage" "$app"
sudo systemctl start opc
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/login >/dev/null; then
    trap - ERR
    printf 'Patch active; previous code: %s\n' "$rollback"
    exit 0
  fi
  sleep 1
done
false
