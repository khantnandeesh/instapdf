cd "$(dirname "$0")"
node s3a.cjs > logs/s3a-d.log 2>&1; PHONE=1 node s3a.cjs > logs/s3a-p.log 2>&1
node s3c.cjs > logs/s3c-d.log 2>&1; PHONE=1 node s3c.cjs > logs/s3c-p.log 2>&1
node s3d.cjs > logs/s3d-d.log 2>&1; PHONE=1 node s3d.cjs > logs/s3d-p.log 2>&1
node s8.cjs > logs/s8-d.log 2>&1; PHONE=1 node s8.cjs > logs/s8-p.log 2>&1
