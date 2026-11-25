cd "$(dirname "$0")"
for i in 1 2 3; do CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npx -y lighthouse@12 https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf --form-factor=mobile --quiet --output=json --output-path=out/lh-$i.json --chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY" > logs/lh-$i.log 2>&1; done
