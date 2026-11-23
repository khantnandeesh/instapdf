#!/usr/bin/env bash
# Post-deploy smoke test: GET <base-url>/api/health until it returns 200.
# Usage: smoke-test.sh <base-url> [attempts] [delay-seconds]
set -euo pipefail

base_url="${1:?usage: smoke-test.sh <base-url> [attempts] [delay-seconds]}"
attempts="${2:-10}"
delay="${3:-6}"
url="${base_url%/}/api/health"

for i in $(seq 1 "$attempts"); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)"
  echo "attempt ${i}/${attempts}: ${url} -> ${code}"
  if [ "$code" = "200" ]; then
    echo "smoke test passed"
    exit 0
  fi
  sleep "$delay"
done

echo "::error::smoke test failed: ${url} did not return 200"
exit 1
