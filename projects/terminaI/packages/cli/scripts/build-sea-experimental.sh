#!/bin/bash
set -e

# Ensure we are in packages/cli
cd "$(dirname "$0")/.."

echo "Bundling CLI with esbuild..."
# Bundle using npx esbuild
# We exclude 'fsevents' as it is a native module optional dependency often causing issues in bundling
# We externalize specific native modules if needed.
# For a robust CLI, we bundle mostly everything except native addons.
# Note: Firecracker/resources are external assets.

# Bundle as CJS for SEA compatibility
# Externalize TLA modules or problematic native deps
npx esbuild index.ts --bundle --platform=node --format=cjs --target=node20 --outfile=dist/terminai.bundled.js \
    --external:fsevents --external:vscode-jsonrpc --external:node-pty --external:yoga-layout \
    --external:ink --external:react --external:@terminai/microvm/resources/* \
    --loader:.wasm=binary

# Patch import.meta.url for CJS
# esbuild transforms import.meta.url to import_meta*.url which is empty/undefined.
# It uses (0, import_node_url*.fileURLToPath)(import_meta*.url) to get __filename.
# We replace this function call with process.execPath (the binary path).
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' -E 's/\(0, [^)]+\.fileURLToPath\)\([^)]+\.url\)/process.execPath/g' dist/terminai.bundled.js
  sed -i '' -E 's/(\(0, [^)]+\.createRequire\))\([^)]+\.url\)/\1(process.execPath)/g' dist/terminai.bundled.js
else
  sed -i -E 's/\(0, [^)]+\.fileURLToPath\)\([^)]+\.url\)/process.execPath/g' dist/terminai.bundled.js
  sed -i -E 's/(\(0, [^)]+\.createRequire\))\([^)]+\.url\)/\1(process.execPath)/g' dist/terminai.bundled.js
fi

echo "Generating SEA blob..."
node --experimental-sea-config sea-config.json

echo "Creating binary..."
cp $(command -v node) terminai

echo "Injecting blob..."
# Use npx postject to inject. 
# --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 is required for Node 20+
npx postject terminai NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

echo "Signing (Ad-hoc)..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    codesign --sign - terminai
fi

echo "Done. Binary created at packages/cli/terminai"
