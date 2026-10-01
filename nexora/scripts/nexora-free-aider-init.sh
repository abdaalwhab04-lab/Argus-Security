#!/bin/sh
set -eu
CONSOLE=/dev/console
log() { echo "$*" > "$CONSOLE"; }
PERSIST_ROOT="/persist/debian-workspace"
DATA_ROOT="${PERSIST_ROOT}/data/omniroute"
SOFTWARE_ROOT="${PERSIST_ROOT}/software"
AIDER_ROOT="${SOFTWARE_ROOT}/aider"
OMNI_ENV="${DATA_ROOT}/server.env"
OMNI_LOG="${DATA_ROOT}/server.log"
OMNI_URL="http://127.0.0.1:20128"
mkdir -p "${DATA_ROOT}" "${SOFTWARE_ROOT}" "${AIDER_ROOT}"
chmod 700 "${DATA_ROOT}" "${AIDER_ROOT}"
set -a
. "${OMNI_ENV}"
set +a
wait_for_health() {
  i=0
  while [ "$i" -lt 90 ]; do
    if curl -fsS "${OMNI_URL}/healthz" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}
log "NEXORA_OMNIROUTE_WAIT_START"
if ! wait_for_health; then
  log "NEXORA_OMNIROUTE_HEALTH_FAILED"
  tail -n 80 "${OMNI_LOG}" > "${CONSOLE}" 2>&1 || true
  exit 1
fi
log "NEXORA_OMNIROUTE_HEALTH_OK"
if [ ! -s "${DATA_ROOT}/aider-api-key" ]; then
  ADMIN_TOKEN="$(curl -fsS -X POST "${OMNI_URL}/api/cli/connect" -H 'Content-Type: application/json' --data "{\"password\":\"${INITIAL_PASSWORD}\",\"name\":\"nexora-bootstrap\",\"scope\":\"admin\"}" | jq -er '.token')"
  PROVIDER_IDS="$(curl -fsS "${OMNI_URL}/api/providers/free-onboarding" -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.providers[].id')"
  if [ -n "${PROVIDER_IDS}" ]; then
    PROVIDER_JSON="$(printf '%s\n' "${PROVIDER_IDS}" | jq -Rsc 'split("\n") | map(select(length > 0))')"
    curl -fsS -X POST "${OMNI_URL}/api/providers/free-onboarding" -H 'Content-Type: application/json' -H "Authorization: Bearer ${ADMIN_TOKEN}" --data "{\"providerIds\":${PROVIDER_JSON},\"confirmed\":true}" > "${DATA_ROOT}/free-provider-setup.json"
  else
    printf '%s\n' '{"providers":[],"results":[]}' > "${DATA_ROOT}/free-provider-setup.json"
  fi
  API_KEY="$(curl -fsS -X POST "${OMNI_URL}/api/keys" -H 'Content-Type: application/json' -H "Authorization: Bearer ${ADMIN_TOKEN}" --data '{"name":"aider","scopes":[]}' | jq -er '.key')"
  printf '%s\n' "${API_KEY}" > "${DATA_ROOT}/aider-api-key"
  chmod 600 "${DATA_ROOT}/aider-api-key"
  unset ADMIN_TOKEN API_KEY PROVIDER_IDS PROVIDER_JSON
  log "NEXORA_FREE_PROVIDERS_CONFIGURED"
else
  log "NEXORA_FREE_PROVIDERS_ALREADY_CONFIGURED"
fi
if [ ! -x "${AIDER_ROOT}/bin/aider" ]; then
  rm -rf "${AIDER_ROOT}"
  python3 -m venv "${AIDER_ROOT}"
  "${AIDER_ROOT}/bin/python" -m pip install --no-cache-dir aider-chat
fi
ln -sfn "${AIDER_ROOT}/bin/aider" /usr/local/bin/aider
AIDER_PROJECT="${PERSIST_ROOT}/source/omniroute"
mkdir -p "${AIDER_PROJECT}"
AIDER_KEY="$(cat "${DATA_ROOT}/aider-api-key")"
cat > "${AIDER_PROJECT}/.env.aider" <<EOF
OPENAI_API_BASE=${OMNI_URL}/v1
OPENAI_API_KEY=${AIDER_KEY}
AIDER_MODEL=openai/auto/coding
AIDER_WEAK_MODEL=openai/auto/coding
AIDER_SHOW_MODEL_WARNINGS=false
AIDER_CHECK_UPDATE=false
EOF
chmod 600 "${AIDER_PROJECT}/.env.aider"
cat > "${AIDER_PROJECT}/.aider.conf.yml" <<'EOF'
openai-api-base: http://127.0.0.1:20128/v1
model: openai/auto/coding
weak-model: openai/auto/coding
show-model-warnings: false
check-update: false
EOF
MODELS_JSON="$(curl -fsS "${OMNI_URL}/v1/models" -H "Authorization: Bearer ${AIDER_KEY}")"
printf '%s\n' "${MODELS_JSON}" > "${DATA_ROOT}/models.json"
MODEL="$(printf '%s\n' "${MODELS_JSON}" | jq -r '.data[].id' | grep '^auto/coding$' | head -n 1 || true)"
if [ -z "${MODEL}" ]; then MODEL="$(printf '%s\n' "${MODELS_JSON}" | jq -r '.data[].id' | grep '^auto/' | head -n 1 || true)"; fi
if [ -z "${MODEL}" ]; then log "NEXORA_OMNIROUTE_NO_AUTO_MODEL"; exit 1; fi
TEST_RESPONSE="$(curl -fsS -X POST "${OMNI_URL}/v1/chat/completions" -H 'Content-Type: application/json' -H "Authorization: Bearer ${AIDER_KEY}" --data "$(jq -nc --arg model "${MODEL}" '{model:$model,messages:[{role:"user",content:"Reply with exactly NEXORA_OMNIROUTE_AIDER_OK"}],max_tokens:16}')")"
printf '%s\n' "${TEST_RESPONSE}" > "${DATA_ROOT}/aider-smoke.json"
printf '%s\n' "${TEST_RESPONSE}" | jq -e '.choices[0].message.content' >/dev/null
"${AIDER_ROOT}/bin/aider" --version > "${DATA_ROOT}/aider-version.txt" 2>&1
log "NEXORA_AIDER_OK"
log "NEXORA_FREE_TIER_AIDER_OK"
