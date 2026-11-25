cd "$(dirname "$0")"
node a298.cjs > logs/a298-d.log 2>&1; python3 cmp3.py d > logs/cmp3-d.log 2>&1
PHONE=1 node a298.cjs > logs/a298-p.log 2>&1; python3 cmp3.py p > logs/cmp3-p.log 2>&1
node s7.cjs > logs/s7.log 2>&1; node s13.cjs > logs/s13.log 2>&1
