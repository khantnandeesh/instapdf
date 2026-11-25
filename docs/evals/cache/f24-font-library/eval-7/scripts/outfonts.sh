#!/bin/sh
# Seventh evaluation, regression: every downloaded file of this run against its source (fonts.py): source font objects unchanged, no named-only font gains a program, syntax, page count.
# Run from the work folder (out/, fx/). r7-n* come from ac283-named-only.pdf, r7-e* from chrome-justified-mixed.pdf.
S="$(cd "$(dirname "$0")" && pwd)"; P=/home/user/instapdf/tests/parity/editor; F=$PWD/fx
for o in out/*.pdf; do b=$(basename $o); case $b in r7-n*) s=$F/ac283-named-only.pdf;; r7-e*) s=$P/chrome-justified-mixed.pdf;; *) echo "?? $b"; continue;; esac
  python3 -I $S/fonts.py $s $o 2>&1; done
