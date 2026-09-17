#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env does not exist. Run first: bash scripts/termux-setup.sh"
  exit 1
fi

if [ ! -d .next ]; then
  echo "ERROR: production build is missing. Run: bash scripts/termux-setup.sh"
  exit 1
fi

# Load local environment without echoing secrets.
set -a
. ./.env
set +a

export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export PORT="${PORT:-20128}"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "http://${HOSTNAME}:${PORT}/healthz" >/dev/null 2>&1; then
    echo "OmniRoute is already running at http://${HOSTNAME}:${PORT}"
    exit 0
  fi
fi

echo "Starting OmniRoute on ${HOSTNAME}:${PORT}..."
exec npm run start
