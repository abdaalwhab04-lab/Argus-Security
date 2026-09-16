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
    --include=systemd,systemd-sysv,docker.io,containerd,runc \
    "${DEBIAN_SUITE}" \
    "${ROOTFS_DIR}" \
    "${DEBIAN_MIRROR}"

echo "=== Verify Debian init ==="

if [ -x "${ROOTFS_DIR}/sbin/init" ]; then
    echo "NEXORA_DEBIAN_INIT_OK"
else
    echo "ERROR: Debian /sbin/init was not created."
    ls -lah "${ROOTFS_DIR}/sbin" || true
    exit 1
fi

echo "=== Verify systemd ==="

if [ -x "${ROOTFS_DIR}/lib/systemd/systemd" ]; then
    echo "NEXORA_SYSTEMD_OK"
else
    echo "ERROR: Debian systemd was not created."
    exit 1
fi

if [ "$(readlink "${ROOTFS_DIR}/sbin/init" 2>/dev/null || true)" = "/lib/systemd/systemd" ]; then
    echo "NEXORA_INIT_SYSTEMD_OK"
else
    echo "WARNING: /sbin/init is not linked directly to /lib/systemd/systemd"
    readlink "${ROOTFS_DIR}/sbin/init" || true
fi

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

echo "=== Configure NEXORA Docker container test ==="
mkdir -p "${ROOTFS_DIR}/usr/local/bin"

cat > "${ROOTFS_DIR}/usr/local/bin/nexora-docker-container-test.sh" <<'DOCKERTEST'
#!/bin/sh
set -eu

IMAGE_TAR="/opt/nexora-test/busybox-1.36.tar"

echo "=== NEXORA DOCKER CONTAINER TEST ===" > /dev/console

if [ ! -f "${IMAGE_TAR}" ]; then
    echo "NEXORA_DOCKER_CONTAINER_FAILED: image tar missing" > /dev/console
    exit 1
fi

echo "Loading Docker test image..." > /dev/console
docker load -i "${IMAGE_TAR}" > /dev/console 2>&1

echo "Running real Docker container..." > /dev/console
docker run --rm busybox:1.36 sh -c 'echo NEXORA_DOCKER_CONTAINER_OK' > /dev/console 2>&1

echo "NEXORA_DOCKER_CONTAINER_TEST_DONE" > /dev/console
DOCKERTEST

chmod +x "${ROOTFS_DIR}/usr/local/bin/nexora-docker-container-test.sh"

echo "=== Configure NEXORA Docker storage and boot marker ==="

mkdir -p "${ROOTFS_DIR}/var/lib/docker"
mkdir -p "${ROOTFS_DIR}/var/lib/containerd"

mkdir -p "${ROOTFS_DIR}/etc/systemd/system/docker.service.d"
cat > "${ROOTFS_DIR}/etc/systemd/system/docker.service.d/nexora-storage.conf" <<'DROPIN'
[Unit]
After=containerd.service
DROPIN

mkdir -p "${ROOTFS_DIR}/etc/systemd/system/containerd.service.d"
cat > "${ROOTFS_DIR}/etc/systemd/system/containerd.service.d/nexora-storage.conf" <<'DROPIN'
[Unit]
After=local-fs.target
DROPIN

cat > "${ROOTFS_DIR}/etc/systemd/system/nexora-userspace.service" <<'SERVICE'
[Unit]
Description=NEXORA Debian Userspace Boot Marker
After=local-fs.target containerd.service
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo "=== NEXORA DOCKER STORAGE ===" > /dev/console; test -d /var/lib/docker || exit 1; test -d /var/lib/containerd || exit 1; test -w /var/lib/docker || exit 1; test -w /var/lib/containerd || exit 1; echo NEXORA_DOCKER_STORAGE_OK > /dev/console; systemctl start containerd || true; echo === CONTAINERD STATUS === > /dev/console; systemctl status containerd --no-pager -l > /dev/console 2>&1 || true; echo === CONTAINERD JOURNAL === > /dev/console; journalctl -u containerd -n 50 --no-pager > /dev/console 2>&1 || true; systemctl start docker || true; echo === DOCKER STATUS === > /dev/console; systemctl status docker --no-pager -l > /dev/console 2>&1 || true; echo === DOCKER JOURNAL === > /dev/console; journalctl -u docker -n 50 --no-pager > /dev/console 2>&1 || true; if systemctl is-active --quiet docker && docker info >/dev/null 2>&1; then echo NEXORA_DOCKER_OK > /dev/console; /usr/local/bin/nexora-docker-container-test.sh; else echo NEXORA_DOCKER_FAILED > /dev/console; exit 1; fi; echo NEXORA_DEBIAN_USERSPACE_OK > /dev/console'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SERVICE

ln -sf ../nexora-userspace.service \
    "${ROOTFS_DIR}/etc/systemd/system/multi-user.target.wants/nexora-userspace.service"

echo "=== Debian RootFS Created ==="
echo "NEXORA_ROOTFS_OK"
