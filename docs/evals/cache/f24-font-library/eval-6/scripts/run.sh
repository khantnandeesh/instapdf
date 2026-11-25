#!/bin/sh
# Sixth evaluation (staging e95b2c2). Run from a work folder OUTSIDE the git tree that has out/, out/a298/, out/v298/, out/lh2/, logs/, lib/ and fx/ (fixtures:
# eval-4/fixtures from the project files plus ac281-library-family.pdf and ac282-name-lies.pdf of the first evaluation). export FXD="$PWD/fx".
# Evidence is then copied to /mnt/project-files/evals-cache/f24-font-library/eval-6/ ; nothing but scripts and manifest.json stays in git.
# New in this round: s312r.cjs (after the own font: real glyph fonts of the box by CDP, row geometry, names, Enter timeline, download), out312.py (which font object of a saved
# file maps each typed letter), s292n.cjs / s292e.cjs (named-only and embedded line: other new letters after the own font), s3e.cjs (page-edge refusal from Enter),
# s11k.cjs ("Use your own font" from the keyboard, repeated), numdiff.py (numbers of a log against the fifth run's). difflog.py now compares with the fifth run.
# Three passes were made: 1 the AC-312 scripts, 2 the rest (two scripts at a time, so its timings are not used), 3 every timing alone on the machine (the numbers quoted).
S="$(cd "$(dirname "$0")" && pwd)"
# pass 1
sh $S/ac271.sh > logs/ac271.log 2>&1
OWN=1 node $S/s312n.cjs > logs/s312n.log 2>&1; python3 $S/sum312.py > logs/s312n-summary.log
node $S/s312o.cjs > logs/s312o.log 2>&1; node $S/s312p.cjs > logs/s312p.log 2>&1; node $S/axe2.cjs > logs/axe2.log 2>&1
node $S/s312r.cjs > logs/s312r.log 2>&1; node $S/s292n.cjs > logs/s292n.log 2>&1; node $S/s292e.cjs > logs/s292e.log 2>&1
python3 $S/out312.py out/s312r-*.pdf out/s312n-*.pdf out/s312o-*.pdf out/s312p-*.pdf out/s292n-*.pdf out/s292e-*.pdf > logs/out312.log
# pass 2
node $S/d2.cjs > logs/d2.log 2>&1; python3 $S/score.py > logs/score.log 2>&1
FS=ac281-library-family,ac282-name-lies,ac283-embedded,ac282b-helv,ac282b-twins node $S/d.cjs > logs/d.log 2>&1; node $S/s288c.cjs > logs/s288c.log 2>&1
node $S/a298.cjs > logs/a298-d.log 2>&1; python3 $S/cmp3.py d > logs/cmp3-d.log; PHONE=1 node $S/a298.cjs > logs/a298-p.log 2>&1; python3 $S/cmp3.py p > logs/cmp3-p.log
node $S/v298.cjs > logs/v298.log 2>&1; python3 $S/v298.py > logs/v298-shift.log; python3 $S/v298b.py v > logs/v298b-v.log; python3 $S/v298b.py a d > logs/v298b-d.log; python3 $S/v298b.py a p > logs/v298b-p.log
node $S/anim.cjs > logs/anim.log 2>&1; node $S/s7.cjs > logs/s7.log 2>&1; node $S/s13.cjs > logs/s13.log 2>&1; node $S/s300n.cjs > logs/s300n.log 2>&1
for s in s3a s3c s3d s8 s3b c; do node $S/$s.cjs > logs/$s-d.log 2>&1; PHONE=1 node $S/$s.cjs > logs/$s-p.log 2>&1; done
for s in s6 s9 s4 s5 s10 g5 s11 axe; do node $S/$s.cjs > logs/$s.log 2>&1; done
F=ac283-named-std14 node $S/s283.cjs > logs/s283-std-d.log 2>&1; node $S/s283b.cjs > logs/s283b.log 2>&1; node $S/m12.cjs > logs/m12.log 2>&1; node $S/js.cjs > logs/js.log 2>&1
# pass 3 (alone on the machine)
for i in 1 2 3; do CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npx -y lighthouse@12 https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf --form-factor=mobile --quiet --output=json --output-path=out/lh2/lighthouse-run$i.json --chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY" > logs/lh-$i.log 2>&1; done
SIZES=1280 node $S/s312q.cjs > logs/s312q.log 2>&1; SIZES=390 REPS=1 node $S/s312q.cjs > logs/s312q-p.log 2>&1; NOOWN=1 SIZES=1280 REPS=2 TEXTS='[" नया ok"," नया"]' node $S/s312q.cjs > logs/s312q-noown.log 2>&1
SIZES=1280,390 TEXTS='[" नया ⸘ ok"," ř ⸘"]' node $S/s312n.cjs > logs/s312n-refuse.log 2>&1; for k in 1 2; do SIZES=1280,390 TEXTS='[" नया ⸘ ok"]' node $S/s312n.cjs >> logs/s312n-refuse.log 2>&1; done
PHONE=1 node $S/s3d.cjs > logs/s3d-p.log 2>&1; node $S/g6.cjs > logs/g6.log 2>&1; node $S/s300q.cjs > logs/s300q-d.log 2>&1; PHONE=1 ONLY=named node $S/s300q.cjs > logs/s300q-p.log 2>&1
node $S/t1.cjs > logs/t1.log 2>&1; node $S/m8cff.cjs > logs/m8cff.log 2>&1; node $S/s283.cjs > logs/s283-d.log 2>&1; PHONE=1 node $S/s283.cjs > logs/s283-p.log 2>&1
node $S/s3e.cjs > logs/s3e.log 2>&1; WAIT=4500 REPS=2 TEXTS='[" for Dvořák"]' node $S/s3e.cjs > logs/s3e-settled.log 2>&1; REPS=3 node $S/s11k.cjs > logs/s11k.log 2>&1
sh $S/outfonts.sh > logs/outfonts.log 2>&1; for f in logs/*.log; do python3 $S/difflog.py $(basename $f .log) 200 3; done > logs/difflog.txt
