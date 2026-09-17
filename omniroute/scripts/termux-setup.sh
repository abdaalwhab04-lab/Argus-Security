#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# OmniRoute v3.8.50 - Termux / proot-Debian bootstrap
# This script intentionally creates secrets locally and never prints them.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf '\n=== OmniRoute v3.8.50 — Termux setup ===\n'

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Use Node 24.x or another supported Node version."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ] || [ "$NODE_MAJOR" -ge 27 ]; then
  echo "ERROR: OmniRoute v3.8.50 requires Node.js 24.x, 25.x, or 26.x."
  node -v
  exit 1
fi

echo "Node: $(node -v)"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not available."
  exit 1
fi

echo "Installing dependencies..."
npm install

mkdir -p "$HOME/.omniroute"
chmod 700 "$HOME/.omniroute"

if [ ! -f .env ]; then
  echo "Creating local .env with fresh secrets..."
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  API_KEY_SECRET="$(openssl rand -hex 32)"
  STORAGE_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  INITIAL_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9@#%+=' | head -c 24)"
  cat > .env <<EOF
NODE_ENV=production
PORT=20128
HOSTNAME=127.0.0.1
JWT_SECRET=$JWT_SECRET
API_KEY_SECRET=$API_KEY_SECRET
INITIAL_PASSWORD=$INITIAL_PASSWORD
STORAGE_ENCRYPTION_KEY=$STORAGE_ENCRYPTION_KEY
STORAGE_ENCRYPTION_KEY_VERSION=v1
DATA_DIR=$HOME/.omniroute
DISABLE_SQLITE_AUTO_BACKUP=false
EOF
  chmod 600 .env
  echo "Created .env (secrets were generated locally and were not displayed)."
else
  echo ".env already exists; leaving it unchanged."
fi

if [ ! -d .next ] || [ "${OMNIROUTE_FORCE_BUILD:-0}" = "1" ]; then
  echo "Building OmniRoute..."
  npm run build
else
  echo "Existing .next build detected; skipping build. Set OMNIROUTE_FORCE_BUILD=1 to rebuild."
fi

cat <<'EOF'

SETUP COMPLETE.

Start OmniRoute with:
  bash scripts/termux-start.sh

Then open:
  http://127.0.0.1:20128

The API base is:
  http://127.0.0.1:20128/v1

To create an API key, use the OmniRoute dashboard after startup.
Never commit .env or share its secrets.
EOF
