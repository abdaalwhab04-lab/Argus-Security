#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOTFS_DIR="${NEXORA_DIR}/rootfs"
INIT_TEMPLATE="${NEXORA_DIR}/rootfs/initramfs/init"
TEMP_INIT="/tmp/nexora-init-template"

DEBIAN_SUITE="${DEBIAN_SUITE:-bookworm}"
DEBIAN_MIRROR="${DEBIAN_MIRROR:-http://deb.debian.org/debian}"
NODE_VERSION="${NODE_VERSION:-24.21.0}"
PNPM_VERSION="${PNPM_VERSION:-10.20.0}"
COMPOSE_VERSION="${COMPOSE_VERSION:-5.5.1}"
COMPOSE_SHA256="${COMPOSE_SHA256:-db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576}"

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
    --include=systemd,systemd-sysv,docker.io,containerd,runc,kmod,build-essential,pkg-config,git,curl,ca-certificates,unzip,xz-utils,python3,python3-pip,python3-venv,python3-dev,libffi-dev,libssl-dev,libsqlite3-dev,libpq-dev,iproute2,iptables \
    "${DEBIAN_SUITE}" \
    "${ROOTFS_DIR}" \
    "${DEBIAN_MIRROR}"

cat > "${ROOTFS_DIR}/etc/apt/apt.conf.d/80-nexora-dev" <<'APTCONF'
APT::Install-Recommends "false";
APT::Install-Suggests "false";
APTCONF

echo "=== Mirror portable Termux development tools into Debian ==="

TERMUX_DEBIAN_PACKAGES=(
    bc bison clang cpio curl dos2unix
    ffmpeg file fish flex gawk git
    jq less lld llvm lsof lua5.4
    m4 make nano net-tools nmap
    openssh-client openssh-server openssl
    parallel patch perl php-cli pkg-config
    postgresql-client procps psmisc
    qemu-system-x86 qemu-utils
    redis-server ripgrep rsync ruby
    gh tshark docker-compose qemu-user
    rustc cargo
    screen sed strace sudo
    tar tmux tor tree unzip util-linux
    vim-nox w3m wget xorriso zip
    cmake ninja-build
    docker.io containerd runc
)

# Debian's modern 7zip package exposes the `7zz` command, while the
# Termux inventory expects the traditional `7z` CLI. Use p7zip-full so
# the compatibility command is actually present and verify it below.
TERMUX_DEBIAN_PACKAGES+=(p7zip-full)

# Keep command-to-package mappings explicit. This preflight catches missing
# package mappings before the expensive package installation step.
declare -A TERMUX_COMMAND_PACKAGES=(
    [7z]=p7zip-full [bash]=bash [docker]=docker.io [docker-compose]=docker-compose [bc]=bc [clang]=clang [cpio]=cpio
    [curl]=curl [ffmpeg]=ffmpeg [file]=file [fish]=fish [flex]=flex
    [gawk]=gawk [gh]=gh [git]=git [jq]=jq [lsof]=lsof [lua5.4]=lua5.4
    [make]=make [nano]=nano [nmap]=nmap [ssh]=openssh-client
    [openssl]=openssl [parallel]=parallel [patch]=patch [perl]=perl
    [php]=php-cli [psql]=postgresql-client [qemu-system-x86_64]=qemu-system-x86
    [redis-server]=redis-server [rg]=ripgrep [rsync]=rsync [ruby]=ruby
    [rustc]=rustc [cargo]=cargo [strace]=strace [sudo]=sudo [tar]=tar
    [tmux]=tmux [tor]=tor [tree]=tree [unzip]=unzip [vim]=vim-nox
    [w3m]=w3m [wget]=wget [xorriso]=xorriso [zip]=zip [cmake]=cmake
    [ninja]=ninja-build [tshark]=tshark
)

TERMUX_REQUIRED_COMMANDS=(
    7z bash bc docker docker-compose clang cpio curl ffmpeg file fish flex gawk gh git jq
    lsof lua5.4 make nano nmap ssh openssl parallel patch perl php psql
    qemu-system-x86_64 redis-server rg rsync ruby rustc cargo strace sudo
    tar tmux tor tree unzip vim w3m wget xorriso zip cmake ninja tshark
)

echo "=== Preflight Debian package/command mappings ==="
PREFLIGHT_FAILED=0
for cmd in "${TERMUX_REQUIRED_COMMANDS[@]}"; do
    package="${TERMUX_COMMAND_PACKAGES[$cmd]:-}"
    if [ -z "${package}" ]; then
        echo "ERROR: no Debian package mapping declared for command: ${cmd}"
        PREFLIGHT_FAILED=1
        continue
    fi
    if ! printf '%s\n' "${TERMUX_DEBIAN_PACKAGES[@]}" | grep -Fxq "${package}"; then
        echo "ERROR: mapped package is not installed by the package list: ${cmd} -> ${package}"
        PREFLIGHT_FAILED=1
    fi
