#!/usr/bin/env bash
set -euo pipefail

KERNEL_VERSION="${KERNEL_VERSION:-6.12.50}"
KERNEL_URL="https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-${KERNEL_VERSION}.tar.xz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${NEXORA_DIR}/build"
KERNEL_DIR="${NEXORA_DIR}/kernel"

mkdir -p "${BUILD_DIR}" "${KERNEL_DIR}"

echo "=== NEXORA Kernel Build ==="
echo "Kernel version: ${KERNEL_VERSION}"
echo "Architecture: x86_64"

cd "${BUILD_DIR}"

echo "=== Download Linux Kernel ==="
curl -fL --retry 3 -o "linux-${KERNEL_VERSION}.tar.xz" "${KERNEL_URL}"

echo "=== Extract Linux Kernel ==="
rm -rf "linux-${KERNEL_VERSION}"
tar -xf "linux-${KERNEL_VERSION}.tar.xz"

cd "linux-${KERNEL_VERSION}"

echo "=== Prepare Kernel Configuration ==="
make x86_64_defconfig

NEXORA_CONFIG="${NEXORA_DIR}/config/kernel.conf"

if [ -f "${NEXORA_CONFIG}" ]; then
    while IFS= read -r option; do
        case "${option}" in
            ""|\#*) continue ;;
            CONFIG_*=y)
                name="${option%%=*}"
                scripts/config --enable "${name#CONFIG_}" 2>/dev/null || true
                ;;
        esac
    done < "${NEXORA_CONFIG}"
fi

make olddefconfig

echo "=== Kernel configuration prepared ==="
echo "Configuration: ${NEXORA_CONFIG}"
echo "Kernel source: ${PWD}"
