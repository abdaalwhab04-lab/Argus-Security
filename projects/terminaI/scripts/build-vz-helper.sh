#!/bin/bash
set -e

# Only run on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Skipping macOS VZ helper build (not on macOS)"
  exit 0
fi

RESOURCES_DIR="$(dirname "$0")/../packages/microvm/resources"
SWIFT_SOURCE="$RESOURCES_DIR/vz-helper.swift"
OUTPUT_BIN="$RESOURCES_DIR/vz-helper"

if ! command -v swiftc &> /dev/null; then
  echo "Error: swiftc not found. Please install Xcode or Command Line Tools."
  exit 1
fi

echo "Building macOS Virtualization helper..."
swiftc "$SWIFT_SOURCE" -o "$OUTPUT_BIN"
echo "Build complete: $OUTPUT_BIN"
