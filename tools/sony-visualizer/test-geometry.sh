#!/bin/bash
set -euo pipefail
sources="$(cd "$(dirname "$0")" && pwd)"
visualizer_root="${SONY_VISUALIZER_ROOT:?Set SONY_VISUALIZER_ROOT to the recovered Visualizer build workspace}"
export SONY_VISUALIZER_ROOT="$visualizer_root"
export LD_PRELOAD=/lib/x86_64-linux-gnu/libstdc++.so.6
source "$visualizer_root/tools/emsdk/emsdk_env.sh"
python3 "$sources/patch-gl.py"
mkdir -p "$visualizer_root/build/web/out"
em++ "$sources/client-array-probe.cpp" -O2 -sLEGACY_GL_EMULATION=1 -sGL_UNSAFE_OPTS=0 -sMODULARIZE=1 -sEXPORT_NAME=createClientArrayProbe -sEXPORTED_FUNCTIONS=_ux_probe -sENVIRONMENT=web --no-entry -o "$visualizer_root/build/web/out/client-probe.js"
SONY_PROBE_ROOT="$visualizer_root/build/web/out" node "$sources/test-client-arrays.cjs"
