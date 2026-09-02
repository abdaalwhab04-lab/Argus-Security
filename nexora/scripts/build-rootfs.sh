#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOTFS_DIR="${NEXORA_DIR}/rootfs"
INIT_TEMPLATE="${NEXORA_DIR}/rootfs/initramfs/init"
TEMP_INIT="/tmp/nexora-init-template"

DEBIAN_SUITE="${DEBIAN_SUITE:-bookworm}"
DEBIAN_MIRROR="${DEBIAN_MIRROR:-http://deb.debian.org/debian}"

echo "=== NEXORA ROOTFS BUILD ==="
echo "Distribution: Debian ${DEBIAN_SUITE}"
echo "Architecture: amd64"
echo "RootFS: ${ROOTFS_DIR}"

if ! command -v debootstrap >/dev/null 2>&1; then
    echo "ERROR: debootstrap is required."
    exit 1
fi

if [ ! -f "${INIT_TEMPLATE}" ]; then
    echo "ERROR: NEXORA init template not found:"
    echo "${INIT_TEMPLATE}"
    exit 1
fi

echo "=== Preserve NEXORA init template ==="

cp "${INIT_TEMPLATE}" "${TEMP_INIT}"

echo "=== Prepare RootFS ==="

rm -rf "${ROOTFS_DIR}"
mkdir -p "${ROOTFS_DIR}"

echo "=== Bootstrap Debian ==="

sudo debootstrap \
    --arch=amd64 \
    --variant=minbase \
    "${DEBIAN_SUITE}" \
    "${ROOTFS_DIR}" \
    "${DEBIAN_MIRROR}"

echo "=== Restore NEXORA init template ==="

mkdir -p "${ROOTFS_DIR}/initramfs"
cp "${TEMP_INIT}" "${ROOTFS_DIR}/initramfs/init"
chmod +x "${ROOTFS_DIR}/initramfs/init"
rm -f "${TEMP_INIT}"

echo "=== Configure RootFS ==="

sudo chown -R "$(id -u):$(id -g)" "${ROOTFS_DIR}"

cat > "${ROOTFS_DIR}/etc/hostname" <<'HOSTNAME'
nexora
HOSTNAME

echo "=== Debian RootFS Created ==="
echo "NEXORA_ROOTFS_OK"
