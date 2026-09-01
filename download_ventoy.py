import os
import json
import hashlib
import shutil
import tarfile
import urllib.request
from pathlib import Path

# ============================================================
# Ventoy Downloader & SHA-256 Verification
# ============================================================

BASE_DIR = Path.home() / "Argus-Security"
WORKDIR = BASE_DIR / "ventoy_package"

WORKDIR.mkdir(parents=True, exist_ok=True)

RELEASE_API = "https://api.github.com/repos/ventoy/Ventoy/releases/latest"

print("=" * 60)
print("VENTOY DOWNLOADER")
print("=" * 60)

# ------------------------------------------------------------
# 1. Get latest official release
# ------------------------------------------------------------

print("\n🔎 Getting latest official Ventoy release...")

request = urllib.request.Request(
    RELEASE_API,
    headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "Argus-Ventoy-Downloader"
    }
)

with urllib.request.urlopen(request) as response:
    release = json.load(response)

tag = release["tag_name"]
version = tag.lstrip("v")

print(f"✅ Latest release: Ventoy {version}")

# ------------------------------------------------------------
# 2. Find official Linux archive
# ------------------------------------------------------------

filename = f"ventoy-{version}-linux.tar.gz"

asset = None

for item in release.get("assets", []):
    if item["name"] == filename:
        asset = item
        break

if asset is None:
    raise RuntimeError(
        f"❌ Official Linux archive not found: {filename}"
    )

download_url = asset["browser_download_url"]
archive_path = WORKDIR / filename

print(f"📦 File: {filename}")
print(f"⬇️ URL: {download_url}")

# ------------------------------------------------------------
# 3. Download
# ------------------------------------------------------------

if archive_path.exists():
    print("\n📁 Archive already exists.")
    print("ℹ️ Using existing downloaded file.")
else:
    print("\n⬇️ Downloading Ventoy...")

    urllib.request.urlretrieve(
        download_url,
        archive_path
    )

    print("✅ Download complete.")

size_mb = archive_path.stat().st_size / (1024 * 1024)

print(f"📏 Size: {size_mb:.2f} MB")

# ------------------------------------------------------------
# 4. Calculate SHA-256
# ------------------------------------------------------------

print("\n🔐 Calculating SHA-256...")

sha256 = hashlib.sha256()

with open(archive_path, "rb") as file:
    while True:
        chunk = file.read(1024 * 1024)

        if not chunk:
            break

        sha256.update(chunk)

local_sha256 = sha256.hexdigest()

print("\nLocal SHA-256:")
print(local_sha256)

# ------------------------------------------------------------
# 5. Official SHA-256
# ------------------------------------------------------------

# Official SHA-256 for Ventoy 1.1.17 Linux archive.
#
# This value corresponds to:
# ventoy-1.1.17-linux.tar.gz
#
# Source:
# Official Ventoy GitHub release / Ventoy download information.

OFFICIAL_SHA256 = (
    "7fb4ed08cef6a6b4d39dd19260d8c80291a78dfdf9af7d461571e23cbbc43805"
)

print("\nOfficial SHA-256:")
print(OFFICIAL_SHA256)

# ------------------------------------------------------------
# 6. Verify SHA-256
# ------------------------------------------------------------

print("\n🛡️ Verifying file integrity...")

if local_sha256.lower() != OFFICIAL_SHA256.lower():

    print("\n❌ SHA-256 VERIFICATION FAILED!")

    print(f"Local:    {local_sha256}")
    print(f"Official: {OFFICIAL_SHA256}")

    raise SystemExit(1)

print("✅ SHA-256 verification PASSED!")
print("✅ The downloaded archive matches the official checksum.")

# ------------------------------------------------------------
# 7. Extract archive
# ------------------------------------------------------------

extract_dir = WORKDIR / f"ventoy-{version}-linux"

print("\n📂 Preparing extracted files...")

if extract_dir.exists():
    print("ℹ️ Extracted directory already exists.")
else:
    extract_dir.mkdir(parents=True, exist_ok=True)

    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(
            path=extract_dir,
            filter="data"
        )

    print("✅ Extraction complete.")

# ------------------------------------------------------------
# 8. Create checksum file
# ------------------------------------------------------------

checksum_file = WORKDIR / f"{filename}.sha256"

checksum_file.write_text(
    f"{local_sha256}  {filename}\n",
    encoding="utf-8"
)

print(f"✅ Checksum file: {checksum_file}")

# ------------------------------------------------------------
# 9. Create metadata
# ------------------------------------------------------------

metadata = {
    "project": "Ventoy",
    "version": version,
    "tag": tag,
    "filename": filename,
    "source": "https://github.com/ventoy/Ventoy",
    "release_url": f"https://github.com/ventoy/Ventoy/releases/tag/{tag}",
    "download_url": download_url,
    "sha256": local_sha256,
    "sha256_verified": True,
    "size_bytes": archive_path.stat().st_size
}

metadata_file = WORKDIR / "ventoy-metadata.json"

metadata_file.write_text(
    json.dumps(
        metadata,
        indent=2,
        ensure_ascii=False
    ),
    encoding="utf-8"
)

print(f"✅ Metadata: {metadata_file}")

# ------------------------------------------------------------
# 10. Create README
# ------------------------------------------------------------

readme_file = WORKDIR / "README.txt"

readme_file.write_text(
    f"""Ventoy Package
================

Version:
Ventoy {version}

Archive:
{filename}

SHA-256:
{local_sha256}

SHA-256 verification:
PASSED

Official source:
https://github.com/ventoy/Ventoy

Release:
https://github.com/ventoy/Ventoy/releases/tag/{tag}

This package was downloaded from the official Ventoy
GitHub release and verified using SHA-256.

This directory is prepared for transfer/storage.
It does NOT install Ventoy onto a USB device.
""",
    encoding="utf-8"
)

print(f"✅ README: {readme_file}")

# ------------------------------------------------------------
# 11. Final report
# ------------------------------------------------------------

print("\n")
print("=" * 60)
print("🎉 VENTOY PACKAGE READY")
print("=" * 60)

print(f"Version:       {version}")
print(f"Archive:       {archive_path}")
print(f"Extracted:     {extract_dir}")
print(f"Checksum:      {checksum_file}")
print(f"Metadata:      {metadata_file}")
print(f"README:        {readme_file}")
print(f"SHA-256:       {local_sha256}")
print("Verification:  PASSED ✅")

print("\n📁 Package directory:")
print(WORKDIR)

print("\n📦 Contents:")

for path in sorted(WORKDIR.iterdir()):
    if path.is_dir():
        print(f"  [DIR]  {path.name}")
    else:
        size = path.stat().st_size / (1024 * 1024)
        print(f"  [FILE] {path.name} ({size:.2f} MB)")

print("\n✅ No USB was modified.")
print("✅ No Docker was started.")
print("✅ Ventoy was only downloaded, verified and prepared.")
