# ink-centroid shift between the page's drawing and the opened box (red outline masked out)
import json, numpy as np
from PIL import Image
res=json.load(open('out/v298/res.json')); agg={}
for r in res:
    d=r['dsf']; B=np.asarray(Image.open(r['base']+'-before.png').convert('RGB')).astype(int); A=np.asarray(Image.open(r['base']+'-open.png').convert('RGB')).astype(int)
    m=int(6*d); B=B[:, m:-m]; A=A[:, m:-m]   # drop the outline's left/right edges
    b=255-B.mean(2); a=255-A.mean(2); a[(A[:,:,0]-A[:,:,1])>50]=0; b[b<40]=0; a[a<40]=0
    cy=lambda x:(x.sum(1)*np.arange(x.shape[0])).sum()/x.sum(); cx=lambda x:(x.sum(0)*np.arange(x.shape[1])).sum()/x.sum()
    k=(('390' if r['phone'] else '1280'), d, r['text'][:24]); agg.setdefault(k,[]).append((round((cy(a)-cy(b))/d,2), round((cx(a)-cx(b))/d,2), r['geo']['face']))
for k,v in agg.items(): print(k[0], 'x%d'%k[1], repr(k[2]).ljust(28), 'dy css px', [x[0] for x in v], 'dx', [x[1] for x in v], v[0][2])
