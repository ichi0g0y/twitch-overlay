#!/usr/bin/env python3
"""Live microphone transcription using OpenAI Whisper (chunked streaming + Silero VAD)."""

from __future__ import annotations

import argparse
from collections import deque
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import time
import threading
import uuid
import wave

import sounddevice as sd


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Transcribe from microphone using OpenAI Whisper (chunked streaming)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--backend",
        default="whisper",
        choices=["whisper", "whispercpp"],
        help="Transcription backend",
    )
    p.add_argument(
        "-m",
        "--model",
        default="base",
        help="Whisper model name or path (backend=whisper)",
    )
    p.add_argument(
        "-l",
        "--language",
        default=None,
        help="Language code (e.g. ja, en). Auto-detect if omitted.",
    )
    p.add_argument(
        "-t",
        "--task",
        default="transcribe",
        choices=["transcribe", "translate"],
        help="Transcribe or translate to English",
    )
    p.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cpu", "cuda", "mps"],
        help="Force device for Whisper (auto uses MPS/CUDA if available)",
    )
    p.add_argument(
        "--fp16",
        action="store_true",
        help="Use FP16 precision (CUDA only)",
    )
    p.add_argument(
        "--mic",
        type=int,
        default=None,
        help="Input device index for microphone",
    )
    p.add_argument(
        "--list-devices",
        action="store_true",
        help="List audio devices and exit",
    )
    p.add_argument(
        "--list-devices-json",
        action="store_true",
        help="List audio input devices as JSON and exit",
    )
    p.add_argument(
        "--samplerate",
        type=int,
        default=16000,
        help="Sample rate for recording",
    )
    p.add_argument(
        "--chunk-seconds",
        type=float,
        default=5.0,
        help="Seconds per transcription chunk",
    )
    p.add_argument(
        "--overlap-seconds",
        type=float,
        default=1.0,
        help="Seconds of overlap between chunks",
    )
    p.add_argument(
        "--block-seconds",
        type=float,
        default=0.5,
        help="Input block size in seconds (lower = lower latency)",
    )
    p.add_argument(
        "--max-queue",
        type=int,
        default=20,
        help="Max blocks to buffer before dropping oldest",
    )
    p.add_argument(
        "--vad",
        action="store_true",
        help="Use VAD-based segmentation for more natural boundaries",
    )
    p.add_argument(
        "--vad-threshold",
        type=float,
        default=0.5,
        help="Silero VAD speech probability threshold (0.0-1.0)",
    )
    p.add_argument(
        "--vad-end-ms",
        type=int,
        default=300,
        help="Silence duration (ms) to end a segment",
    )
    p.add_argument(
        "--vad-pre-roll-ms",
        type=int,
        default=150,
        help="Audio kept before speech start (ms)",
    )
    p.add_argument(
        "--vad-min-seconds",
        type=float,
        default=0.4,
        help="Minimum segment length to transcribe (seconds)",
    )
    p.add_argument(
        "--vad-max-seconds",
        type=float,
        default=15.0,
        help="Maximum segment length (seconds). Set 0 to disable.",
    )
    p.add_argument(
        "--interim",
        action="store_true",
        help="Show interim transcription using a sliding window",
    )
    p.add_argument(
        "--interim-model",
        default=None,
        choices=[
            "tiny",
            "base",
            "small",
            "medium",
            "large",
            "large-v2",
            "large-v3",
        ],
        help="Optional separate model for interim (enables true parallelism)",
    )
    p.add_argument(
        "--interim-seconds",
        type=float,
        default=0.5,
        help="Interval (seconds) between interim updates",
    )
    p.add_argument(
        "--interim-window-seconds",
        type=float,
        default=2.0,
        help="Window length (seconds) for interim transcription",
    )
    p.add_argument(
        "--interim-min-seconds",
        type=float,
        default=0.3,
        help="Minimum window length (seconds) to run interim transcription",
    )
    p.add_argument(
        "--no-speech-threshold",
        type=float,
        default=0.6,
        help="Whisper no_speech_threshold (higher = more aggressive silence filtering)",
    )
    p.add_argument(
        "--logprob-threshold",
        type=float,
        default=-1.0,
        help="Whisper logprob_threshold (lower = more permissive; higher = stricter)",
    )
    p.add_argument(
        "--compression-ratio-threshold",
        type=float,
        default=2.4,
        help="Whisper compression_ratio_threshold (lower = stricter)",
    )
    p.add_argument(
        "--temperature",
        type=float,
        default=0.0,
        help="Whisper decoding temperature",
    )
    p.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Ignore output if it exactly matches this text (repeatable)",
    )
    p.add_argument(
        "--ws-url",
        default=None,
        help="WebSocket server URL to send transcripts (e.g. ws://localhost:8765)",
    )
    p.add_argument(
        "--ws-reconnect-seconds",
        type=float,
        default=5.0,
        help="Reconnect interval for WebSocket (seconds)",
    )
    p.add_argument(
        "--ws-timeout",
        type=float,
        default=5.0,
        help="WebSocket connection timeout (seconds)",
    )
    p.add_argument(
        "--ws-ping-seconds",
        type=float,
        default=20.0,
        help="Send JSON ping to WebSocket at this interval (0 to disable)",
    )
    p.add_argument(
        "--whispercpp-bin",
        default=None,
        help="Path to whisper.cpp binary (backend=whispercpp)",
    )
    p.add_argument(
        "--whispercpp-model",
        default=None,
        help="Path to whisper.cpp GGUF model (backend=whispercpp)",
    )
    p.add_argument(
        "--whispercpp-threads",
        type=int,
        default=None,
        help="Threads for whisper.cpp (backend=whispercpp)",
    )
    p.add_argument(
        "--whispercpp-extra-args",
        action="append",
        default=[],
        help="Extra args for whisper.cpp (repeatable)",
    )
    return p.parse_args()


