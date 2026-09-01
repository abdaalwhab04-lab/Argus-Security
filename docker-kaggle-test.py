import os
import shutil
import subprocess

def run(cmd):
    print(f"\n$ {cmd}")
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            text=True,
            capture_output=True,
            timeout=30,
        )
        print(result.stdout.strip())
        if result.stderr.strip():
            print(result.stderr.strip())
        print(f"EXIT CODE: {result.returncode}")
        return result.returncode
    except Exception as e:
        print(f"ERROR: {e}")
        return -1


print("=" * 70)
print("KAGGLE DOCKER TEST")
print("=" * 70)

print("\n=== SYSTEM ===")
run("uname -a")
run("id")

print("\n=== DOCKER CLIENT ===")
run("docker --version")
run("docker compose version")

print("\n=== DOCKER BINARIES ===")
print("docker:", shutil.which("docker"))
print("dockerd:", shutil.which("dockerd"))
print("containerd:", shutil.which("containerd"))

print("\n=== DOCKER SOCKET ===")
run("ls -l /var/run/docker.sock 2>/dev/null || true")

print("\n=== DOCKER PROCESSES ===")
run("ps aux | grep -E '[d]ockerd|[c]ontainerd' || true")

print("\n=== DOCKER INFO ===")
run("docker info 2>&1 | head -60")

print("\n=== DOCKER DAEMON TEST ===")
run("dockerd --version")

print("\n=== CONTAINER TEST ===")
run("docker run --rm hello-world")

print("\n=== GPU HOST TEST ===")
run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || true")

print("\n=== ENVIRONMENT ===")
print("KAGGLE_KERNEL_RUN_TYPE =", os.environ.get("KAGGLE_KERNEL_RUN_TYPE"))
print("CUDA_VISIBLE_DEVICES =", os.environ.get("CUDA_VISIBLE_DEVICES"))

print("\n" + "=" * 70)
print("KAGGLE DOCKER TEST FINISHED")
print("=" * 70)
