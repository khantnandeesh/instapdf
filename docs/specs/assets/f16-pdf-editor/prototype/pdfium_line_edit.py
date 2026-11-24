"""Prototype v2: style-run-preserving in-place line edit with PDFium.
Recognise lines from text objects, map every character to its source run (font, size, colour),
replace a substring, keep runs, reuse the embedded font when it has the glyphs, else substitute a
metric-compatible OFL font for that run only, then re-lay the line with real glyph advances."""
import sys, os, difflib, ctypes as C, pypdfium2 as pdfium, pypdfium2.raw as R
src,find,repl,out=sys.argv[1:5]
OFL={'carlito':'Carlito','calibri':'Carlito','caladea':'Caladea','cambria':'Caladea','arial':'LiberationSans','helvetica':'LiberationSans','times':'LiberationSerif','liberationserif':'LiberationSerif','liberationsans':'LiberationSans'}
FILES={'Carlito':'/usr/share/fonts/truetype/crosextra/Carlito-{}.ttf','Caladea':'/usr/share/fonts/truetype/crosextra/Caladea-{}.ttf',
 'LiberationSans':'/usr/share/fonts/truetype/liberation/LiberationSans-{}.ttf','LiberationSerif':'/usr/share/fonts/truetype/liberation/LiberationSerif-{}.ttf'}
pdf=pdfium.PdfDocument(src); page=pdf[0]; tp=page.get_textpage()
def txt(o):
    L=R.FPDFTextObj_GetText(o,tp,None,0); b=(C.c_ushort*L)(); R.FPDFTextObj_GetText(o,tp,b,L); return bytes(b).decode('utf-16-le').rstrip('\x00')
def fname(f):
    n=R.FPDFFont_GetBaseFontName(f,None,0); b=C.create_string_buffer(n); R.FPDFFont_GetBaseFontName(f,b,n); return b.value.decode()
def bounds(o):
    v=[C.c_float() for _ in range(4)]; R.FPDFPageObj_GetBounds(o,*[C.byref(x) for x in v]); return [x.value for x in v]
def color(o):
    v=[C.c_uint() for _ in range(4)]; R.FPDFPageObj_GetFillColor(o,*map(C.byref,v)); return [x.value for x in v]
objs=[]
for i in range(R.FPDFPage_CountObjects(page)):
    o=R.FPDFPage_GetObject(page,i)
    if R.FPDFPageObj_GetType(o)!=R.FPDF_PAGEOBJ_TEXT: continue
    m=R.FS_MATRIX(); R.FPDFPageObj_GetMatrix(o,C.byref(m)); s=C.c_float(); R.FPDFTextObj_GetFontSize(o,C.byref(s))
    objs.append(dict(o=o,t=txt(o),f=R.FPDFTextObj_GetFont(o),m=m,size=s.value,b=bounds(o),c=color(o)))
lines=[]
for ob in sorted(objs,key=lambda x:(-round(x['m'].f,1),x['m'].e)):
    for L in lines:
        if abs(L[0]['m'].f-ob['m'].f)<1.0: L.append(ob); break
    else: lines.append([ob])
def chars(L):  # list of (char, source object)
    out=[]
    for a,b in zip(L,L[1:]+[None]):
        for ch in a['t']:
            if not(ch==' ' and out and out[-1][0]==' '): out.append((ch,a))
        if b and out and out[-1][0]!=' ' and not b['t'].startswith(' ') and b['b'][0]-a['b'][2]>a['size']*a['m'].a*0.2: out.append((' ',a))
    return out
L=next(L for L in lines if find in ''.join(c for c,_ in chars(L)))
cs=chars(L); old=''.join(c for c,_ in cs); i0=old.index(find); new=old[:i0]+repl+old[i0+len(find):]
# style inheritance: inserted chars take the style of the first replaced char
newcs=cs[:i0]+[(ch,cs[i0][1]) for ch in repl]+cs[i0+len(find):]
print('LINE :',repr(old)); print('NEW  :',repr(new))
def has(f,ch):
    if ch in '  ': return True
    p=R.FPDFFont_GetGlyphPath(f,ord(ch),12.0); return bool(p) and R.FPDFGlyphPath_CountGlyphSegments(p)>0
def adv(f,ch,size):
    w=C.c_float(); R.FPDFFont_GetGlyphWidth(f,ord(ch),size,C.byref(w)); return w.value
subst={}
def font_for(ob,ch):
    f=ob['f']
    if has(f,ch): return f,'reuse'
    key=id(ob['f'])
    if key not in subst:
        base=fname(f).split('+')[-1]; fam,_,sty=base.partition('-'); fam=OFL.get(fam.lower().replace(' ',''),'LiberationSans')
        sty={'':'Regular','Roman':'Regular','Regular':'Regular','Bold':'Bold','Italic':'Italic','BoldItalic':'BoldItalic'}.get(sty,'Regular')
        data=open(FILES[fam].format(sty),'rb').read(); buf=(C.c_uint8*len(data)).from_buffer_copy(data)
        subst[key]=R.FPDFText_LoadFont(pdf,buf,len(data),R.FPDF_FONT_TRUETYPE,1); print('SUBST:',base,'->',fam+'-'+sty)
    return subst[key],'subst'
# build runs of (object-style, font)
runs=[]
for ch,ob in newcs:
    f,why=font_for(ob,ch)
    if runs and runs[-1]['ob'] is ob and runs[-1]['f']==f: runs[-1]['s']+=ch
    else: runs.append(dict(ob=ob,f=f,s=ch,why=why))
x=L[0]['m'].e; base_m=L[0]['m']
for ob in L: R.FPDFPage_RemoveObject(page,ob['o'])
for r in runs:
    ob=r['ob']; size=ob['size']; scale=ob['m'].a
    t=R.FPDFPageObj_CreateTextObj(pdf,r['f'],size)
    arr=(C.c_ushort*(len(r['s'])+1))(*[ord(c) for c in r['s']],0); R.FPDFText_SetText(t,arr)
    R.FPDFPageObj_SetFillColor(t,*ob['c'])
    m=R.FS_MATRIX(ob['m'].a,ob['m'].b,ob['m'].c,ob['m'].d,x,base_m.f); R.FPDFPageObj_SetMatrix(t,C.byref(m))
    R.FPDFPage_InsertObject(page,t)
    x+=sum(adv(r['f'],c,size) for c in r['s'])*scale
    print(f"RUN  : {r['s']!r:40} {fname(r['f'])} ({r['why']})")
R.FPDFPage_GenerateContent(page); pdf.save(out); print('SAVED:',out)
