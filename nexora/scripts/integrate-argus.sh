#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${NEXORA_DIR}/.." && pwd)"
ROOTFS_DIR="${NEXORA_DIR}/rootfs"

ARGUS_DIR="${ROOTFS_DIR}/opt/argus"

echo "=== NEXORA Argus Integration ==="
echo "Repository: ${REPO_ROOT}"
echo "RootFS: ${ROOTFS_DIR}"
echo "Argus target: ${ARGUS_DIR}"

mkdir -p "${ARGUS_DIR}"

echo "=== Copy Argus project ==="

rsync -a \
  --exclude=".git" \
  --exclude="nexora/build" \
  --exclude="nexora/rootfs/opt/argus" \
  --exclude="__pycache__" \
  --exclude=".pytest_cache" \
  "${REPO_ROOT}/" \
  "${ARGUS_DIR}/"

echo "=== Argus integrated ==="
echo "Location: ${ARGUS_DIR}"
echo "NEXORA_ARGUS_INTEGRATION_OK"
