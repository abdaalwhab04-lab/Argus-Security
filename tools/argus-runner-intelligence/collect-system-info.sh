#!/data/data/com.termux/files/usr/bin/bash

set +e

OUTPUT="runner-intelligence.json"
START_TIME=$(date +%s)

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

command_output() {
    "$@" 2>&1
}

get_ram_mb() {
    if [ -r /proc/meminfo ]; then
        awk '/^MemTotal:/ {printf "%.0f", $2/1024}' /proc/meminfo
    else
        echo "0"
    fi
}

get_swap_mb() {
    if [ -r /proc/meminfo ]; then
        awk '/^SwapTotal:/ {printf "%.0f", $2/1024}' /proc/meminfo
    else
        echo "0"
    fi
}

get_cpu_count() {
    if command_exists nproc; then
        nproc
    elif [ -r /proc/cpuinfo ]; then
        grep -c '^processor' /proc/cpuinfo
    else
        echo "0"
    fi
}

get_cpu_model() {
    if [ -r /proc/cpuinfo ]; then
        awk -F': ' '
            /Hardware/ {print $2; exit}
            /model name/ {print $2; exit}
            /Processor/ {print $2; exit}
        ' /proc/cpuinfo
    fi
}

get_storage() {
    df -P "$HOME" 2>/dev/null | tail -n 1
}

get_python_version() {
    if command_exists python; then
        python --version 2>&1
    elif command_exists python3; then
        python3 --version 2>&1
    else
        echo "not-installed"
    fi
}

get_git_version() {
    if command_exists git; then
        git --version 2>&1
    else
        echo "not-installed"
    fi
}

get_docker_version() {
    if command_exists docker; then
        docker --version 2>&1
    else
        echo "not-installed"
    fi
}

get_pytest_version() {
    if command_exists python; then
        python -m pytest --version 2>&1
    elif command_exists python3; then
        python3 -m pytest --version 2>&1
    else
        echo "not-installed"
    fi
}

get_xdist_version() {
    if command_exists python; then
        python -m pip show pytest-xdist 2>/dev/null |
            awk '/^Version:/ {print $2}'
    elif command_exists python3; then
        python3 -m pip show pytest-xdist 2>/dev/null |
            awk '/^Version:/ {print $2}'
    fi
}

get_python_path() {
    if command_exists python; then
        command -v python
    elif command_exists python3; then
        command -v python3
    else
        echo ""
    fi
}

escape_json() {
    printf '%s' "$1" |
        python -c '
import json
import sys
value = sys.stdin.read()
print(json.dumps(value, ensure_ascii=False))
'
}

CPU_COUNT="$(get_cpu_count)"
CPU_MODEL="$(get_cpu_model)"
RAM_MB="$(get_ram_mb)"
SWAP_MB="$(get_swap_mb)"
PYTHON_VERSION="$(get_python_version)"
PYTHON_PATH="$(get_python_path)"
GIT_VERSION="$(get_git_version)"
DOCKER_VERSION="$(get_docker_version)"
PYTEST_VERSION="$(get_pytest_version)"
XDIST_VERSION="$(get_xdist_version)"
STORAGE="$(get_storage)"

OS_NAME="Android/Termux"

if command_exists getprop; then
    ANDROID_VERSION="$(getprop ro.build.version.release 2>/dev/null)"
    DEVICE_MODEL="$(getprop ro.product.model 2>/dev/null)"
    MANUFACTURER="$(getprop ro.product.manufacturer 2>/dev/null)"
else
    ANDROID_VERSION=""
    DEVICE_MODEL=""
    MANUFACTURER=""
fi

ARCH="$(uname -m 2>/dev/null)"
KERNEL="$(uname -r 2>/dev/null)"
HOSTNAME_VALUE="$(hostname 2>/dev/null)"
BASH_VERSION_VALUE="${BASH_VERSION:-unknown}"
TERM_VALUE="${TERM:-unknown}"

if command_exists termux-info; then
    TERMUX_INFO="$(termux-info 2>&1 | head -n 40)"
else
    TERMUX_INFO="termux-info not installed"
fi

if command_exists pkg; then
    TERMUX_PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
else
    TERMUX_PREFIX=""
fi

if command_exists ip; then
    IP_INFO="$(ip addr 2>/dev/null | head -n 80)"
else
    IP_INFO="ip command unavailable"
fi

if command_exists df; then
    FILESYSTEM_INFO="$(df -h 2>/dev/null)"
else
    FILESYSTEM_INFO="df unavailable"
fi

if command_exists lsblk; then
    BLOCK_INFO="$(lsblk 2>&1)"
else
    BLOCK_INFO="lsblk unavailable on Android/Termux"
fi

NVME_STATUS="not-detected"

if [ -e /dev/nvme0n1 ] || [ -e /dev/nvme1n1 ]; then
    NVME_STATUS="detected"
