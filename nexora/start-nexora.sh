#!/bin/sh
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ISO_IMAGE="$REPO_ROOT/build/output/nexora.iso"
PERSISTENT_DISK="$REPO_ROOT/build/persistent-data.img"
KERNEL_IMAGE="$REPO_ROOT/build/linux-6.12.50/arch/x86/boot/bzImage"
INITRAMFS_IMAGE="$REPO_ROOT/build/nexora-initramfs.cpio.gz"

for f in "$ISO_IMAGE" "$PERSISTENT_DISK" "$KERNEL_IMAGE" "$INITRAMFS_IMAGE"; do
  if [ ! -f "$f" ]; then
    echo "NEXORA launcher: required local build artifact is missing:"
    echo "$f"
    echo "Run the NEXORA GitHub build first; this launcher does not download or install anything."
    exit 1
  fi
done

echo "NEXORA: entering Debian userspace from the repository-built NEXORA image."
exec proot-distro login debian -- /usr/bin/qemu-system-x86_64 \
  -m 2048 -smp 2 -machine q35 -display none -serial stdio \
  -kernel "$KERNEL_IMAGE" -initrd "$INITRAMFS_IMAGE" \
  -append "root=/dev/ram0 rw console=ttyS0,115200 systemd.mask=serial-getty@ttyS0.service" \
  -drive "file=$ISO_IMAGE,media=cdrom,if=ide,readonly=on" \
  -drive "file=$PERSISTENT_DISK,format=raw,if=virtio" \
  -no-reboot
