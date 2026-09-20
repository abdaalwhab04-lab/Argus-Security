#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${NEXORA_DIR}/build"
IMAGE="${BUILD_DIR}/persistent-data.img"
SIZE="${NEXORA_PERSISTENT_SIZE:-8G}"

echo "=== NEXORA PERSISTENT DATA DISK BUILD ==="
echo "Image: ${IMAGE}"
echo "Size: ${SIZE}"

mkdir -p "${BUILD_DIR}"
rm -f "${IMAGE}"
truncate -s "${SIZE}" "${IMAGE}"
mkfs.ext4 -F -L NEXORA_DATA "${IMAGE}"

echo "=== Verify persistent data disk ==="
file "${IMAGE}"
e2fsck -fn "${IMAGE}" >/tmp/nexora-e2fsck.log || true
cat /tmp/nexora-e2fsck.log
ls -lh "${IMAGE}"
echo "NEXORA_PERSISTENT_DISK_OK"
