import json,subprocess,os,sys
sys.path.insert(0,"pylib")
from fontTools.ttLib import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
B="https://web-staging-qzq5fa2g7q-uc.a.run.app/fonts/lib/"
fams={x['i']:x for x in json.load(open('lib/families.json'))}
want="roboto open-sans lato montserrat oswald source-sans-3 raleway pt-sans merriweather noto-sans noto-serif playfair-display lora nunito ubuntu rubik work-sans fira-sans inter poppins quicksand karla libre-baskerville crimson-text eb-garamond bitter arvo cabin dosis josefin-sans inconsolata source-code-pro roboto-mono courier-prime ibm-plex-sans ibm-plex-serif ibm-plex-mono dm-sans manrope space-grotesk barlow mulish titillium-web pt-serif zilla-slab archivo tinos arimo cousine carlito caladea gelasio selawik".split()
faces=[]
for f in want:
    if f not in fams: print("not in lib:",f); continue
    o=f"lib/fam/{f}.json"
    if not os.path.exists(o): subprocess.run(["curl","-s","-o",o,B+f"families/{f}.{fams[f]['m']}.json"])
    d=json.load(open(o))
    for face in ("400-normal","700-normal","400-italic"):
        if face not in d['faces']: continue
        for fl in d['faces'][face]['files']:
            n=fl['file']
            if "/latin-"+face in n:
                out=f"lib/w284/{f}_{face}.woff"
                if not os.path.exists(out): subprocess.run(["curl","-s","-o",out,B+"fonts/"+n])
                faces.append((f,face,out))
print(len(faces),"faces")
TEXT="The quick brown fox jumps over the lazy dog 0123456789"; N=16; ok=[]
for f,face,w in faces:
    try:
        t=TTFont(w)
        if "glyf" not in t: print("skip CFF",f,face); continue
        ok.append((f,face,w))
    except Exception as e: print("skip",f,face,e)
for ci in range(0,len(ok),N):
    chunk=ok[ci:ci+N]; pdf=f"fx/chunks/c{ci//N}.pdf"; c=canvas.Canvas(pdf,pagesize=(595,842)); y=800; truth=[]
    for j,(f,face,w) in enumerate(chunk):
        ps=f"EvalC{ci//N}N{j:02d}"; t=TTFont(w); t.flavor=None
        for rec in t["name"].names:
            if rec.nameID in (1,4,16): rec.string=ps
            if rec.nameID in (2,17): rec.string="Regular"
            if rec.nameID==6: rec.string=ps
        t["OS/2"].usWeightClass=400; t["OS/2"].fsSelection=0x40; t["head"].macStyle=0; t["post"].italicAngle=0
        tt=f"fx/chunks/{ps}.ttf"; t.save(tt)
        pdfmetrics.registerFont(RLFont(ps,tt)); c.setFont(ps,12); c.drawString(40,y,f"{j:02d} {TEXT}"); y-=46; truth.append((ps,f+"_"+face))
    c.save(); json.dump(truth,open(pdf[:-4]+".truth.json","w"))
print(len(ok),"faces in",(len(ok)+N-1)//N,"PDFs")