def _list_devices() -> None:
    print(sd.query_devices())


def _list_devices_json() -> None:
    devices = sd.query_devices()
    default_input = None
    try:
        default_input = sd.default.device[0]
    except Exception:
        default_input = None

    hostapis = []
    try:
        hostapis = sd.query_hostapis()
    except Exception:
        hostapis = []

    result = []
    for idx, dev in enumerate(devices):
        try:
            max_inputs = int(dev.get("max_input_channels", 0))
        except Exception:
            max_inputs = 0
        if max_inputs <= 0:
            continue

        hostapi_index = dev.get("hostapi")
        hostapi_name = None
        if hostapi_index is not None and hostapi_index < len(hostapis):
            hostapi_name = hostapis[hostapi_index].get("name")

        result.append(
            {
                "index": idx,
                "name": dev.get("name"),
                "max_input_channels": max_inputs,
                "default_samplerate": dev.get("default_samplerate"),
                "hostapi": hostapi_index,
                "hostapi_name": hostapi_name,
                "is_default": idx == default_input,
            }
        )

    print(json.dumps({"devices": result}, ensure_ascii=False))


def _resolve_whisper_device(device: str) -> str:
    if device != "auto":
        return device

    try:
        import torch
    except Exception:
        return "cpu"

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _resolve_whispercpp_bin(bin_path: str) -> str:
    if not bin_path:
        return ""
    if os.path.isfile(bin_path) and os.access(bin_path, os.X_OK):
        return bin_path
    resolved = shutil.which(bin_path)
    return resolved or bin_path


class _RollingBuffer:
    def __init__(self, max_seconds: float, samplerate: int) -> None:
        self._max_samples = int(max_seconds * samplerate)
        self._chunks: deque[np.ndarray] = deque()
        self._size = 0

    def add(self, samples: np.ndarray) -> None:
        if samples.size == 0:
            return
        self._chunks.append(samples)
        self._size += samples.size
        while self._size > self._max_samples and self._chunks:
            drop = self._chunks.popleft()
            self._size -= drop.size

    def get(self) -> np.ndarray:
        if not self._chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(list(self._chunks))

    def clear(self) -> None:
        self._chunks.clear()
        self._size = 0


def _clear_interim_line() -> None:
    sys.stderr.write("\r" + (" " * 120) + "\r")
    sys.stderr.flush()


def _is_excluded(text: str, excludes: list[str]) -> bool:
    if not excludes:
        return False
    normalized = text.strip()
    if not normalized:
        return False
    return normalized in {e.strip() for e in excludes if e is not None}


