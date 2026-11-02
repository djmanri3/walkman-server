#!/bin/bash
set -euo pipefail
web_sources="$(cd "$(dirname "$0")" && pwd)"
visualizer_root="${SONY_VISUALIZER_ROOT:-$(dirname "$web_sources")}"
export SONY_VISUALIZER_ROOT="$visualizer_root"
if [[ ! -f "$visualizer_root/build/recompiled/sources.json" ]]; then
  echo 'Set SONY_VISUALIZER_ROOT to the Visualizer directory with the recovered native engine and Skia build.' >&2
  exit 1
fi
# NoMachine's injected EGL library conflicts with the SDK's static libc++ at exit.
export LD_PRELOAD=/lib/x86_64-linux-gnu/libstdc++.so.6
source "$visualizer_root/tools/emsdk/emsdk_env.sh"
python3 "$web_sources/fetch-fonts.py"
python3 "$web_sources/patch-gl.py"
python3 "$web_sources/prepare.py"
emcmake cmake -G Ninja -S "$visualizer_root/build/web" -B "$visualizer_root/build/web/out" -DCMAKE_BUILD_TYPE=Release
cmake --build "$visualizer_root/build/web/out" --target visualizer -j "${SONY_BUILD_JOBS:-5}"
python3 "$web_sources/bundle-local.py"
echo "Built $visualizer_root/build/web/out/visualizer.{js,wasm,data}"
