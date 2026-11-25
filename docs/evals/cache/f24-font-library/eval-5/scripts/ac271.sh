#!/bin/sh
# AC-271 / AC-275: notices page against the served family list; cache headers; uploads refused; CSP. Run from the work folder (writes lib/ and out/).
B=https://web-staging-qzq5fa2g7q-uc.a.run.app
curl -sS -m 60 $B/fonts/lib/manifest.json -o lib/manifest.json; FAM=$(python3 -c "import json;print(json.load(open('lib/manifest.json'))['families'])")
curl -sS -m 60 --compressed $B/fonts/lib/$FAM -o lib/families.json; sleep 1; curl -sS -m 120 --compressed $B/licenses -o out/licenses.html
python3 - <<'PY'
import json,re,html
f=json.load(open('lib/families.json')); h=open('out/licenses.html',encoding='utf8').read()
ids=set(re.findall(r'/fonts/lib/licences/([^"\'<>\s]+?)\.txt',h)); fam={x['i'] for x in f}
print('families served',len(fam),'licence links on page',len(ids),'page bytes',len(h.encode()))
print('families with no link',sorted(fam-ids)[:10],'links with no family',sorted(ids-fam)[:10])
t=html.unescape(re.sub(r'<[^>]+>',' ',h)); miss=[x['n'] for x in f if x['n'] not in t]; print('family names missing from page',len(miss),miss[:8])
m=re.search(r'Selawik[^<]{0,80}',t); print('selawik:',m and m.group(0)[:90])
PY
for u in fonts/lib/manifest.json fonts/lib/$FAM fonts/lib/licences/selawik.txt; do sleep 1; echo "$u: $(curl -sS -m 30 -D - -o /dev/null $B/$u | grep -i '^cache-control' | tr -d '\r')"; done
sleep 1; curl -sS -m 30 $B/fonts/lib/licences/selawik.txt | head -n 4 | cut -c1-160
sleep 1; echo "POST: $(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST --data-binary x $B/fonts/lib/manifest.json)  PUT: $(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X PUT --data-binary x $B/fonts/lib/x.bin)"
curl -sS -m 30 -D - -o /dev/null $B/edit-pdf | grep -i '^content-security' | tr ';' '\n' | grep -i "font-src\|connect-src\|form-action\|default-src\|img-src\|worker-src"
