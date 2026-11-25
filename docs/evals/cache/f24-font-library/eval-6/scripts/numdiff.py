# Sixth evaluation: line by line, a log of this run against the same log of the fifth: the largest change of any number on a line, and the lines that changed by more than a threshold.
# Usage: python3 numdiff.py <log name> [threshold] [max lines]
import sys, re
E = "/mnt/project-files/evals-cache/f24-font-library/eval-5/logs/"; n = sys.argv[1]; T = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3; MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 8
strip = lambda l: re.sub(r"^\d\d:\d\d:\d\d\.\d+ ", "", l.rstrip("\n"))
old = [strip(l) for l in open(E + n + ".log", encoding="utf8", errors="replace")]; new = [strip(l) for l in open("logs/" + n + ".log", encoding="utf8", errors="replace")]
num = lambda l: [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", l)]
big = []; worst = 0.0
for a, b in zip(old, new):
    x, y = num(a), num(b)
    if len(x) != len(y) or re.sub(r"-?\d+(\.\d+)?", "N", a) != re.sub(r"-?\d+(\.\d+)?", "N", b): big.append(("shape", a, b)); continue
    d = max([abs(p - q) for p, q in zip(x, y)] or [0]); worst = max(worst, d)
    if d > T: big.append((d, a, b))
print(f"== {n}: lines {len(old)} -> {len(new)}; largest change of a number {worst:g}; lines over {T:g}: {len(big)}")
for d, a, b in big[:MAX]: print("   was:", a[:230]); print("   now:", b[:230])
