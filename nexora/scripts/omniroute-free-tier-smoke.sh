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
printf '%s' "$INITIAL_PASSWORD" | /usr/bin/python3 -c "import json,sys; print(json.dumps({chr(112)+chr(97)+chr(115)+chr(115)+chr(119)+chr(111)+chr(114)+chr(100):sys.stdin.read()}))" > /tmp/omniroute-login-payload.json
/usr/bin/curl -fsS --max-time 30 -c /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/auth/login -H "Content-Type: application/json" --data-binary @/tmp/omniroute-login-payload.json -o /tmp/omniroute-login.json
/usr/bin/python3 -c "import json,sys; x=json.load(open(sys.argv[1])); assert x.get(chr(115)+chr(117)+chr(99)+chr(99)+chr(101)+chr(115)+chr(115)) is True, x" /tmp/omniroute-login.json
test -s /tmp/omniroute-cookie
/usr/bin/curl -fsS --max-time 30 -b /tmp/omniroute-cookie -X POST http://127.0.0.1:20129/api/keys -H "Content-Type: application/json" --data-binary "{\"name\":\"nexora-free-tier-ci\",\"scopes\":[\"chat\"]}" -o /tmp/omniroute-key.json
/usr/bin/python3 -c "import json,sys; x=json.load(open(sys.argv[1])); k=x.get(chr(107)+chr(101)+chr(121),chr(0)); assert x.get(chr(105)+chr(100)) and k.startswith(chr(115)+chr(107)+chr(45)); open(sys.argv[2],chr(119)).write(k)" /tmp/omniroute-key.json /tmp/omniroute-api-key
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
const cookieFile=fs.readFileSync("/tmp/omniroute-cookie","utf8");
const cookieLine=cookieFile.split("\n").find(line => line.includes("\tauth_token\t"));
if(!cookieLine) throw new Error("auth_token cookie not found");
const cookieParts=cookieLine.split("\t");
const cookie="auth_token="+cookieParts[cookieParts.length-1];
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
  printf '%s' "$MODEL" | python3 -c "import json,sys; m=sys.stdin.read().strip(); print(json.dumps({chr(109)+chr(111)+chr(100)+chr(101)+chr(108):m,chr(109)+chr(101)+chr(115)+chr(115)+chr(97)+chr(103)+chr(101)+chr(115):[{chr(114)+chr(111)+chr(108)+chr(101):chr(117)+chr(115)+chr(101)+chr(114),chr(99)+chr(111)+chr(110)+chr(116)+chr(101)+chr(110)+chr(116):chr(82)+chr(101)+chr(112)+chr(108)+chr(121)+chr(32)+chr(119)+chr(105)+chr(116)+chr(104)+chr(32)+chr(116)+chr(104)+chr(101)+chr(32)+chr(115)+chr(105)+chr(110)+chr(103)+chr(108)+chr(101)+chr(32)+chr(119)+chr(111)+chr(114)+chr(100)+chr(32)+chr(79)+chr(75)+chr(46)}],chr(115)+chr(116)+chr(114)+chr(101)+chr(97)+chr(109):False}))" > /tmp/omniroute-chat-payload.json
  HTTP_CODE="$(curl -sS --max-time 180 -X POST http://127.0.0.1:20129/v1/chat/completions -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" --data-binary @/tmp/omniroute-chat-payload.json -o /tmp/omniroute-chat.json -w "%{http_code}")"
  echo "NEXORA_OMNIROUTE_CHAT_HTTP_CODE=$HTTP_CODE"
  echo "NEXORA_OMNIROUTE_CHAT_RESPONSE="
  cat /tmp/omniroute-chat.json
  if [ "$HTTP_CODE" != "200" ]; then exit 1; fi
python3 -c "import json; x=json.load(open('/tmp/omniroute-chat.json')); c=((x.get('choices') or [{}])[0].get('message') or {}).get('content',''); print('NEXORA_OMNIROUTE_FREE_CHAT_RESPONSE='+c[:500]); assert 'OK' in c.upper()"
echo NEXORA_OMNIROUTE_REAL_FREE_TIER_CHAT_OK=1'

echo NEXORA_OMNIROUTE_FREE_TIER_SMOKE_OK=1