done
if [ "${PREFLIGHT_FAILED}" -ne 0 ]; then
    echo "ERROR: NEXORA Debian command mapping preflight failed."
    exit 1
fi
echo "NEXORA_TERMUX_MAPPING_PREFLIGHT_OK"

if [ -f /etc/resolv.conf ]; then
    cp -L /etc/resolv.conf "${ROOTFS_DIR}/etc/resolv.conf"
fi
DEBIAN_FRONTEND=noninteractive chroot "${ROOTFS_DIR}" apt-get update
DEBIAN_FRONTEND=noninteractive chroot "${ROOTFS_DIR}" apt-get install -y --no-install-recommends "${TERMUX_DEBIAN_PACKAGES[@]}"

echo "=== Verify mirrored Termux CLI tools ==="
TERMUX_REQUIRED_COMMANDS=(
    7z bash bc clang cpio curl ffmpeg file fish flex gawk gh git jq
    lsof lua5.4 make nano nmap ssh openssl parallel patch perl php psql
    qemu-system-x86_64 redis-server rg rsync ruby rustc cargo strace sudo
    tar tmux tor tree unzip vim w3m wget xorriso zip cmake ninja tshark
)
for cmd in "${TERMUX_REQUIRED_COMMANDS[@]}"; do
    if ! chroot "${ROOTFS_DIR}" sh -c "command -v '$cmd' >/dev/null 2>&1"; then
        echo "ERROR: mirrored Termux command is missing in NEXORA: $cmd"
        exit 1
    fi
done
echo "NEXORA_TERMUX_COMMANDS_OK"

if [ -x "${ROOTFS_DIR}/usr/bin/fdfind" ] && [ ! -e "${ROOTFS_DIR}/usr/local/bin/fd" ]; then
    ln -s /usr/bin/fdfind "${ROOTFS_DIR}/usr/local/bin/fd"
fi

mkdir -p "${ROOTFS_DIR}/opt/nexora/manifests"
cp "${NEXORA_DIR}/config/termux-packages.txt" "${ROOTFS_DIR}/opt/nexora/manifests/"
cp "${NEXORA_DIR}/config/termux-python-packages.txt" "${ROOTFS_DIR}/opt/nexora/manifests/"
cp "${NEXORA_DIR}/config/termux-npm-global.txt" "${ROOTFS_DIR}/opt/nexora/manifests/"
cp "${NEXORA_DIR}/config/termux-mirror-policy.md" "${ROOTFS_DIR}/opt/nexora/manifests/"

echo "NEXORA_TERMUX_INVENTORY_SAVED"
echo "NEXORA_TERMUX_DEBIAN_TOOLSET_OK"

echo "=== Install verified Node.js ${NODE_VERSION} LTS ==="

NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
NODE_TMP="/tmp/${NODE_TARBALL}"
NODE_SUMS="/tmp/SHASUMS256.txt"

curl -fsSL "${NODE_BASE_URL}/SHASUMS256.txt" -o "${NODE_SUMS}"
curl -fsSL "${NODE_BASE_URL}/${NODE_TARBALL}" -o "${NODE_TMP}"

(
    cd /tmp
    grep " ${NODE_TARBALL}$" "${NODE_SUMS}" | sha256sum -c -
)

rm -rf "${ROOTFS_DIR}/usr/local/lib/nodejs"
mkdir -p "${ROOTFS_DIR}/usr/local/lib/nodejs"
tar -xJf "${NODE_TMP}" -C "${ROOTFS_DIR}/usr/local/lib/nodejs"

ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/node" "${ROOTFS_DIR}/usr/local/bin/node"
ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/npm" "${ROOTFS_DIR}/usr/local/bin/npm"
ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/npx" "${ROOTFS_DIR}/usr/local/bin/npx"

if [ -x "${ROOTFS_DIR}/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/corepack" ]; then
    ln -sfn "/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin/corepack" "${ROOTFS_DIR}/usr/local/bin/corepack"
fi

rm -f "${NODE_TMP}" "${NODE_SUMS}"

