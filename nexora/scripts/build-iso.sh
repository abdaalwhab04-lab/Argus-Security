#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILD_DIR="${NEXORA_DIR}/build"
ROOTFS_DIR="${NEXORA_DIR}/rootfs"
ISO_DIR="${BUILD_DIR}/iso"
OUTPUT_DIR="${BUILD_DIR}/output"

KERNEL_VERSION="${KERNEL_VERSION:-6.12.50}"
ISO_NAME="${ISO_NAME:-nexora.iso}"

KERNEL_IMAGE="${BUILD_DIR}/linux-${KERNEL_VERSION}/arch/x86/boot/bzImage"
INITRAMFS_IMAGE="${BUILD_DIR}/nexora-initramfs.cpio.gz"

echo "=== NEXORA BOOTABLE ISO BUILD ==="
echo "Kernel version: ${KERNEL_VERSION}"
echo "ISO: ${ISO_NAME}"

echo "=== Check required tools ==="

for tool in xorriso grub-mkrescue rsync; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "ERROR: Required tool not found: ${tool}"
        exit 1
    fi
done

echo "=== Check Kernel ==="

if [ ! -f "${KERNEL_IMAGE}" ]; then
    echo "ERROR: Kernel image not found:"
    echo "${KERNEL_IMAGE}"
    exit 1
fi

echo "Kernel:"
ls -lh "${KERNEL_IMAGE}"

echo "=== Check Initramfs ==="

if [ ! -f "${INITRAMFS_IMAGE}" ]; then
    echo "ERROR: Initramfs image not found:"
    echo "${INITRAMFS_IMAGE}"
    exit 1
fi

echo "Initramfs:"
ls -lh "${INITRAMFS_IMAGE}"

echo "=== Prepare RootFS ==="

bash "${SCRIPT_DIR}/integrate-argus.sh"

echo "=== Prepare ISO tree ==="

rm -rf "${ISO_DIR}"

echo "=== Copy RootFS ==="

rsync -a --exclude="dev/" "${ROOTFS_DIR}/" "${ISO_DIR}/"

mkdir -p \
    "${ISO_DIR}/boot/grub" \
    "${ISO_DIR}/EFI/BOOT"
    "${ISO_DIR}/dev"

echo "=== Copy Kernel ==="

cp "${KERNEL_IMAGE}" \
   "${ISO_DIR}/boot/vmlinuz"

echo "=== Copy Initramfs ==="

cp "${INITRAMFS_IMAGE}" \
   "${ISO_DIR}/boot/initramfs.img"

echo "=== Install GRUB configuration ==="

cat > "${ISO_DIR}/boot/grub/grub.cfg" <<'GRUBCFG'
set timeout=5
set default=0

serial --unit=0 --speed=115200
terminal_input console serial
terminal_output console serial

menuentry "NEXORA Linux" {
    linux /boot/vmlinuz root=/dev/ram0 rw console=ttyS0,115200
    initrd /boot/initramfs.img
}
GRUBCFG

echo "=== Build BIOS + UEFI bootable ISO ==="

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

grub-mkrescue \
    -o "${OUTPUT_DIR}/${ISO_NAME}" \
    "${ISO_DIR}"

echo "=== Verify ISO ==="

if [ ! -f "${OUTPUT_DIR}/${ISO_NAME}" ]; then
    echo "ERROR: ISO was not created."
    exit 1
fi

ls -lh "${OUTPUT_DIR}/${ISO_NAME}"
file "${OUTPUT_DIR}/${ISO_NAME}"

echo "=== NEXORA ISO CREATED ==="
echo "Output: ${OUTPUT_DIR}/${ISO_NAME}"
echo "NEXORA_ISO_OK"
