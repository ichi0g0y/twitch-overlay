#!/usr/bin/env bash
set -euo pipefail

app="${1:-mic_stream}"
case "$app" in
  mic_stream|transcribe) ;;
  *)
    echo "Usage: $0 [mic_stream|transcribe]"
    exit 2
    ;;
esac

python_bin="${PYTHON_BIN:-}"
if [ -z "$python_bin" ]; then
  if command -v python3 >/dev/null 2>&1; then
    python_bin="python3"
  elif command -v python >/dev/null 2>&1; then
    python_bin="python"
  else
    echo "Pythonが見つかりません"
    exit 1
  fi
fi

"$python_bin" -m pip install -r requirements.txt
"$python_bin" -m pip install pyinstaller

pyinstaller \
  --clean \
  --onefile \
  --name "$app" \
  --collect-all whisper \
  --collect-all torch \
  --collect-all torchaudio \
  "$app".py
