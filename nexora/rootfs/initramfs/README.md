# NEXORA Initramfs

Minimal initial userspace for NEXORA Linux.

The initramfs starts after the Linux Kernel and provides the
initial `/init` process.

Boot flow:

GRUB
  ↓
Linux Kernel
  ↓
NEXORA Initramfs
  ↓
/init
  ↓
NEXORA RootFS
