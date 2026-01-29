# mic-recog

CLI transcription using OpenAI Whisper.

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

FFmpeg is required on your system. For example (macOS):
```bash
brew install ffmpeg
```

## File transcription
```bash
./transcribe.py path/to/audio.wav
```

Options:
```bash
./transcribe.py path/to/audio.wav -m small -l ja --format txt -o output.txt
./transcribe.py path/to/audio.wav --format json -o output.json
```

## Microphone streaming (chunked)
```bash
./mic_stream.py --list-devices
./mic_stream.py --mic 1 -m small -l ja
```

Notes:
- This is chunked streaming (not true realtime); adjust `--chunk-seconds` and `--block-seconds` for latency.
- Some systems require PortAudio; install via your OS package manager if `sounddevice` fails.

## Microphone streaming (Silero VAD segmentation)
Use Silero VAD to cut at natural pauses:
```bash
./mic_stream.py --mic 1 -m small -l ja --vad
```

Tuning examples:
```bash
./mic_stream.py --mic 1 -m tiny -l ja --vad --vad-end-ms 300 --vad-pre-roll-ms 100 --vad-threshold 0.5
```

Notes:
- Silero VAD requires a sample rate of 8000 or 16000 (default 16000 is OK).
- Install dependencies if needed: `pip install silero-vad torchaudio`

## Interim (sliding window) display
Show “in-progress” recognition while speaking:
```bash
./mic_stream.py --mic 1 -m small -l ja --vad --interim
```

Tuning examples:
```bash
./mic_stream.py --mic 1 -m small -l ja --vad --interim --interim-seconds 0.5 --interim-window-seconds 2.0
./mic_stream.py --mic 1 -m small -l ja --vad --interim --interim-model tiny
```

## Silence filtering (Whisper thresholds)
If you see garbage during silence, increase `--no-speech-threshold` or raise `--logprob-threshold`:
```bash
./mic_stream.py --mic 1 -m small -l ja --vad --no-speech-threshold 0.8 --logprob-threshold -0.5
```

## Exclude specific phrases
Ignore exact-match phrases (repeatable):
```bash
./mic_stream.py --mic 1 -m small -l ja --vad --exclude "視聴ありがとうございました" --exclude "えーと"
```

## WebSocket output
Send finalized transcripts to a WebSocket server:
```bash
./mic_stream.py --mic 1 -m small -l ja --vad --ws-url ws://localhost:8765
```

See `WEBSOCKET_SPEC.md` for the JSON payload format.

## Build a single binary (PyInstaller)
```bash
./build.sh mic_stream
./build.sh transcribe
```

Notes:
- The binary will be large because it bundles Whisper/Torch.
- The first run still downloads the Whisper model files.
- You may need PortAudio on the target machine for mic input.
