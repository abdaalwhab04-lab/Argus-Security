#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${NEXORA_DIR}/build"

INITRAMFS_DIR="${BUILD_DIR}/initramfs"
OUTPUT="${BUILD_DIR}/nexora-initramfs.cpio.gz"

echo "=== NEXORA INITRAMFS BUILD ==="

rm -rf "${INITRAMFS_DIR}"
mkdir -p \
  "${INITRAMFS_DIR}/bin" \
  "${INITRAMFS_DIR}/sbin" \
  "${INITRAMFS_DIR}/proc" \
  "${INITRAMFS_DIR}/sys" \
  "${INITRAMFS_DIR}/dev" \
  "${INITRAMFS_DIR}/run" \
  "${INITRAMFS_DIR}/tmp" \
  "${INITRAMFS_DIR}/etc"

echo "=== Locate BusyBox ==="

BUSYBOX="$(command -v busybox || true)"

if [ -z "${BUSYBOX}" ]; then
    echo "ERROR: busybox is required."
    exit 1
fi

echo "BusyBox: ${BUSYBOX}"

echo "=== Install BusyBox ==="

cp "${BUSYBOX}" "${INITRAMFS_DIR}/bin/busybox"
chmod +x "${INITRAMFS_DIR}/bin/busybox"

"${INITRAMFS_DIR}/bin/busybox" --install -s "${INITRAMFS_DIR}/bin"

echo "=== Install NEXORA init ==="

cp "${NEXORA_DIR}/rootfs/initramfs/init" \
   "${INITRAMFS_DIR}/init"

chmod +x "${INITRAMFS_DIR}/init"

echo "=== Create Initramfs ==="

cd "${INITRAMFS_DIR}"

find . -print0 | cpio --null -o -H newc | gzip -9 > "${OUTPUT}"

echo "=== INITRAMFS CREATED ==="
echo "Output: ${OUTPUT}"
ls -lh "${OUTPUT}"
