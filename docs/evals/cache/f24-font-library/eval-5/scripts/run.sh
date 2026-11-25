#!/bin/sh
# Fifth evaluation (staging 6e82ac3). Run from a work folder OUTSIDE the git tree that has out/, out/a298/, out/v298/, out/v298x/, out/v298y/, out/v298z/, out/lh2/, logs/, fx/ (fixtures) and lib/.
# FXD points at the fixtures: eval-4/fixtures (which holds the eval-3 ones, the own-font files and chunks/) plus ac281/ac282 from the first evaluation.
# Evidence is then copied to /mnt/project-files/evals-cache/f24-font-library/eval-5/ ; nothing but scripts stays in git.
# New in this round: v298b.py (second measure, line rows only), v298.cjs takes OUT/CASES/DSFS/SIZES, s312n.cjs (AC-312 at 1280, 390, 320, with an own font), s312o/p/q.cjs (after the own font),
# axe2.cjs (mixed-case states), ac271.sh, outfonts.sh, tounicode.py, sum312.py, difflog.py (this run's logs against the fourth run's).
sh $S/ac271.sh > logs/ac271.log 2>&1   # first: it also fetches lib/families.json, which score.py needs
S="$(cd "$(dirname "$0")" && pwd)"; export FXD="$PWD/fx"
node $S/a298.cjs > logs/a298-d.log 2>&1; python3 $S/cmp3.py d > logs/cmp3-d.log; PHONE=1 node $S/a298.cjs > logs/a298-p.log 2>&1; python3 $S/cmp3.py p > logs/cmp3-p.log
node $S/v298.cjs > logs/v298.log 2>&1; python3 $S/v298.py > logs/v298-shift.log; python3 $S/v298b.py v > logs/v298b-v.log; python3 $S/v298b.py a d > logs/v298b-d.log; python3 $S/v298b.py a p > logs/v298b-p.log
OUT=out/v298x CASES=10,11,12,13 DSFS=1,2,3 node $S/v298.cjs > logs/v298x.log 2>&1; OUT=out/v298y SIZES=390 DSFS=3 CASES=0,1,2,3,4,5,6,7,8,9 node $S/v298.cjs > logs/v298y.log 2>&1; OUT=out/v298z SIZES=1280 DSFS=1.5,1.25 node $S/v298.cjs > logs/v298z.log 2>&1; for x in x y z; do python3 $S/v298b.py v out/v298$x > logs/v298b-$x.log; done
node $S/g6.cjs > logs/g6.log 2>&1; node $S/s7.cjs > logs/s7.log 2>&1; node $S/s300n.cjs > logs/s300n.log 2>&1; node $S/anim.cjs > logs/anim.log 2>&1; node $S/s288c.cjs > logs/s288c.log 2>&1
node $S/s283.cjs > logs/s283-d.log 2>&1; PHONE=1 node $S/s283.cjs > logs/s283-p.log 2>&1; F=ac283-named-std14 node $S/s283.cjs > logs/s283-std-d.log 2>&1; node $S/s283b.cjs > logs/s283b.log 2>&1
FS=ac281-library-family,ac282-name-lies,ac283-embedded,ac282b-helv,ac282b-twins node $S/d.cjs > logs/d.log 2>&1; node $S/d2.cjs > logs/d2.log 2>&1; python3 $S/score.py > logs/score.log
for s in s3a s3c s3d s8 s3b c; do node $S/$s.cjs > logs/$s-d.log 2>&1; PHONE=1 node $S/$s.cjs > logs/$s-p.log 2>&1; done
for s in s6 s9 s4 s5 s10 g5 s11 axe; do node $S/$s.cjs > logs/$s.log 2>&1; done
OWN=1 node $S/s312n.cjs > logs/s312n.log 2>&1; python3 $S/sum312.py > logs/s312n-summary.log; node $S/s300q.cjs > logs/s300q-d.log 2>&1; PHONE=1 ONLY=named node $S/s300q.cjs > logs/s300q-p.log 2>&1
node $S/s312o.cjs > logs/s312o.log 2>&1; node $S/s312p.cjs > logs/s312p.log 2>&1; SIZES=1280 node $S/s312q.cjs > logs/s312q.log 2>&1; SIZES=390 REPS=1 node $S/s312q.cjs > logs/s312q-p.log 2>&1; NOOWN=1 SIZES=1280 REPS=2 TEXTS='[" नया ok"," नया"]' node $S/s312q.cjs > logs/s312q-noown.log 2>&1
node $S/s13.cjs > logs/s13.log 2>&1; node $S/t1.cjs > logs/t1.log 2>&1; node $S/m12.cjs > logs/m12.log 2>&1; node $S/js.cjs > logs/js.log 2>&1; node $S/m8cff.cjs > logs/m8cff.log 2>&1
node $S/axe2.cjs > logs/axe2.log 2>&1; sh $S/outfonts.sh > logs/outfonts.log 2>&1; for f in logs/*.log; do python3 $S/difflog.py $(basename $f .log) 200 3; done > logs/difflog.txt
for i in 1 2 3; do CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npx -y lighthouse@12 https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf --form-factor=mobile --quiet --output=json --output-path=out/lh2/lighthouse-run$i.json --chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY"; done