class _WebSocketSender:
    def __init__(
        self,
        url: str,
        reconnect_seconds: float,
        timeout: float,
        ping_seconds: float,
    ) -> None:
        self._url = url
        self._reconnect_seconds = reconnect_seconds
        self._timeout = timeout
        self._ping_seconds = max(0.0, float(ping_seconds or 0.0))
        self._queue: queue.Queue[str] = queue.Queue()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def send(self, payload: dict) -> None:
        try:
            self._queue.put_nowait(json.dumps(payload, ensure_ascii=False))
        except Exception:
            pass

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1.0)

    def _loop(self) -> None:
        import websocket

        while not self._stop.is_set():
            ws = None
            try:
                ws = websocket.create_connection(self._url, timeout=self._timeout)
                last_ping = time.monotonic()
                while not self._stop.is_set():
                    try:
                        msg = self._queue.get(timeout=0.2)
                        ws.send(msg)
                    except queue.Empty:
                        pass

                    if self._ping_seconds > 0:
                        now = time.monotonic()
                        if now - last_ping >= self._ping_seconds:
                            ws.send(json.dumps({"type": "ping"}, ensure_ascii=False))
                            last_ping = now
            except Exception:
                time.sleep(self._reconnect_seconds)
            finally:
                if ws is not None:
                    try:
                        ws.close()
                    except Exception:
                        pass


