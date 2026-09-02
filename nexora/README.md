# NEXORA Linux

NEXORA Linux is the operating-system layer for the NEXORA project.

## Architecture

- kernel/  - Linux Kernel source and configuration
- rootfs/  - Root filesystem
- boot/    - Bootloader and boot configuration
- config/  - NEXORA build configuration
- scripts/ - Build and preparation scripts
- build/   - Temporary build workspace

## Target

Primary target:
- x86_64

Future target:
- ARM64

## Build flow

Linux Kernel
    ↓
Root Filesystem
    ↓
Argus + NEXORA
    ↓
Boot files
    ↓
NEXORA ISO
