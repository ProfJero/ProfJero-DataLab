#!/usr/bin/env bash
# Upload a directory to the web edge Worker's KV release store.
# Usage: DEPLOY_KEY=... scripts/upload-release.sh <dir> <release-id> [base-url]
set -euo pipefail
DIR=$1; REL=$2; BASE=${3:-https://profjero-datalab.profjerodigitalstudio.workers.dev}
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
cd "$DIR"
n=0
while IFS= read -r -d '' f; do
  p=${f#./}
  case "$p" in *.html) t="text/html";; *.js) t="text/javascript";; *.css) t="text/css";; *.svg) t="image/svg+xml";; *.png) t="image/png";; *.json|*.webmanifest) t="application/json";; *.xml) t="application/xml";; *.txt) t="text/plain";; *.ico) t="image/x-icon";; *.woff2) t="font/woff2";; *) t="application/octet-stream";; esac
  for i in 1 2 3; do
    if curl -fsS -m 60 -X PUT -H "x-deploy-key: $DEPLOY_KEY" -H "content-type: $t" --data-binary @"$f" "$BASE/__deploy/file/$REL/$p" >/dev/null; then break; fi
    sleep $((i*2)); [ $i = 3 ] && { echo "failed: $p"; exit 1; }
  done
  n=$((n+1))
done < <(find . -type f ! -name '*.map' -print0)
echo "uploaded $n files to release $REL"