def main() -> int:
    args = _parse_args()

    if args.list_devices_json:
        _list_devices_json()
        return 0

    if args.list_devices:
        _list_devices()
        return 0

    # Heavy imports are delayed to avoid slowing down device listing.
    global np
    import numpy as np

    if not args.vad and args.overlap_seconds >= args.chunk_seconds:
        print("overlap-seconds must be smaller than chunk-seconds", file=sys.stderr)
        return 2

    if args.vad and args.samplerate not in (8000, 16000):
        print("Silero VAD supports samplerate 8000 or 16000. Please resample or set --samplerate.", file=sys.stderr)
        return 2

    ws_sender = None
    if args.ws_url:
        try:
            import websocket  # type: ignore
        except ImportError:
            print(
                "Missing dependency: websocket-client. Install it with: pip install websocket-client",
                file=sys.stderr,
            )
            return 1
        ws_sender = _WebSocketSender(
            args.ws_url,
            args.ws_reconnect_seconds,
            args.ws_timeout,
            args.ws_ping_seconds,
        )

    model = None
    interim_model = None
    device = None
    fp16 = False
    whispercpp_bin = ""

    if args.backend == "whispercpp":
        if args.interim or args.interim_model:
            print("backend=whispercpp does not support --interim or --interim-model", file=sys.stderr)
            return 2
        if args.fp16:
            print("warning: --fp16 is ignored for backend=whispercpp", file=sys.stderr)
        if args.device != "auto":
            print("warning: --device is ignored for backend=whispercpp", file=sys.stderr)
        if not args.whispercpp_bin or not args.whispercpp_model:
            print("backend=whispercpp requires --whispercpp-bin and --whispercpp-model", file=sys.stderr)
            return 2
        whispercpp_bin = _resolve_whispercpp_bin(args.whispercpp_bin)
        if not os.path.exists(whispercpp_bin):
            print(f"whisper.cpp binary not found: {args.whispercpp_bin}", file=sys.stderr)
            return 2
        if not os.path.exists(args.whispercpp_model):
            print(f"whisper.cpp model not found: {args.whispercpp_model}", file=sys.stderr)
            return 2
    else:
        import whisper

        device = _resolve_whisper_device(args.device)
        model = whisper.load_model(args.model, device=device)
        if args.interim and args.interim_model:
            interim_model = whisper.load_model(args.interim_model, device=device)

        fp16 = args.fp16
        if device == "cpu":
            fp16 = False

    model_label = args.model
    if args.backend == "whispercpp":
        model_label = os.path.basename(args.whispercpp_model or "")
    transcribe_lock = threading.Lock()
    interim_transcribe_lock = transcribe_lock if interim_model is None else threading.Lock()

    q: queue.Queue[np.ndarray] = queue.Queue()

    blocksize = int(args.samplerate * args.block_seconds)
    chunk_samples = int(args.samplerate * args.chunk_seconds)
    overlap_samples = int(args.samplerate * args.overlap_seconds)

    def _write_wav(path: str, samples: np.ndarray) -> None:
        if samples.size == 0:
            return
        clipped = np.clip(samples, -1.0, 1.0)
        pcm = (clipped * 32767).astype(np.int16)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(args.samplerate)
            wf.writeframes(pcm.tobytes())

    def _transcribe_whispercpp(audio: np.ndarray) -> str:
        if audio.size == 0:
            return ""
        with tempfile.TemporaryDirectory() as tmpdir:
            wav_path = os.path.join(tmpdir, "audio.wav")
            out_prefix = os.path.join(tmpdir, "out")
            _write_wav(wav_path, audio)
            cmd = [
                whispercpp_bin,
                "-m",
                args.whispercpp_model,
                "-f",
                wav_path,
                "-otxt",
                "-of",
                out_prefix,
            ]
            if args.language:
                cmd += ["-l", args.language]
            if args.task == "translate":
                cmd += ["-tr"]
            if args.whispercpp_threads:
                cmd += ["-t", str(args.whispercpp_threads)]
            if args.whispercpp_extra_args:
                cmd += args.whispercpp_extra_args
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            if proc.returncode != 0:
                print(
                    "whisper.cpp failed.\n"
                    f"command: {' '.join(cmd)}\n"
                    f"stdout:\n{proc.stdout}\n"
                    f"stderr:\n{proc.stderr}",
                    file=sys.stderr,
                )
                return ""
            txt_path = out_prefix + ".txt"
            if not os.path.exists(txt_path):
                print("whisper.cpp did not produce a .txt output.", file=sys.stderr)
                return ""
            with open(txt_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read().strip()

    def transcribe_final(audio: np.ndarray) -> str:
        if args.backend == "whispercpp":
            return _transcribe_whispercpp(audio)
        result = model.transcribe(
            audio,
            language=args.language,
            task=args.task,
            fp16=fp16,
            no_speech_threshold=args.no_speech_threshold,
            logprob_threshold=args.logprob_threshold,
            compression_ratio_threshold=args.compression_ratio_threshold,
            temperature=args.temperature,
        )
        return (result.get("text") or "").strip()

    def transcribe_interim(audio: np.ndarray) -> str:
        if args.backend == "whispercpp":
            return ""
        target = interim_model or model
        result = target.transcribe(
            audio,
            language=args.language,
            task=args.task,
            fp16=fp16,
            no_speech_threshold=args.no_speech_threshold,
            logprob_threshold=args.logprob_threshold,
            compression_ratio_threshold=args.compression_ratio_threshold,
            temperature=args.temperature,
        )
        return (result.get("text") or "").strip()

    def callback(indata: np.ndarray, frames: int, t: sd.CallbackTime, status: sd.CallbackFlags) -> None:
        if status:
            print(status, file=sys.stderr)
        # Keep a bounded queue to avoid unbounded memory growth.
        if q.qsize() >= args.max_queue:
            try:
                q.get_nowait()
            except queue.Empty:
                pass
        q.put(indata.copy())

    buffer = np.zeros(0, dtype=np.float32)

    if args.vad:
        try:
            from silero_vad import VADIterator, load_silero_vad
        except ImportError:
            print(
                "Missing dependency: silero-vad. Install it with: pip install silero-vad torchaudio",
                file=sys.stderr,
            )
            return 1

        vad_model = load_silero_vad()
        vad_iterator = VADIterator(
            vad_model,
            threshold=args.vad_threshold,
            sampling_rate=args.samplerate,
            min_silence_duration_ms=args.vad_end_ms,
            speech_pad_ms=args.vad_pre_roll_ms,
        )
        window_size_samples = 512 if args.samplerate == 16000 else 256
        pre_roll_frames = int(np.ceil((args.vad_pre_roll_ms / 1000) * args.samplerate / window_size_samples))
        min_samples = int(args.vad_min_seconds * args.samplerate)
        max_samples = int(args.vad_max_seconds * args.samplerate) if args.vad_max_seconds > 0 else 0

        ring: deque[np.ndarray] = deque(maxlen=pre_roll_frames)
        speech_frames: list[np.ndarray] = []
        vad_buffer = np.zeros(0, dtype=np.float32)
        in_speech = False

        def flush_segment() -> None:
            nonlocal speech_frames
            if not speech_frames:
                return
            segment = np.concatenate(speech_frames)
            speech_frames = []
            if min_samples and segment.shape[0] < min_samples:
                return
            with transcribe_lock:
                text = transcribe_final(segment)
            emit_final(text, "vad", segment.shape[0])

        def process_vad(samples: np.ndarray) -> None:
            nonlocal vad_buffer, in_speech, speech_frames
            vad_buffer = np.concatenate([vad_buffer, samples])
            while vad_buffer.shape[0] >= window_size_samples:
                frame = vad_buffer[:window_size_samples]
                vad_buffer = vad_buffer[window_size_samples:]

                if not in_speech:
                    ring.append(frame)

                event = vad_iterator(frame)
                if event and "start" in event:
                    in_speech = True
                    speech_frames = list(ring)
                    ring.clear()
                    speech_frames.append(frame)
                elif in_speech:
                    speech_frames.append(frame)

                if in_speech and event and "end" in event:
                    in_speech = False
                    flush_segment()

                if in_speech and max_samples and (len(speech_frames) * window_size_samples) >= max_samples:
                    in_speech = False
                    flush_segment()
                    vad_iterator.reset_states()
                    ring.clear()

    interim_buffer = None
    interim_lock = threading.Lock()
    stop_event = threading.Event()
    interim_thread = None
    last_interim_len = 0
    last_interim_text = ""
    seq = 0
    interim_seq = 0
    suppress_interim_until = 0.0
    last_final_text = ""
    last_final_time = 0.0

    def emit_final(text: str, source: str, samples_len: int) -> None:
        nonlocal seq, last_interim_text, suppress_interim_until, last_final_text, last_final_time
        if not text or _is_excluded(text, args.exclude):
            return
        if args.interim:
            _clear_interim_line()
            last_interim_text = ""
            now = time.time()
            suppress_interim_until = now + max(args.interim_seconds * 2.0, 1.2)
            last_final_text = text
            last_final_time = now
            if interim_buffer is not None:
                with interim_lock:
                    interim_buffer.clear()
        print(text, flush=True)
        if ws_sender is not None:
            seq += 1
            payload = {
                "type": "transcript",
                "id": str(uuid.uuid4()),
                "seq": seq,
                "timestamp_ms": int(time.time() * 1000),
                "text": text,
                "is_interim": False,
                "source": source,
                "model": model_label,
                "language": args.language,
                "task": args.task,
                "sample_rate": args.samplerate,
                "duration_ms": int(samples_len / args.samplerate * 1000),
            }
            ws_sender.send(payload)

    def interim_loop() -> None:
        nonlocal last_interim_len, last_interim_text, interim_seq, suppress_interim_until, last_final_text, last_final_time
        min_samples = int(args.interim_min_seconds * args.samplerate)
        while not stop_event.is_set():
            time.sleep(args.interim_seconds)
            if time.time() < suppress_interim_until:
                continue
            with interim_lock:
                audio = interim_buffer.get() if interim_buffer else np.zeros(0, dtype=np.float32)
            if audio.size < min_samples:
                continue
            with interim_transcribe_lock:
                text = transcribe_interim(audio)
            if text and not _is_excluded(text, args.exclude):
                if last_final_text:
                    recent_window = max(args.interim_window_seconds, 2.5)
                    if time.time() - last_final_time < recent_window:
                        if text in last_final_text or last_final_text in text:
                            continue
                padded = text + (" " * max(0, last_interim_len - len(text)))
                last_interim_len = max(last_interim_len, len(text))
                sys.stderr.write("\r" + padded)
                sys.stderr.flush()
                if ws_sender is not None and text != last_interim_text:
                    last_interim_text = text
                    interim_seq += 1
                    ws_sender.send(
                        {
                            "type": "transcript",
                            "id": "interim",
                            "seq": interim_seq,
                            "timestamp_ms": int(time.time() * 1000),
                            "text": text,
                            "is_interim": True,
                            "source": "interim",
                            "model": args.interim_model or model_label,
                            "language": args.language,
                            "task": args.task,
                            "sample_rate": args.samplerate,
                            "duration_ms": int(audio.size / args.samplerate * 1000),
                        }
                    )

    print("Listening... press Ctrl+C to stop", file=sys.stderr)
    with sd.InputStream(
        samplerate=args.samplerate,
        channels=1,
        dtype="float32",
        device=args.mic,
        blocksize=blocksize,
        callback=callback,
    ):
        if args.interim:
            interim_buffer = _RollingBuffer(args.interim_window_seconds, args.samplerate)
            interim_thread = threading.Thread(target=interim_loop, daemon=True)
            interim_thread.start()
        try:
            while True:
                data = q.get()
                if data.ndim > 1:
                    data = data[:, 0]

                if args.interim and interim_buffer is not None:
                    with interim_lock:
                        interim_buffer.add(data)

                if args.vad:
                    process_vad(data)
                else:
                    buffer = np.concatenate([buffer, data])

                    if buffer.shape[0] < chunk_samples:
                        continue

                    chunk = buffer[:chunk_samples]
                    buffer = buffer[chunk_samples - overlap_samples :]

                    with transcribe_lock:
                        text = transcribe_final(chunk)
                    emit_final(text, "chunk", chunk.shape[0])
        except KeyboardInterrupt:
            if args.interim:
                _clear_interim_line()
            print("\nStopped", file=sys.stderr)
            stop_event.set()
            if interim_thread:
                interim_thread.join(timeout=1.0)
            if ws_sender is not None:
                ws_sender.close()
            time.sleep(0.05)
            return 0

    stop_event.set()
    if interim_thread:
        interim_thread.join(timeout=1.0)
    if ws_sender is not None:
        ws_sender.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
