#!/usr/bin/env bash
set -euo pipefail

ROOTFS="nexora/rootfs"
ARCHIVE="nexora/debian/debian-12-generic-amd64.tar.xz"
PERSIST_IMG="nexora/persistent-workspace.ext4"

test -f "$ARCHIVE"
sudo apt-get update
sudo apt-get install -y debootstrap rsync e2fsprogs
sudo bash nexora/scripts/build-rootfs.sh
sudo chroot "$ROOTFS" /usr/local/bin/node --version
sudo chroot "$ROOTFS" test -x /usr/local/bin/nexora-omniroute-install.sh
sudo chroot "$ROOTFS" test -x /usr/local/bin/nexora-omniroute-env.sh
sudo chroot "$ROOTFS" test -x /usr/local/bin/nexora-persistence-test.sh

sudo truncate -s 4G "$PERSIST_IMG"
sudo mkfs.ext4 -F -q "$PERSIST_IMG"
sudo mkdir -p "$ROOTFS/persist"
sudo mount -o loop "$PERSIST_IMG" "$ROOTFS/persist"
trap 'sudo umount "$ROOTFS/persist" 2>/dev/null || true' EXIT

sudo chroot "$ROOTFS" /usr/local/bin/nexora-persistence-test.sh
sudo chroot "$ROOTFS" test -f /persist/debian-workspace/source/omniroute/package.json

sudo chroot "$ROOTFS" /usr/local/bin/nexora-omniroute-install.sh
sudo chroot "$ROOTFS" /usr/local/bin/nexora-omniroute-env.sh
sudo chroot "$ROOTFS" test -x /persist/debian-workspace/software/omniroute/node_modules/.bin/omniroute
sudo chroot "$ROOTFS" test -f /persist/debian-workspace/data/omniroute/server.env

sudo chroot "$ROOTFS" /usr/bin/bash -lc 'set -euo pipefail
. /persist/debian-workspace/data/omniroute/server.env
export PORT=20129 HOSTNAME=127.0.0.1 NODE_ENV=test NEXT_TELEMETRY_DISABLED=1 OMNIROUTE_USE_TURBOPACK=0
nohup /persist/debian-workspace/software/omniroute/node_modules/.bin/omniroute serve --no-open --no-tray >/tmp/omniroute-nexora.log 2>&1 &
for i in $(seq 1 120); do
  if /usr/bin/curl -fsS --max-time 2 http://127.0.0.1:20129/healthz >/dev/null 2>&1 || /usr/bin/curl -fsS --max-time 2 http://127.0.0.1:20129/api/health >/dev/null 2>&1; then
    echo OMNIROUTE_NEXORA_DEBIAN_HEALTH_OK
    break
  fi
  if [ "$i" -eq 120 ]; then cat /tmp/omniroute-nexora.log || true; exit 1; fi
  sleep 2
done
/usr/bin/curl -fsS --max-time 30 -c /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/auth/login -H "Content-Type: application/json" --data "{"password":"$INITIAL_PASSWORD"}" -o /tmp/omniroute-login.json
/usr/bin/python3 -c "import json; x=json.load(open('/tmp/omniroute-login.json')); assert x.get('success') is True, x"
test -s /tmp/omniroute-cookie
/usr/bin/curl -fsS --max-time 30 -b /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/keys -H "Content-Type: application/json" --data "{"name":"nexora-free-tier-ci","scopes":["chat"]}" -o /tmp/omniroute-key.json
/usr/bin/python3 -c "import json; x=json.load(open('/tmp/omniroute-key.json')); k=x.get('key',''); assert x.get('id') and k.startswith('sk-'); open('/tmp/omniroute-api-key','w').write(k)"
chmod 600 /tmp/omniroute-api-key
echo NEXORA_OMNIROUTE_PERSISTENT_INSTALL_OK=1'

sudo chroot "$ROOTFS" /usr/bin/curl -fsS --max-time 30 -b /tmp/omniroute-cookie http://127.0.0.1:20129/api/providers/free-onboarding -o /tmp/omniroute-free.json

sudo chroot "$ROOTFS" /usr/local/bin/node --input-type=module <<'NODE'
import fs from "node:fs";
const x = JSON.parse(fs.readFileSync("/tmp/omniroute-free.json","utf8"));
const providers = Array.isArray(x.providers) ? x.providers : [];
const ids = providers.map(p => typeof p === "string" ? p : p.id).filter(Boolean);
console.log("NEXORA_FREE_ONBOARDING_IDS=" + ids.join(","));
if (!ids.includes("aihorde")) throw new Error("AI Horde is not present in OmniRoute Free Tier catalog");
fs.writeFileSync("/tmp/omniroute-free-ids.json", JSON.stringify(ids));
NODE

