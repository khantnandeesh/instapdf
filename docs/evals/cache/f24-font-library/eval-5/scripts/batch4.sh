cd "$(dirname "$0")"
node d2.cjs > logs/d2.log 2>&1
node axe.cjs > logs/axe.log 2>&1
node m12.cjs > logs/m12.log 2>&1; node js.cjs > logs/js.log 2>&1; node t1.cjs > logs/t1.log 2>&1
