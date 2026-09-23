#!/usr/bin/env bash
set -euo pipefail

KERNEL_VERSION="${KERNEL_VERSION:-6.12.50}"
KERNEL_URL="https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-${KERNEL_VERSION}.tar.xz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${NEXORA_DIR}/build"

KERNEL_ARCHIVE="${BUILD_DIR}/linux-${KERNEL_VERSION}.tar.xz"
KERNEL_SOURCE="${BUILD_DIR}/linux-${KERNEL_VERSION}"
KERNEL_IMAGE="${KERNEL_SOURCE}/arch/x86/boot/bzImage"

mkdir -p "${BUILD_DIR}"

echo "=== NEXORA Kernel Build ==="
echo "Kernel version: ${KERNEL_VERSION}"
echo "Architecture: x86_64"

cd "${BUILD_DIR}"

echo "=== Check Disk Space ==="
df -h "${BUILD_DIR}"

echo "=== Download Linux Kernel ==="

if [ ! -f "${KERNEL_ARCHIVE}" ]; then
    curl -fL --retry 3 \
        -o "${KERNEL_ARCHIVE}" \
        "${KERNEL_URL}"
else
    echo "Kernel archive already exists."
fi

echo "=== Extract Linux Kernel ==="

rm -rf "${KERNEL_SOURCE}"

tar -xf "${KERNEL_ARCHIVE}"

# The compressed archive is no longer required after extraction.
# Removing it saves disk space before compilation.
rm -f "${KERNEL_ARCHIVE}"

echo "=== Disk Space After Extraction ==="
df -h "${BUILD_DIR}"

cd "${KERNEL_SOURCE}"

echo "=== Prepare Kernel Configuration ==="

ARCH=x86 make x86_64_defconfig

NEXORA_CONFIG="${NEXORA_DIR}/config/kernel.conf"
test -f "${NEXORA_CONFIG}"

while IFS= read -r option; do
    case "${option}" in
        ""|\#*)
            continue
            ;;
        CONFIG_*=y)
            name="${option%%=*}"
            echo "Enable kernel option: ${option}"
            if ! scripts/config --enable "${name#CONFIG_}"; then
                echo "ERROR: unable to enable required kernel option: ${option}"
                exit 1
            fi
            ;;
    esac
done < "${NEXORA_CONFIG}"

ARCH=x86 make olddefconfig

echo "=== Verify Requested Kernel Configuration ==="
config_failed=0
while IFS= read -r option; do
    case "${option}" in
        ""|\#*)
            continue
            ;;
        CONFIG_*=y)
            if grep -qxF "${option}" .config; then
                echo "KERNEL_CONFIG_OK ${option}"
            else
                echo "ERROR: required kernel option is not =y after olddefconfig: ${option}"
                symbol="${option%%=*}"
                actual="$(grep -E "^\${symbol}(=| is not set)" .config || true)"
                if [ -n "${actual}" ]; then
                    echo "KERNEL_CONFIG_ACTUAL ${actual}"
                else
                    echo "KERNEL_CONFIG_ACTUAL <absent>"
                fi
                config_failed=1
            fi
            ;;
    esac
done < "${NEXORA_CONFIG}"

if [ "${config_failed}" -ne 0 ]; then
    echo "ERROR: NEXORA kernel configuration verification failed before compilation."
    exit 1
fi

echo "NEXORA_KERNEL_CONFIG_READY"

echo "=== Build Linux Kernel ==="

# Default to one job on constrained environments.
# Override with NEXORA_KERNEL_JOBS when more resources are available.
JOBS="${NEXORA_KERNEL_JOBS:-1}"

echo "Parallel jobs: ${JOBS}"

ARCH=x86 make -j"${JOBS}" bzImage
echo "=== Verify Kernel ==="

if [ ! -f "${KERNEL_IMAGE}" ]; then
    echo "ERROR: Kernel build completed but bzImage was not found."
    exit 1
fi

echo "=== NEXORA KERNEL CREATED ==="

ls -lh "${KERNEL_IMAGE}"
file "${KERNEL_IMAGE}"

echo "=== Disk Space After Kernel Build ==="
df -h "${BUILD_DIR}"

echo "NEXORA_KERNEL_OK"
