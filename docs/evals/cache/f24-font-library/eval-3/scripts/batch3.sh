cd "$(dirname "$0")"
node s6.cjs > logs/s6.log 2>&1
FS=ac281-library-family,ac282-name-lies,ac283-embedded node d.cjs > logs/d.log 2>&1
node s9.cjs > logs/s9.log 2>&1; node s4.cjs > logs/s4.log 2>&1; node s5.cjs > logs/s5.log 2>&1; node s10.cjs > logs/s10.log 2>&1; node s11.cjs > logs/s11.log 2>&1
node c.cjs > logs/c-d.log 2>&1; PHONE=1 node c.cjs > logs/c-p.log 2>&1
