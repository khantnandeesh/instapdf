import json,re,glob
fams={f['i']:f['n'] for f in json.load(open('lib/families.7224cafb.json'))}
ok=tot=0; bad=[]; q={}
for p in sorted(glob.glob("fx/chunks/c*.truth.json")):
    i=re.search(r'c(\d+)\.truth',p).group(1); truth=json.load(open(p)); rows=json.load(open(f"out/d2-c{i}.json"))
    m={}
    for r in rows:
        a,_,b=r.partition(" => "); m[re.sub(r'\W','',a).lower()]=b
    for ps,k in truth:
        fam=fams[k.split("_")[0]]; key=next((x for x in m if x.startswith(ps.lower())),None); got=m.get(key,"<no row>")
        g,_,qq=got.partition(" · "); q[qq]=q.get(qq,0)+1; tot+=1
        if g==fam: ok+=1
        else: bad.append((k,got))
print(f"true family first: {ok}/{tot} = {100*ok/tot:.1f}%", q); print("misses:", bad)
