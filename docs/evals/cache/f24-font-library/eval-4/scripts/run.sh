#!/bin/sh
# Fourth evaluation (staging 6fbd651). Run from a work folder OUTSIDE the git tree that has out/, out/a298/, out/v298/, logs/, fx/ (fixtures) and lib/.
# FXD points at the fixtures: the eval-3 fixtures, ac281/ac282 from the first evaluation, the own-font files (genown.py, genotf.py) and chunks/ (gen284.py).
# Evidence is then copied to /mnt/project-files/evals-cache/f24-font-library/eval-4/ ; nothing but scripts stays in git.
S="$(cd "$(dirname "$0")" && pwd)"; export FXD="$PWD/fx"
node $S/a298.cjs > logs/a298-d.log 2>&1; python3 $S/cmp3.py d > logs/cmp3-d.log; PHONE=1 node $S/a298.cjs > logs/a298-p.log 2>&1; python3 $S/cmp3.py p > logs/cmp3-p.log
node $S/v298.cjs > logs/v298.log 2>&1; python3 $S/v298.py > logs/v298-shift.log
node $S/g6.cjs > logs/g6.log 2>&1; node $S/s7.cjs > logs/s7.log 2>&1; node $S/s300n.cjs > logs/s300n.log 2>&1; node $S/anim.cjs > logs/anim.log 2>&1; node $S/s288c.cjs > logs/s288c.log 2>&1
node $S/s283.cjs > logs/s283-d.log 2>&1; PHONE=1 node $S/s283.cjs > logs/s283-p.log 2>&1; F=ac283-named-std14 node $S/s283.cjs > logs/s283-std-d.log 2>&1; node $S/s283b.cjs > logs/s283b.log 2>&1
FS=ac281-library-family,ac282-name-lies,ac283-embedded,ac282b-helv,ac282b-twins node $S/d.cjs > logs/d.log 2>&1; node $S/d2.cjs > logs/d2.log 2>&1; python3 $S/score.py > logs/score.log
for s in s3a s3c s3d s8 s3b c; do node $S/$s.cjs > logs/$s-d.log 2>&1; PHONE=1 node $S/$s.cjs > logs/$s-p.log 2>&1; done
for s in s6 s9 s4 s5 s10 g5 s11 axe; do node $S/$s.cjs > logs/$s.log 2>&1; done
# timing runs, alone on the machine
node $S/s300q.cjs > logs/s300q-d.log 2>&1; PHONE=1 ONLY=named node $S/s300q.cjs > logs/s300q-p.log 2>&1; node $S/s312m.cjs > logs/s312m.log 2>&1
node $S/s13.cjs > logs/s13.log 2>&1; node $S/t1.cjs > logs/t1.log 2>&1; node $S/m12.cjs > logs/m12.log 2>&1; node $S/js.cjs > logs/js.log 2>&1; node $S/m8cff.cjs > logs/m8cff.log 2>&1
for i in 1 2 3; do CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npx -y lighthouse@12 https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf --form-factor=mobile --quiet --output=json --output-path=out/lh2/lighthouse-run$i.json --chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY"; done
