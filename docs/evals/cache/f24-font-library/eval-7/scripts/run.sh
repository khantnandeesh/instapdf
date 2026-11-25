#!/bin/sh
# Seventh evaluation (staging 8686e4b), narrow re-check of AC-312 on a line whose font the PDF only names. Run from a work folder OUTSIDE the git tree with out/, logs/ and fx/
# (fx/: ac283-named-only.pdf and own-dejavu.ttf of eval-4/fixtures). No request to sejda.com is made by any script here.
# r7.cjs is the one runner (built on the sixth run's s292n.cjs, s292e.cjs, s312q.cjs, s312o.cjs, axe2.cjs; s292n.cjs is kept beside it for reference).
S="$(cd "$(dirname "$0")" && pwd)"; export FXD="$PWD/fx"
node $S/r7.cjs > logs/r7.log 2>&1                      # every case once
CASES=nT-1280 TAGOUT=nT node $S/r7.cjs > logs/r7-nT.log 2>&1   # another named-only font (Helvetica)
for i in 2 3; do CASES=nA-1280,nB-1280,nA-390,nB-390,nA-320,nB-320,nD-1280,nE-1280,eA-1280,eN-1280,eA-390,eN-390,nN-1280 SUF=-pass$i TAGOUT=pass$i node $S/r7.cjs > logs/r7-pass$i.log 2>&1; done
python3 -I $S/out312.py out/r7-*.pdf > logs/out312.log 2>&1   # which font object maps each typed letter
sh $S/outfonts.sh > logs/outfonts.log 2>&1                    # no extra font files
