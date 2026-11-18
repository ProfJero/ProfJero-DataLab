#!/usr/bin/env bash
# Build the web app and publish it as a new release on the edge Worker (KV release store).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
BASE=${BASE_URL:-https://profjero-datalab.profjerodigitalstudio.workers.dev}
pnpm --filter @datalab/web build >/dev/null
REL=web-$(date +%Y%m%d%H%M%S)
scripts/upload-release.sh apps/web/dist "$REL" "$BASE"
curl -fsS -X POST -H "x-deploy-key: $DEPLOY_KEY" -d "{\"release\":\"$REL\"}" "$BASE/__deploy/activate"; echo
curl -fsS -X POST -H "x-deploy-key: $DEPLOY_KEY" "$BASE/__deploy/cleanup"; echo