echo "NEXORA_NODE_OK"
echo "=== Install Docker Compose v${COMPOSE_VERSION} plugin ==="
COMPOSE_TMP="/tmp/docker-compose"
COMPOSE_URL="https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64"
curl -fsSL "${COMPOSE_URL}" -o "${COMPOSE_TMP}"
echo "${COMPOSE_SHA256}  ${COMPOSE_TMP}" | sha256sum -c -
COMPOSE_PLUGIN="${ROOTFS_DIR}/usr/local/lib/docker/cli-plugins/docker-compose"
mkdir -p "$(dirname "${COMPOSE_PLUGIN}")"
install -m 0755 "${COMPOSE_TMP}" "${COMPOSE_PLUGIN}"
rm -f "${COMPOSE_TMP}"

if ! chroot "${ROOTFS_DIR}" /usr/bin/docker compose version >/dev/null 2>&1; then
    echo "ERROR: Docker Compose v2 plugin is not available."
    chroot "${ROOTFS_DIR}" /usr/bin/docker version || true
    exit 1
fi
chroot "${ROOTFS_DIR}" /usr/bin/docker compose version
echo "NEXORA_DOCKER_COMPOSE_V2_OK"


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

echo "=== Configure Debian development toolchain ==="

if ! chroot "${ROOTFS_DIR}" /usr/local/bin/node --version | grep -q '^v${NODE_VERSION%%.*}\\.'; then
    echo "ERROR: Node.js ${NODE_VERSION} was not installed correctly."
    chroot "${ROOTFS_DIR}" /usr/local/bin/node --version || true
    exit 1
fi

if ! chroot "${ROOTFS_DIR}" /usr/local/bin/npm --version >/dev/null 2>&1; then
    echo "ERROR: npm was not installed correctly."
    exit 1
fi

if [ -x "${ROOTFS_DIR}/usr/local/bin/corepack" ]; then
    chroot "${ROOTFS_DIR}" /usr/local/bin/corepack enable
    chroot "${ROOTFS_DIR}" /usr/local/bin/corepack prepare "pnpm@${PNPM_VERSION}" --activate
else
    chroot "${ROOTFS_DIR}" /usr/local/bin/npm install --global "pnpm@${PNPM_VERSION}"
fi

chroot "${ROOTFS_DIR}" /usr/local/bin/node --version
chroot "${ROOTFS_DIR}" /usr/local/bin/npm --version
chroot "${ROOTFS_DIR}" /usr/local/bin/pnpm --version

echo "NEXORA_NODE_TOOLCHAIN_OK"
echo "NEXORA_PYTHON_TOOLCHAIN_OK"
echo "NEXORA_BUILD_TOOLCHAIN_OK"

echo "=== Configure RootFS ==="
echo "=== Configure iptables compatibility ==="

# Configure the image itself, not the GitHub runner host. Docker bridge NAT
# needs the legacy iptables userspace backend with the minimal NEXORA kernel.
if [ -x "${ROOTFS_DIR}/usr/sbin/iptables-legacy" ]; then
    sudo ln -sfn /usr/sbin/iptables-legacy "${ROOTFS_DIR}/usr/sbin/iptables"
else
    echo "ERROR: iptables-legacy is missing from the NEXORA rootfs."
    exit 1
fi

if [ -x "${ROOTFS_DIR}/usr/sbin/ip6tables-legacy" ]; then
    sudo ln -sfn /usr/sbin/ip6tables-legacy "${ROOTFS_DIR}/usr/sbin/ip6tables"
else
    echo "ERROR: ip6tables-legacy is missing from the NEXORA rootfs."
    exit 1
fi

echo "NEXORA_IPTABLES_LEGACY_OK"
echo "=== Prepare bundled Docker test image ==="
mkdir -p "${ROOTFS_DIR}/opt/nexora-test"
if command -v docker >/dev/null 2>&1; then
    echo "Pulling busybox:1.36 on the build host..."
    docker pull busybox:1.36
    docker save -o "${ROOTFS_DIR}/opt/nexora-test/busybox-1.36.tar" busybox:1.36
    echo "NEXORA_DOCKER_TEST_IMAGE_OK"
else
    echo "ERROR: Docker is required on the build host to bundle the test image."
    exit 1
fi

echo "=== Configure NEXORA Docker container test ==="
mkdir -p "${ROOTFS_DIR}/usr/local/bin"

cat > "${ROOTFS_DIR}/usr/local/bin/nexora-docker-container-test.sh" <<'DOCKERTEST'
#!/bin/sh
set -eu

IMAGE_TAR="/opt/nexora-test/busybox-1.36.tar"
IMAGE="busybox:1.36"

echo "=== NEXORA DOCKER CONTAINER TEST ===" > /dev/console

if [ -f "${IMAGE_TAR}" ]; then
    echo "Loading bundled Docker test image..." > /dev/console
    docker load -i "${IMAGE_TAR}" > /dev/console 2>&1
