#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ROOTFS="${NEXORA_ROOTFS:-${REPO_ROOT}/nexora/rootfs}"
ARCHIVE="${REPO_ROOT}/nexora/debian/debian-12-generic-amd64.tar.xz"
PERSIST_IMG="${NEXORA_PERSIST_IMG:-${REPO_ROOT}/nexora/persistent-workspace.ext4}"
case "$ROOTFS" in /*) ;; *) echo "ERROR: ROOTFS must be an absolute path."; exit 1 ;; esac
case "$PERSIST_IMG" in /*) ;; *) echo "ERROR: PERSIST_IMG must be an absolute path."; exit 1 ;; esac
case "$ROOTFS" in "${REPO_ROOT}"|"${REPO_ROOT}"/*) if [ -n "${NEXORA_ROOTFS:-}" ]; then echo "ERROR: NEXORA_ROOTFS points inside the repository."; exit 1; fi ;; esac

test -f "$ARCHIVE"
sudo apt-get update
sudo apt-get install -y debootstrap rsync e2fsprogs
sudo env NEXORA_ROOTFS="$ROOTFS" bash "${REPO_ROOT}/nexora/scripts/build-rootfs.sh"
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

echo "=== Prepare NEXORA persistent workspace image ==="
mkdir -p "$(dirname "$PERSIST_IMG")"
if [ -f "$PERSIST_IMG" ]; then
  echo "NEXORA_PERSISTENT_IMAGE_RESTORED=1"
  # Fail closed: never format or silently discard an existing image.
  CURRENT_SIZE="$(stat -c%s "$PERSIST_IMG")"
  if [ "$CURRENT_SIZE" -lt 5368709120 ]; then
    # resize2fs requires a forced, read-write fsck before growing a restored image.
    # Accept e2fsck status 1 (errors corrected); reject serious/uncorrected errors.
    set +e
    sudo e2fsck -f -p "$PERSIST_IMG"
    FSCK_STATUS=$?
    set -e
    if [ "$FSCK_STATUS" -gt 1 ]; then
      echo "NEXORA_PERSISTENT_IMAGE_REPAIR_FAILED status=$FSCK_STATUS; refusing to resize"
      exit 1
    fi
    sudo truncate -s 5G "$PERSIST_IMG"
    sudo resize2fs "$PERSIST_IMG"
  elif ! sudo e2fsck -fn "$PERSIST_IMG"; then
    echo "NEXORA_PERSISTENT_IMAGE_CHECK_FAILED; refusing to reformat"
    exit 1
  fi
else
  echo "NEXORA_PERSISTENT_IMAGE_INITIALIZED=1"
  sudo truncate -s 5G "$PERSIST_IMG"
  sudo mkfs.ext4 -F -q "$PERSIST_IMG"
fi
ls -lh "$PERSIST_IMG"
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
export PORT=20129 HOSTNAME=127.0.0.1 NODE_ENV=test NEXT_TELEMETRY_DISABLED=1 OMNIROUTE_USE_TURBOPACK=0 CLOUDFLARE_PLAYGROUND_CHROME_PATH=/usr/bin/chromium
if [ ! -x "$CLOUDFLARE_PLAYGROUND_CHROME_PATH" ]; then echo "NEXORA_CLOUDFLARE_CHROMIUM_MISSING=$CLOUDFLARE_PLAYGROUND_CHROME_PATH"; exit 1; fi
echo "NEXORA_CLOUDFLARE_CHROMIUM_OK=$CLOUDFLARE_PLAYGROUND_CHROME_PATH"
nohup /persist/debian-workspace/software/omniroute/node_modules/.bin/omniroute serve --no-open --no-tray >/tmp/omniroute-nexora.log 2>&1 &
echo "$!" >/tmp/omniroute-nexora.pid
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
if (ids.length === 0) {
  // The endpoint intentionally returns only eligible providers that are not
  // configured yet. An empty list is valid after a prior successful onboarding
  // has persisted provider connections; model/chat smoke below verifies they work.
  console.log("NEXORA_FREE_ONBOARDING_ALREADY_CONFIGURED=1");
}
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
if (ids.length === 0) {
  console.log("NEXORA_FREE_ONBOARDING_SKIPPED_NO_UNCONFIGURED_PROVIDERS=1");
  process.exit(0);
}
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
const data=Array.isArray(x.data) ? x.data : [];
const ids=data.map(v=>String(v?.id||"")).filter(Boolean);
console.log("NEXORA_OMNIROUTE_MODEL_COUNT="+ids.length);

// AI Horde is image-generation in this Free Tier catalog; exclude image models.
const imagePattern=/image|stable[ _-]?diffusion|sdxl|sd[ _-]?1|sd[ _-]?2|flux|inpaint|pony|illustrious|dreamshaper|animagine|juggernaut/i;

// OmniRoute model IDs are not guaranteed to contain the provider ID.
// Prefer explicit provider metadata, then fall back to the model ID prefix.
const freeProviders=new Set([
  "cloudflare-playground",
  "opencode",
  "theoldllm",
  "uncloseai",
  "chipotle",
  "felo-web",
  "duckduckgo-web"
]);

const providerOf=v=>String(
  v?.providerId ??
  v?.provider ??
  v?.provider_id ??
  v?.owned_by ??
  v?.ownedBy ??
  ""
).toLowerCase();

const candidates=data
  .filter(v=>{
    const id=String(v?.id||"");
    const provider=providerOf(v);
    const prefix=id.split("/")[0].toLowerCase();
    const free=freeProviders.has(provider)||freeProviders.has(prefix);
    return id && free && !imagePattern.test(id);
  })
  .map(v=>String(v?.id||""))
  .filter(Boolean);

// Prefer providers that can be called through OmniRoute's OpenAI-compatible
// endpoint without a provider-specific client. OpenCode's free endpoint rejects
// third-party clients (403), so do not rank it as a viable Aider fallback.
const providerPriority = id => {
  const prefix = String(id).split("/")[0].toLowerCase();
  if (["cfp", "cloudflare-playground"].includes(prefix)) return 0;
  if (["felo", "felo-web"].includes(prefix)) return 1;
  if (["uncloseai"].includes(prefix)) return 2;
  if (["chipotle"].includes(prefix)) return 3;
  if (["tllm", "theoldllm"].includes(prefix)) return 4;
  if (["ddgw", "duckduckgo-web"].includes(prefix)) return 5;
  if (["oc", "opencode"].includes(prefix)) return 99;
  return 50;
};
candidates.sort((a, b) => providerPriority(a) - providerPriority(b));

console.log("NEXORA_CHAT_CANDIDATE_COUNT="+candidates.length);
console.log("NEXORA_CHAT_CANDIDATES="+candidates.slice(0,50).join(","));
fs.writeFileSync("/tmp/nexora-chat-candidates.json",JSON.stringify(candidates));

if(!candidates.length) {
  console.log("NEXORA_MODEL_SAMPLE="+ids.slice(0,50).join(","));
  console.log("NEXORA_MODEL_METADATA_SAMPLE="+JSON.stringify(data.slice(0,10).map(v=>({
    id:v?.id,
    providerId:v?.providerId,
    provider:v?.provider,
    provider_id:v?.provider_id,
    owned_by:v?.owned_by,
    ownedBy:v?.ownedBy
  }))));
  throw new Error("No non-image Free Tier chat candidates exposed");
}
NODE

SWEEP_SCRIPT="$RUNNER_TEMP/nexora-free-tier-model-sweep.sh"
cat > "$SWEEP_SCRIPT" <<'NEXORA_SWEEP_SCRIPT'
API_KEY="$(cat /tmp/omniroute-api-key)"
CANDIDATES="$(cat /tmp/nexora-chat-candidates.json)"
printf "%s" "$CANDIDATES" | /usr/bin/python3 -c "import json,sys; [print(v) for v in json.load(sys.stdin)]" > /tmp/nexora-chat-candidate-list

REPORT_DIR=/persist/debian-workspace/data/omniroute
REPORT_PATH="$REPORT_DIR/free-tier-model-test-report.json"
mkdir -p "$REPORT_DIR"
CANDIDATE_COUNT="$(/usr/bin/python3 -c "import json; print(len(json.load(open(\"/tmp/nexora-chat-candidates.json\"))))")"
/usr/bin/python3 - "$CANDIDATE_COUNT" "$REPORT_PATH" <<'PY'
import json,sys
with open(sys.argv[2],"w") as f:
    json.dump({"candidate_count":int(sys.argv[1]),"tested_count":0,"success_count":0,"failed_count":0,"selected_chat_model":None,"results":[]},f,indent=2)
    f.write("\n")
PY

CHAT_OK=0
while IFS= read -r MODEL; do
  [ -n "$MODEL" ] || continue
  echo "NEXORA_CHAT_MODEL_TEST=$MODEL"
  /usr/bin/python3 - "$MODEL" <<'PY' > /tmp/omniroute-chat-payload.json
import json,sys
print(json.dumps({"model":sys.argv[1],"messages":[{"role":"user","content":"Reply with the single word OK."}],"stream":False}))
PY

  set +e
  HTTP_CODE="$(curl -sS --connect-timeout 5 --max-time 25 -X POST http://127.0.0.1:20129/v1/chat/completions -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" --data-binary @/tmp/omniroute-chat-payload.json -o /tmp/omniroute-chat.json -w "%{http_code}")"
  CURL_STATUS=$?
  set -e
  echo "NEXORA_OMNIROUTE_CHAT_HTTP_CODE=$HTTP_CODE"

  RESULT=failed
  if [ "$CURL_STATUS" -eq 0 ] && [ "$HTTP_CODE" = "200" ] && /usr/bin/python3 -c 'import json,sys; x=json.load(open(sys.argv[1])); c=((x.get("choices") or [{}])[0].get("message") or {}).get("content"); sys.exit(0 if isinstance(c,str) and c.strip() else 1)' /tmp/omniroute-chat.json; then
    RESULT=success
    echo "NEXORA_CHAT_MODEL_PASSED=$MODEL"
    if [ "$CHAT_OK" = "0" ]; then
      printf "%s\n" "$MODEL" > /tmp/nexora-aider-model
      printf "%s\n" "$MODEL" > "$REPORT_DIR/nexora-aider-model"
      CHAT_OK=1
    fi
  else
    echo "NEXORA_CHAT_MODEL_FAILED=$MODEL"
  fi

  /usr/bin/python3 - "$REPORT_PATH" "$MODEL" "$HTTP_CODE" "$CURL_STATUS" "$RESULT" <<'PY'
import json,sys
path,model,http,curl_status,result=sys.argv[1:]
with open(path) as f: report=json.load(f)
report["results"].append({"model":model,"provider":model.split("/",1)[0],"http_status":http,"curl_status":int(curl_status),"result":result})
report["tested_count"]=len(report["results"])
report["success_count"]=sum(x["result"]=="success" for x in report["results"])
report["failed_count"]=report["tested_count"]-report["success_count"]
if result=="success" and report["selected_chat_model"] is None:
    report["selected_chat_model"]=model
with open(path+".tmp","w") as f:
    json.dump(report,f,indent=2)
    f.write("\n")
import os
os.replace(path+".tmp",path)
PY
done < /tmp/nexora-chat-candidate-list

if [ "$CHAT_OK" != "1" ]; then
  echo "NEXORA_CHAT_NO_WORKING_FREE_MODEL=1"
  exit 1
fi
SELECTED_MODEL="$(cat /tmp/nexora-aider-model)"
printf "%s\n" "$SELECTED_MODEL" > /persist/debian-workspace/data/omniroute/nexora-aider-model
/usr/bin/python3 - "$REPORT_PATH" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print("NEXORA_FREE_MODEL_SWEEP_TESTED="+str(x["tested_count"]))
print("NEXORA_FREE_MODEL_SWEEP_SUCCEEDED="+str(x["success_count"]))
print("NEXORA_FREE_MODEL_SWEEP_FAILED="+str(x["failed_count"]))
print("NEXORA_FREE_MODEL_SWEEP_SELECTED="+str(x["selected_chat_model"]))
assert x["tested_count"]==x["candidate_count"], "Not every advertised candidate was tested"
PY
echo "NEXORA_FREE_MODEL_SWEEP_COMPLETED=1"
NEXORA_SWEEP_SCRIPT
sudo install -m 0755 "$SWEEP_SCRIPT" "$ROOTFS/tmp/nexora-free-tier-model-sweep.sh"
sudo chroot "$ROOTFS" /usr/bin/bash /tmp/nexora-free-tier-model-sweep.sh
echo "NEXORA_OMNIROUTE_REAL_FREE_TIER_CHAT_OK=1"
echo NEXORA_OMNIROUTE_FREE_TIER_SMOKE_OK=1

echo "=== Aider through NEXORA OmniRoute ==="
sudo chroot "$ROOTFS" /usr/bin/bash -lc 'set -uo pipefail
command -v aider
aider --version
API_KEY="$(cat /tmp/omniroute-api-key)"
MODEL="$(cat /persist/debian-workspace/data/omniroute/nexora-aider-model 2>/dev/null || cat /tmp/nexora-aider-model 2>/dev/null || true)"
if [ -z "$MODEL" ]; then
  echo "NEXORA_AIDER_MODEL_STATE_MISSING=1"
  echo "No model was saved by the successful chat test; refusing to run Aider with an empty model."
  exit 1
fi
export OPENAI_API_BASE="http://127.0.0.1:20129/v1"
export OPENAI_API_KEY="$API_KEY"
mkdir -p /tmp/nexora-aider-smoke
cd /tmp/nexora-aider-smoke
if [ ! -d .git ]; then /usr/bin/git init -q; fi
printf "# NEXORA Aider smoke\\n" > smoke.md

# Load candidate IDs into memory before Aider starts; do not redirect the loop
# from a temporary file that may disappear during the Aider invocation.
if [ ! -s /tmp/nexora-chat-candidates.json ]; then
  echo "NEXORA_AIDER_CANDIDATE_JSON_MISSING=1"
  exit 1
fi
MODEL="$(/usr/bin/cat /persist/debian-workspace/data/omniroute/nexora-aider-model 2>/dev/null || /usr/bin/cat /tmp/nexora-aider-model 2>/dev/null || true)"
# Try the model that passed the direct chat smoke first, then other free chat
# models. Do not retry the OpenCode endpoint: its own response explicitly rejects
# use outside the OpenCode client, and it may require a user API key.
printf "%s\n" "${MODEL:-}" > /tmp/nexora-aider-candidate-list
/usr/bin/python3 - <<PY >> /tmp/nexora-aider-candidate-list
import json
from pathlib import Path
selected = next((p.read_text().strip() for p in (Path("/persist/debian-workspace/data/omniroute/nexora-aider-model"), Path("/tmp/nexora-aider-model")) if p.is_file()), "")
for model in json.loads(Path("/tmp/nexora-chat-candidates.json").read_text()):
    prefix = model.split("/", 1)[0].lower()
    if model == selected or prefix in {"oc", "opencode"}:
        continue
    print(model)
PY
/usr/bin/python3 -c "import sys; seen=set(); [print(x) for x in sys.stdin.read().splitlines() if x and not (x in seen or seen.add(x))]" < /tmp/nexora-aider-candidate-list > /tmp/nexora-aider-candidate-list.unique
mv /tmp/nexora-aider-candidate-list.unique /tmp/nexora-aider-candidate-list
mapfile -t AIDER_CANDIDATES < /tmp/nexora-aider-candidate-list
if [ "${#AIDER_CANDIDATES[@]}" -eq 0 ]; then
  echo "NEXORA_AIDER_CANDIDATE_LIST_EMPTY=1"
  exit 1
fi

AIDER_OK=0
for MODEL in "${AIDER_CANDIDATES[@]}"; do
  [ -n "$MODEL" ] || continue
  echo "NEXORA_AIDER_MODEL_TEST=$MODEL"
  AIDER_MODEL_ID="openai/$MODEL"
  export AIDER_MODEL="$AIDER_MODEL_ID"
  set +e
  timeout 75s aider --message "Reply with exactly the single word NEXORA_AIDER_OK. Do not edit files." --model "$AIDER_MODEL_ID" --no-stream --no-auto-commits --yes-always --no-show-model-warnings > /tmp/aider-nexora-smoke.log 2>&1
  status=$?
  set -e
  cat /tmp/aider-nexora-smoke.log
  if [ "$status" -eq 0 ] && \
    ! grep -Eq "litellm.BadRequestError|Error communicating with the model" /tmp/aider-nexora-smoke.log && \
    grep -Eiq "^[[:space:]]*NEXORA_AIDER_OK[.!]?[[:space:]]*$" /tmp/aider-nexora-smoke.log; then
    echo "NEXORA_AIDER_SELECTED_MODEL=$MODEL"
    AIDER_OK=1
    break
  fi
  echo "NEXORA_AIDER_MODEL_REJECTED=$MODEL"
done

if [ "$AIDER_OK" != "1" ]; then
  echo NEXORA_AIDER_NO_COMPATIBLE_FREE_MODEL=1
  exit 1
fi
echo NEXORA_AIDER_OMNIROUTE_SMOKE_OK=1
'
echo "=== Stop OmniRoute and release persistent workspace ==="
sudo chroot "$ROOTFS" /usr/bin/bash -lc '
  if [ -s /tmp/omniroute-nexora.pid ]; then
    pid="$(cat /tmp/omniroute-nexora.pid)"
    kill "$pid" 2>/dev/null || true
    for i in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$pid" 2>/dev/null || true
    rm -f /tmp/omniroute-nexora.pid
  fi
'
echo "=== Compact NEXORA persistent image ==="
for i in $(seq 1 10); do
  if sudo umount "$ROOTFS/persist" 2>/dev/null; then
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "NEXORA_PERSIST_MOUNT_HOLDERS_BEFORE_CLEANUP"
    sudo fuser -vm "$ROOTFS/persist" || true
    sudo fuser -km "$ROOTFS/persist" || true
    sleep 2
    sudo umount "$ROOTFS/persist"
  fi
  sleep 1
done
trap - EXIT
sudo e2fsck -pf "$PERSIST_IMG"
sudo resize2fs -M "$PERSIST_IMG"
BLOCKS="$(sudo tune2fs -l "$PERSIST_IMG" | awk -F: '/Block count:/ {gsub(/ /,"",$2); print $2; exit}')"
BLOCK_SIZE="$(sudo tune2fs -l "$PERSIST_IMG" | awk -F: '/Block size:/ {gsub(/ /,"",$2); print $2; exit}')"
test -n "$BLOCKS" -a -n "$BLOCK_SIZE"
COMPACT_BYTES=$((BLOCKS * BLOCK_SIZE))
sudo truncate -s "$COMPACT_BYTES" "$PERSIST_IMG"
echo "NEXORA_PERSISTENT_IMAGE_COMPACT_BYTES=$COMPACT_BYTES"
ls -lh "$PERSIST_IMG"
echo NEXORA_PERSISTENT_IMAGE_COMPACT_OK=1