import sys,json,re
for l in open(sys.argv[1]):
    m=re.match(r'(\S+) (\S+) (\S+ )?## (.*?) (\{.*)',l)
    if not m: print(l[:int(sys.argv[2]) if len(sys.argv)>2 else 400].rstrip()); continue
    s=json.loads(m.group(5)); print((m.group(3) or '')+m.group(4),'| box',s['box'] and (s['box']['text'][-14:],s['box']['focused']),'| notice',s['notice'] and (s['notice']['text'][:230], s['notice']['btns']),'| hint',s['hint'] and (s['hint']['text'][:70], s['hint']['r']),'| lines',[x[-18:] for x in s['lines'][1:4]],'| undo',s['undo'],'| focus',s['focus'][:30])
