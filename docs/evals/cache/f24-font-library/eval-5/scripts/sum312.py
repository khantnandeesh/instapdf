# one line per case of s312n.log: hint, buttons, status, fit, Enter time and message, own font
import re, json, sys
rows = {}
for l in open(sys.argv[1] if len(sys.argv) > 1 else "logs/s312n.log", encoding="utf8"):
    m = re.match(r'\S+ (\d+) (\S+) ("(?:[^"\\]|\\.)*") (.*)', l)
    if not m: continue
    k = (m.group(1), m.group(2), json.loads(m.group(3))); r = rows.setdefault(k, {}); rest = m.group(4)
    if rest.startswith("typed:"):
        j = json.loads(rest[6:]); r.update(hint=j["hint"], btns=j["btns"], status=j["status"], settle=j["hintSettledMs"], foc=j["focused"], fit=(not j["geo"]["clipped"] and not j["geo"]["outside"] and j["geo"]["docW"] <= j["geo"]["vw"]) if j["geo"] else None, r=j["geo"] and j["geo"]["r"], rowsN=j["geo"] and j["geo"]["rows"])
    elif rest.startswith("Enter answered ms"):
        r["enter"] = rest.split()[3]; n = re.findall(r'"notice":"([^"]*)"', rest); r["msg"] = n[-1][:90] if n else None; r["saved"] = '"saved":true' in rest; a = re.search(r"\| after: (\{.*?\}) \| aria", rest); r["boxKept"] = bool(a and json.loads(a.group(1))["box"]); r["focAfter"] = a and json.loads(a.group(1))["focused"]
    elif rest.startswith("font files fetched"): r["woff"] = len(json.loads(re.search(r"(\[.*\])", rest).group(1))); r["nonget"] = rest.split()[-1]
    elif rest.startswith("own font added"): r["ownMs"] = rest.split()[6]; j = json.loads(re.search(r"(\{.*\})", rest).group(1)); r["ownBtns"] = j["btns"]; r["ownStatus"] = j["status"]
    elif rest.startswith("after own font"): r["ownSaved"] = '"saved":true' in rest
for k, r in rows.items():
    print(k[0], k[1][:5], repr(k[2]).ljust(12), "| hint:", r.get("hint"), "| status:", (r.get("status") or "")[:140], "| fits", r.get("fit"), r.get("r"), "| settle", r.get("settle"), "| Enter", r.get("enter"), "ms", "SAVED" if r.get("saved") else "kept" if r.get("boxKept") else "?", "msg:", r.get("msg"), "| focus", r.get("focAfter"), "| own:", r.get("ownMs"), r.get("ownBtns"), (r.get("ownStatus") or "")[-40:], r.get("ownSaved"), "| woff", r.get("woff"), "nonGET", r.get("nonget"))
