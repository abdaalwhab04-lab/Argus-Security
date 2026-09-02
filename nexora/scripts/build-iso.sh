#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${NEXORA_DIR}/.." && pwd)"

BUILD_DIR="${NEXORA_DIR}/build"
ROOTFS_DIR="${NEXORA_DIR}/rootfs"
ISO_DIR="${BUILD_DIR}/iso"
OUTPUT_DIR="${BUILD_DIR}/output"

KERNEL_VERSION="${KERNEL_VERSION:-6.12.50}"
KERNEL_BUILD_DIR="${BUILD_DIR}/linux-${KERNEL_VERSION}"

ISO_NAME="${ISO_NAME:-nexora.iso}"

echo "=== NEXORA ISO BUILD ==="

rm -rf "${ISO_DIR}"
mkdir -p "${ISO_DIR}/boot"
mkdir -p "${OUTPUT_DIR}"

echo "=== Prepare RootFS ==="
bash "${SCRIPT_DIR}/integrate-argus.sh"

echo "=== Check Kernel ==="

KERNEL_IMAGE="${KERNEL_BUILD_DIR}/arch/x86/boot/bzImage"

if [ ! -f "${KERNEL_IMAGE}" ]; then
    echo "ERROR: Kernel image not found:"
    echo "${KERNEL_IMAGE}"
    echo "Run build-kernel.sh before building the ISO."
    exit 1
fi

cp "${KERNEL_IMAGE}" "${ISO_DIR}/boot/vmlinuz"

echo "=== Prepare ISO contents ==="

cp -a "${ROOTFS_DIR}/." "${ISO_DIR}/"

echo "=== Create ISO ==="

if ! command -v xorriso >/dev/null 2>&1; then
    echo "ERROR: xorriso is required to build the ISO."
    exit 1
fi

xorriso \
    -as mkisofs \
    -o "${OUTPUT_DIR}/${ISO_NAME}" \
    -V "NEXORA_LINUX" \
    "${ISO_DIR}"

echo "=== ISO CREATED ==="
echo "Output: ${OUTPUT_DIR}/${ISO_NAME}"
