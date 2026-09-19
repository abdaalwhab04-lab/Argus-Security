#!/bin/bash
set -e

# Configuration
FC_VERSION="v1.7.0"
ARCH="x86_64"
OUTPUT_DIR="$(pwd)/packages/microvm/resources"
OUTPUT_FILE="${OUTPUT_DIR}/firecracker"

echo "=== Downloading Firecracker ${FC_VERSION} ==="

mkdir -p "${OUTPUT_DIR}"

FC_URL="https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${ARCH}.tgz"

echo "Downloading from ${FC_URL}..."
curl -L "${FC_URL}" | tar -xz -O "release-${FC_VERSION}-${ARCH}/firecracker-${FC_VERSION}-${ARCH}" > "${OUTPUT_FILE}"

chmod +x "${OUTPUT_FILE}"

echo "Firecracker installed to ${OUTPUT_FILE}"
"${OUTPUT_FILE}" --version
