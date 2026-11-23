#!/usr/bin/env bash
# Post-deploy smoke test: GET <base-url>/api/health until it returns 200
# (and, if given, reports the expected version).
# Usage: smoke-test.sh <base-url> [expected-version] [attempts] [delay-seconds]
set -euo pipefail

base_url="${1:?usage: smoke-test.sh <base-url> [expected-version] [attempts] [delay-seconds]}"
expected_version="${2:-}"
attempts="${3:-10}"
delay="${4:-6}"
url="${base_url%/}/api/health"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

for i in $(seq 1 "$attempts"); do
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 10 "$url" || true)"
  code="${code:-000}"
  version="$(jq -r '.version // empty' "$body" 2>/dev/null || true)"
  echo "attempt ${i}/${attempts}: ${url} -> ${code} version=${version:-?}"
  if [ "$code" = "200" ]; then
    if [ -z "$expected_version" ] || [ "$version" = "$expected_version" ]; then
      echo "smoke test passed"
      exit 0
    fi
    echo "version mismatch: expected ${expected_version}"
  fi
  sleep "$delay"
done

echo "::error::smoke test failed: ${url} did not return 200${expected_version:+ with version ${expected_version}}"
exit 1