sudo chroot "$ROOTFS" /usr/local/bin/node --input-type=module <<'NODE'
import fs from "node:fs";
const base="http://127.0.0.1:20129";
const cookie=fs.readFileSync("/tmp/omniroute-cookie","utf8");
const ids=JSON.parse(fs.readFileSync("/tmp/omniroute-free-ids.json","utf8"));
const res=await fetch(base+"/api/providers/free-onboarding",{method:"POST",headers:{"Content-Type":"application/json","Cookie":cookie},body:JSON.stringify({providerIds:ids,confirmed:true})});
const body=await res.text();
if(!res.ok) throw new Error("Free onboarding failed: "+res.status+" "+body.slice(0,800));
const x=JSON.parse(body);
if(!Array.isArray(x.results)) throw new Error("Missing onboarding results");
const failed=x.results.filter(r=>r.status==="failed");
console.log("NEXORA_FREE_ONBOARDING_RESULT="+body.slice(0,1500));
if(failed.length) throw new Error("Provider activation failed: "+failed.map(r=>r.providerId||"unknown").join(","));
NODE

sudo chroot "$ROOTFS" /usr/bin/bash -lc 'API_KEY="$(cat /tmp/omniroute-api-key)"; curl -fsS --max-time 30 http://127.0.0.1:20129/v1/models -H "Authorization: Bearer $API_KEY" -o /tmp/omniroute-models.json'
sudo chroot "$ROOTFS" /usr/local/bin/node --input-type=module <<'NODE'
import fs from "node:fs";
const x=JSON.parse(fs.readFileSync("/tmp/omniroute-models.json","utf8"));
const ids=(x.data||[]).map(x=>String(x.id));
console.log("NEXORA_OMNIROUTE_MODEL_COUNT="+ids.length);
const model=ids.find(id=>id.toLowerCase().includes("aihorde")&&!/image/i.test(id));
if(!model) throw new Error("No AI Horde chat model exposed");
fs.writeFileSync("/tmp/nexora-aider-model",model+"\n");
console.log("NEXORA_AIHORDE_CHAT_MODEL="+model);
NODE

sudo chroot "$ROOTFS" /usr/bin/bash -lc 'set -euo pipefail
API_KEY="$(cat /tmp/omniroute-api-key)"
MODEL="$(cat /tmp/nexora-aider-model)"
curl -fsS --max-time 180 -X POST http://127.0.0.1:20129/v1/chat/completions -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" --data "$(MODEL="$MODEL" python3 -c "import json,os; print(json.dumps({"model":os.environ["MODEL"].strip(),"messages":[{"role":"user","content":"Reply with the single word OK."}],"stream":False}))")" -o /tmp/omniroute-chat.json
python3 -c "import json; x=json.load(open('/tmp/omniroute-chat.json')); c=((x.get('choices') or [{}])[0].get('message') or {}).get('content',''); print('NEXORA_OMNIROUTE_FREE_CHAT_RESPONSE='+c[:500]); assert 'OK' in c.upper()"
echo NEXORA_OMNIROUTE_REAL_FREE_TIER_CHAT_OK=1'

echo NEXORA_OMNIROUTE_FREE_TIER_SMOKE_OK=1


sudo chroot "$ROOTFS" /usr/bin/bash -lc 'set -euo pipefail
rm -rf /tmp/aider-nexora-free-tier-smoke
mkdir -p /tmp/aider-nexora-free-tier-smoke
cd /tmp/aider-nexora-free-tier-smoke
git init -q
git config user.email "ci@example.invalid"
git config user.name "Aider CI"
printf "# Aider smoke test\\n" > README.md
git add README.md
git commit -qm init
API_KEY="$(cat /tmp/omniroute-api-key)"
MODEL="$(cat /tmp/nexora-aider-model)"
export OPENAI_API_BASE="http://127.0.0.1:20129/v1"
export OPENAI_API_KEY="$API_KEY"
if ! python3.11 -c "import sys,os; sys.path.insert(0, "/opt/nexora/aider-site"); import aider.main; sys.argv=["aider","--model","openai/"+os.environ["MODEL"],"--no-stream","--no-check-model-accepts-settings","--no-show-model-warnings","--yes","--no-auto-commits","--message","Do not modify files. Reply with the single word OK."]; raise SystemExit(aider.main.main())" >/tmp/aider-nexora-smoke.log 2>&1; then
  echo AIDER_NEXORA_FREE_TIER_SMOKE_FAILED
  sed -n "1,200p" /tmp/aider-nexora-smoke.log
  exit 1
fi
grep -Eq "\\bOK\\b" /tmp/aider-nexora-smoke.log
echo AIDER_NEXORA_OMNIROUTE_FREE_TIER_OK=1
sed -n "1,100p" /tmp/aider-nexora-smoke.log'
echo NEXORA_OMNIROUTE_FREE_TIER_SMOKE_OK=1
