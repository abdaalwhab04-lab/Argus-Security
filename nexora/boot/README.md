# NEXORA Boot

This directory contains the bootloader configuration for NEXORA Linux.

The ISO will use GRUB to provide BIOS/UEFI boot support.

Boot flow:

GRUB
  ↓
Linux Kernel
  ↓
NEXORA Root Filesystem
