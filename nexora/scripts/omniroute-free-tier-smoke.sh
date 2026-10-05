#!/usr/bin/env bash
set -euo pipefail

ROOTFS="nexora/rootfs"
ARCHIVE="nexora/debian/debian-12-generic-amd64.tar.xz"
PERSIST_IMG="nexora/persistent-workspace.ext4"

test -f "$ARCHIVE"
sudo apt-get update
sudo apt-get install -y debootstrap rsync e2fsprogs
sudo bash nexora/scripts/build-rootfs.sh
echo "=== Verify NEXORA helper payload ==="
sudo chroot "$ROOTFS" /usr/local/bin/node --version
sudo chroot "$ROOTFS" /usr/bin/ls -l /usr/local/bin/nexora-omniroute-install.sh /usr/local/bin/nexora-omniroute-env.sh /usr/local/bin/nexora-persistence-test.sh
sudo chroot "$ROOTFS" /usr/bin/bash -lc '
set -u
for helper in nexora-omniroute-install.sh nexora-omniroute-env.sh nexora-persistence-test.sh; do
  path="/usr/local/bin/$helper"
  echo "NEXORA_HELPER_CHECK=$helper"
  test -f "$path" || { echo "NEXORA_HELPER_MISSING=$path"; exit 1; }
  /bin/bash -n "$path" || { echo "NEXORA_HELPER_BASH_SYNTAX_FAILED=$path"; /bin/bash -n "$path"; exit 1; }
  echo "NEXORA_HELPER_SYNTAX_OK=$path"
done
'

echo "=== Prepare NEXORA persistent workspace image (8G for OmniRoute release build) ==="
sudo truncate -s 4G "$PERSIST_IMG"
ls -lh "$PERSIST_IMG"
sudo mkfs.ext4 -F -q "$PERSIST_IMG"
sudo mkdir -p "$ROOTFS/persist"
echo "NEXORA_PERSIST_MOUNT_ATTEMPT"
if ! sudo mount -o loop "$PERSIST_IMG" "$ROOTFS/persist"; then
  echo "NEXORA_PERSIST_MOUNT_FAILED"
  sudo losetup -a || true
  mount | tail -n 30 || true
  sudo dmesg | tail -n 30 || true
  exit 1
fi
echo "NEXORA_PERSIST_MOUNT_OK"
sudo mountpoint "$ROOTFS/persist"
sudo df -PT "$ROOTFS/persist"
# Next.js/Node process.memoryUsage() requires /proc/self/stat. The NEXORA
# build is performed inside a chroot, so mount proc explicitly for the build
# and unmount it during cleanup. This keeps the fix inside NEXORA/GitHub CI
# and does not require Termux or Android host changes.
echo "NEXORA_PROC_MOUNT_ATTEMPT"
sudo mount -t proc proc "$ROOTFS/proc"
echo "NEXORA_PROC_MOUNT_OK"
trap 'sudo umount "$ROOTFS/proc" 2>/dev/null || true; sudo umount "$ROOTFS/persist" 2>/dev/null || true' EXIT

sudo chroot "$ROOTFS" /usr/local/bin/nexora-persistence-test.sh
sudo chroot "$ROOTFS" test -f /persist/debian-workspace/source/omniroute/package.json

sudo chroot "$ROOTFS" /usr/local/bin/nexora-omniroute-install.sh
sudo chroot "$ROOTFS" /usr/local/bin/nexora-omniroute-env.sh
sudo chroot "$ROOTFS" test -x /persist/debian-workspace/software/omniroute/node_modules/.bin/omniroute
sudo chroot "$ROOTFS" test -f /persist/debian-workspace/data/omniroute/server.env

sudo chroot "$ROOTFS" /usr/bin/bash -lc 'set -euo pipefail
set -a
. /persist/debian-workspace/data/omniroute/server.env
set +a
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
printf '%s' "$INITIAL_PASSWORD" | /usr/bin/python3 -c "import json,sys; print(json.dumps({'password':sys.stdin.read()}))" > /tmp/omniroute-login-payload.json
/usr/bin/curl -fsS --max-time 30 -c /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/auth/login -H "Content-Type: application/json" --data-binary @/tmp/omniroute-login-payload.json -o /tmp/omniroute-login.json
/usr/bin/python3 -c "import json; x=json.load(open('/tmp/omniroute-login.json')); assert x.get('success') is True, x"
test -s /tmp/omniroute-cookie
/usr/bin/curl -fsS --max-time 30 -b /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/keys -H "Content-Type: application/json" --data '{"name":"nexora-free-tier-ci","scopes":["chat"]}' -o /tmp/omniroute-key.json
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