fi

DOCKER_AVAILABLE="false"

if command_exists docker; then
    if docker info >/dev/null 2>&1; then
        DOCKER_AVAILABLE="true"
    else
        DOCKER_AVAILABLE="installed-but-daemon-unavailable"
    fi
fi

PYTEST_AVAILABLE="false"

case "$PYTEST_VERSION" in
    pytest\ *) PYTEST_AVAILABLE="true" ;;
esac

XDIST_AVAILABLE="false"

if [ -n "$XDIST_VERSION" ]; then
    XDIST_AVAILABLE="true"
fi

if [ "$CPU_COUNT" -ge 8 ] 2>/dev/null; then
    CPU_RATING="excellent"
elif [ "$CPU_COUNT" -ge 4 ] 2>/dev/null; then
    CPU_RATING="good"
elif [ "$CPU_COUNT" -ge 2 ] 2>/dev/null; then
    CPU_RATING="acceptable"
else
    CPU_RATING="limited"
fi

RAM_GB="$(awk -v mb="$RAM_MB" 'BEGIN {printf "%.2f", mb/1024}')"

if [ "$RAM_MB" -ge 32768 ] 2>/dev/null; then
    RAM_RATING="excellent"
elif [ "$RAM_MB" -ge 16384 ] 2>/dev/null; then
    RAM_RATING="good"
elif [ "$RAM_MB" -ge 8192 ] 2>/dev/null; then
    RAM_RATING="acceptable"
else
    RAM_RATING="limited"
fi

if [ "$CPU_COUNT" -gt 1 ] 2>/dev/null; then
    RECOMMENDED_WORKERS=$((CPU_COUNT - 1))
else
    RECOMMENDED_WORKERS=1
fi

END_TIME="$(date +%s)"
DURATION="$((END_TIME - START_TIME))"

cat > "$OUTPUT" <<JSON
{
  "schema_version": "3.1-termux",
  "generated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "environment": {
    "type": $(escape_json "$OS_NAME"),
    "termux": true,
    "prefix": $(escape_json "$TERMUX_PREFIX"),
    "architecture": $(escape_json "$ARCH"),
    "kernel": $(escape_json "$KERNEL"),
    "hostname": $(escape_json "$HOSTNAME_VALUE")
  },
  "android": {
    "version": $(escape_json "$ANDROID_VERSION"),
    "device_model": $(escape_json "$DEVICE_MODEL"),
    "manufacturer": $(escape_json "$MANUFACTURER")
  },
  "cpu": {
    "logical_cpus": $CPU_COUNT,
    "model": $(escape_json "$CPU_MODEL"),
    "architecture": $(escape_json "$ARCH"),
    "rating": $(escape_json "$CPU_RATING")
  },
  "memory": {
    "total_mb": $RAM_MB,
    "total_gb": $RAM_GB,
    "swap_mb": $SWAP_MB,
    "rating": $(escape_json "$RAM_RATING")
  },
  "storage": {
    "home_filesystem": $(escape_json "$STORAGE"),
    "nvme": {
      "status": $(escape_json "$NVME_STATUS")
    },
    "filesystem": $(escape_json "$FILESYSTEM_INFO"),
    "block_devices": $(escape_json "$BLOCK_INFO")
  },
  "network": {
    "ip_information": $(escape_json "$IP_INFO")
  },
  "python": {
    "version": $(escape_json "$PYTHON_VERSION"),
    "executable": $(escape_json "$PYTHON_PATH")
  },
  "tools": {
    "git": $(escape_json "$GIT_VERSION"),
    "docker": $(escape_json "$DOCKER_VERSION"),
    "docker_available": $(escape_json "$DOCKER_AVAILABLE"),
    "pytest": $(escape_json "$PYTEST_VERSION"),
    "pytest_available": $PYTEST_AVAILABLE,
    "pytest_xdist": $(escape_json "$XDIST_VERSION"),
    "pytest_xdist_available": $XDIST_AVAILABLE
  },
  "termux": {
    "bash": $(escape_json "$BASH_VERSION_VALUE"),
    "terminal": $(escape_json "$TERM_VALUE"),
    "termux_info": $(escape_json "$TERMUX_INFO")
  },
  "resource_evaluation": {
    "cpu_rating": $(escape_json "$CPU_RATING"),
    "ram_rating": $(escape_json "$RAM_RATING"),
    "recommended_pytest_workers": $RECOMMENDED_WORKERS
  },
  "execution": {
    "duration_seconds": $DURATION
  }
}
JSON

echo "========================================"
echo "ARGUS RUNNER INTELLIGENCE - TERMUX"
echo "========================================"
echo
echo "Generated: $OUTPUT"
echo
cat "$OUTPUT"
echo
echo "========================================"
echo "DONE"
echo "========================================"
