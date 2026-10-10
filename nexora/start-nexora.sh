#!/bin/sh
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/nexora/build"
ISO_IMAGE="$BUILD_DIR/output/nexora.iso"
PERSISTENT_DISK="$BUILD_DIR/persistent-data.img"
KERNEL_IMAGE="$BUILD_DIR/linux-${KERNEL_VERSION:-6.12.50}-clang/arch/x86/boot/bzImage"
INITRAMFS_IMAGE="$BUILD_DIR/nexora-initramfs.cpio.gz"

for f in "$ISO_IMAGE" "$PERSISTENT_DISK" "$KERNEL_IMAGE" "$INITRAMFS_IMAGE"; do
  if [ ! -f "$f" ]; then
    echo "NEXORA launcher: required local build artifact is missing:"
    echo "  $f"
    echo "This launcher does not download, rebuild, or install software."
    exit 1
  fi
done

echo "NEXORA: entering the repository-built Debian environment."
exec qemu-system-x86_64 \
  -m "${NEXORA_RAM_MB:-2048}" -smp "${NEXORA_CPUS:-2}" -machine pc \
  -display none -serial stdio \
  -kernel "$KERNEL_IMAGE" -initrd "$INITRAMFS_IMAGE" \
  -append "root=/dev/ram0 rw console=ttyS0,115200 systemd.mask=serial-getty@ttyS0.service" \
  -drive "file=$ISO_IMAGE,media=cdrom,if=ide,readonly=on" \
  -drive "file=$PERSISTENT_DISK,format=raw,if=virtio" \
  -no-reboot