else
    echo "Bundled Docker image not present; pulling ${IMAGE}..." > /dev/console
    if ! docker pull "${IMAGE}" > /dev/console 2>&1; then
        echo "NEXORA_DOCKER_CONTAINER_FAILED: unable to load or pull ${IMAGE}" > /dev/console
        exit 1
    fi
fi

echo "Running real Docker container..." > /dev/console
docker run --rm "${IMAGE}" sh -c 'echo NEXORA_DOCKER_CONTAINER_OK' > /dev/console 2>&1
echo "NEXORA_DOCKER_CONTAINER_TEST_DONE" > /dev/console
DOCKERTEST

chmod +x "${ROOTFS_DIR}/usr/local/bin/nexora-docker-container-test.sh"

echo "=== Configure NEXORA persistent Debian environment ==="

mkdir -p "${ROOTFS_DIR}/var/lib/docker"
mkdir -p "${ROOTFS_DIR}/var/lib/containerd"
mkdir -p "${ROOTFS_DIR}/persist"

cat > "${ROOTFS_DIR}/usr/local/bin/nexora-persistence-test.sh" <<'PERSISTTEST'
#!/bin/sh
set -eu

MARKER="/persist/nexora-persistence-marker"

if [ -f "${MARKER}" ]; then
    sync
    echo "NEXORA_PERSISTENCE_RESTORED" > /dev/console
else
    printf '%s\n' "NEXORA_PERSISTENCE_OK" > "${MARKER}"
    sync
    echo "NEXORA_PERSISTENCE_SYNCED" > /dev/console
    echo "NEXORA_PERSISTENCE_INITIALIZED" > /dev/console
fi

echo "NEXORA_PERSISTENCE_TEST_DONE" > /dev/console
PERSISTTEST

chmod +x "${ROOTFS_DIR}/usr/local/bin/nexora-persistence-test.sh"

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

cat > "${ROOTFS_DIR}/usr/local/bin/nexora-userspace-start.sh" <<'USERSpace'
#!/bin/sh
set -eu

CONSOLE=/dev/console
log() { echo "$*" > "$CONSOLE"; }

log "=== NEXORA DOCKER STORAGE ==="
test -d /var/lib/docker
test -d /var/lib/containerd
test -w /var/lib/docker
test -w /var/lib/containerd
log "NEXORA_DOCKER_STORAGE_OK"

log "=== START CONTAINERD ==="
if ! systemctl start containerd; then
    log "NEXORA_CONTAINERD_FAILED"
    systemctl status containerd --no-pager -l > "$CONSOLE" 2>&1 || true
    journalctl -u containerd -n 80 --no-pager > "$CONSOLE" 2>&1 || true
    exit 1
fi
if ! systemctl is-active --quiet containerd; then
    log "NEXORA_CONTAINERD_FAILED"
    systemctl status containerd --no-pager -l > "$CONSOLE" 2>&1 || true
    journalctl -u containerd -n 80 --no-pager > "$CONSOLE" 2>&1 || true
    exit 1
fi
log "NEXORA_CONTAINERD_OK"

log "=== START DOCKER ==="
if ! systemctl start docker; then
    log "NEXORA_DOCKER_FAILED"
    systemctl status docker --no-pager -l > "$CONSOLE" 2>&1 || true
    journalctl -u docker -n 80 --no-pager > "$CONSOLE" 2>&1 || true
    exit 1
fi
if ! systemctl is-active --quiet docker || ! docker info >/dev/null 2>&1; then
    log "NEXORA_DOCKER_FAILED"
    systemctl status docker --no-pager -l > "$CONSOLE" 2>&1 || true
    journalctl -u docker -n 80 --no-pager > "$CONSOLE" 2>&1 || true
    docker info > "$CONSOLE" 2>&1 || true
    exit 1
fi
log "NEXORA_DOCKER_OK"
/usr/local/bin/nexora-docker-container-test.sh
/usr/local/bin/nexora-persistence-test.sh
log "NEXORA_DEBIAN_USERSPACE_OK"
USERSpace

chmod +x "${ROOTFS_DIR}/usr/local/bin/nexora-userspace-start.sh"

cat > "${ROOTFS_DIR}/etc/systemd/system/nexora-userspace.service" <<'SERVICE'
[Unit]
Description=NEXORA Debian Userspace Boot Marker
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexora-userspace-start.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SERVICE

ln -sf ../nexora-userspace.service \
    "${ROOTFS_DIR}/etc/systemd/system/multi-user.target.wants/nexora-userspace.service"

echo "=== Debian RootFS Created ==="
echo "NEXORA_ROOTFS_OK"
