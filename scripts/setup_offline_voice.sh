#!/bin/sh
# Run once on Apple Silicon with Python 3.11+ to install local character speech.
set -eu
cd "$(dirname "$0")"
voice_dir="$HOME/Library/Application Support/Afterglow/voices"
python_bin="${PYTHON_BIN:-python3.11}"
mkdir -p "$voice_dir"
"$python_bin" -m venv "$voice_dir/runtime"
"$voice_dir/runtime/bin/python" -m pip install 'mlx-audio==0.6.7'
"$voice_dir/runtime/bin/python" download_voice_model.py
