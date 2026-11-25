#!/bin/sh
# Regression: every downloaded file against its source: source font objects unchanged, no named-only font gains a program, syntax check, page count (fonts.py).
S="$(cd "$(dirname "$0")" && pwd)"; P=/home/user/instapdf/tests/parity/editor; F=$PWD/fx
for o in out/*.pdf; do b=$(basename $o); case $b in
  s283-ac283-named-std14*) s=$F/ac283-named-std14.pdf;; s283*|s300q-arial*|s300q-georgia*|s312n-arial*) s=$F/ac283-named-only.pdf;; s300q-std14*|s10-std14*) s=$P/std14-reportlab.pdf;;
  s300q-embedded*|s312n-embedded*|s312o*|s312p*|s3a*|s3c*|s9-ac280*|c-*|t1*) s=$P/chrome-justified-mixed.pdf;; s288c*) s=$F/ac288-scripts2.pdf;; s7-cff*|m8-cff*) s=$P/latex-type1c.pdf;; s10-scripts*) s=$P/scripts-chrome.pdf;;
  s5-memo*|s6-libreo*) s=$P/libreoffice-memo.pdf;; s6-chrome*|s9-playfair*) s=$P/chrome-justified-mixed.pdf;;
  d-ac281*) s=$F/ac281-library-family.pdf;; d-ac282-name*) s=$F/ac282-name-lies.pdf;; d-ac283-emb*) s=$F/ac283-embedded.pdf;; d-ac282b-helv*) s=$F/ac282b-helv.pdf;; d-ac282b-twins*) s=$F/ac282b-twins.pdf;; *) echo "?? $b"; continue;; esac
  python3 $S/fonts.py $s $o 2>&1; done
