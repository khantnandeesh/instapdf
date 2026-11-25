# compare a log of this run with the same log of the fourth evaluation: lines that differ once times and other numbers are masked
import sys, re
E = "/mnt/project-files/evals-cache/f24-font-library/eval-4/logs/"; W = int(sys.argv[2]) if len(sys.argv) > 2 else 260; MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 8
def norm(l): l = re.sub(r"^\d\d:\d\d:\d\d\.\d+ ", "", l.rstrip("\n")); return re.sub(r"\d+(\.\d+)?", "N", l)
n = sys.argv[1]
try: old = open(E + n + ".log", encoding="utf8", errors="replace").readlines()
except FileNotFoundError: old = []
new = open("logs/" + n + ".log", encoding="utf8", errors="replace").readlines(); so = {norm(l) for l in old}; sn = {norm(l) for l in new}
add = [l for l in new if norm(l) not in so]; gone = [l for l in old if norm(l) not in sn]
print(f"== {n}: lines {len(old)} -> {len(new)}; new or changed {len(add)}; no longer there {len(gone)}")
for l in add[:MAX]: print("  + " + re.sub(r"^\d\d:\d\d:\d\d\.\d+ ", "", l.strip())[:W])
for l in gone[:MAX]: print("  - " + re.sub(r"^\d\d:\d\d:\d\d\.\d+ ", "", l.strip())[:W])
