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

echo "=== Verify BusyBox ==="

file "${BUSYBOX}"

if file "${BUSYBOX}" | grep -q "x86-64"; then
    echo "BUSYBOX_X86_64_OK"
else
    echo "ERROR: BusyBox is not x86-64."
    exit 1
fi

if file "${BUSYBOX}" | grep -q "statically linked"; then
    echo "BUSYBOX_STATIC_OK"
else
    echo "ERROR: BusyBox is not statically linked."
    exit 1
fi

echo "=== Install BusyBox ==="

cp -L "${BUSYBOX}" "${INITRAMFS_DIR}/bin/busybox"
chmod +x "${INITRAMFS_DIR}/bin/busybox"

echo "=== Install BusyBox applets ==="

cd "${INITRAMFS_DIR}/bin"

"${INITRAMFS_DIR}/bin/busybox" --install -s .

echo "=== Fix BusyBox links ==="

for applet in *; do
    if [ "${applet}" != "busybox" ] && [ -L "${applet}" ]; then
        rm -f "${applet}"
        ln -s busybox "${applet}"
    fi
done

echo "=== Verify switch_root ==="

if [ ! -e "${INITRAMFS_DIR}/bin/switch_root" ]; then
    echo "ERROR: BusyBox switch_root applet was not installed."
    exit 1
fi

echo "NEXORA_SWITCH_ROOT_OK"

echo "=== Install NEXORA init ==="

cp "${NEXORA_DIR}/rootfs/initramfs/init" \
   "${INITRAMFS_DIR}/init"

chmod +x "${INITRAMFS_DIR}/init"

echo "=== Verify Initramfs files ==="

ls -lh "${INITRAMFS_DIR}/bin/busybox"
ls -l "${INITRAMFS_DIR}/bin/sh"
readlink "${INITRAMFS_DIR}/bin/sh" || true

echo "=== Create Initramfs ==="

cd "${INITRAMFS_DIR}"

find . -print0 | cpio --null -o -H newc | gzip -9 > "${OUTPUT}"

echo "=== INITRAMFS CREATED ==="
echo "Output: ${OUTPUT}"

ls -lh "${OUTPUT}"

echo "NEXORA_INITRAMFS_OK"
