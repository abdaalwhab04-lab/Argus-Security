#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo '=== Argus Termux self-hosted runner check ==='

if [ -d /data/data/com.termux/files/usr ]; then
  echo 'Termux environment: detected'
else
  echo 'ERROR: this runner is not running inside the expected Termux prefix.'
  exit 1
fi

printf 'PREFIX=%s\n' "${PREFIX:-unknown}"
printf 'HOME=%s\n' "${HOME:-unknown}"
printf 'ARCH=%s\n' "$(uname -m)"
printf 'OS=%s\n' "$(uname -o 2>/dev/null || uname -s)"

command -v bash >/dev/null
command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v python >/dev/null

printf 'bash=%s\n' "$(bash --version | head -n1)"
printf 'git=%s\n' "$(git --version)"
printf 'node=%s\n' "$(node --version)"
printf 'npm=%s\n' "$(npm --version)"
printf 'python=%s\n' "$(python --version 2>&1)"

echo 'Termux runner check: OK'
