#!/usr/bin/env python3
"""CLI audio transcription using OpenAI Whisper."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Optional


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Transcribe audio using OpenAI Whisper (CLI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--backend",
        default="whisper",
        choices=["whisper", "whispercpp"],
        help="Transcription backend",
    )
    p.add_argument("input", help="Path to audio/video file")
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
        default=None,
        choices=["cpu", "cuda"],
        help="Force device (auto if omitted)",
    )
    p.add_argument(
        "--fp16",
        action="store_true",
        help="Use FP16 precision (CUDA only)",
    )
    p.add_argument(
        "-o",
        "--output",
        default=None,
        help="Output file path (default: stdout)",
    )
    p.add_argument(
        "--format",
        default="txt",
        choices=["txt", "json"],
        help="Output format",
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


def _write_output(text: str, data: dict, fmt: str, out_path: Optional[str]) -> None:
    if fmt == "json":
        payload = data
        content = json.dumps(payload, ensure_ascii=False, indent=2)
    else:
        content = text.strip() + "\n"

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
    else:
        sys.stdout.write(content)


def _resolve_whispercpp_bin(bin_path: str) -> str:
    if not bin_path:
        return ""
    if os.path.isfile(bin_path) and os.access(bin_path, os.X_OK):
        return bin_path
    resolved = shutil.which(bin_path)
    return resolved or bin_path


def _run_whispercpp_file(args: argparse.Namespace) -> dict:
    if not args.whispercpp_bin or not args.whispercpp_model:
        raise ValueError("backend=whispercpp requires --whispercpp-bin and --whispercpp-model")

    bin_path = _resolve_whispercpp_bin(args.whispercpp_bin)
    if not os.path.exists(bin_path):
        raise FileNotFoundError(f"whisper.cpp binary not found: {args.whispercpp_bin}")
    if not os.path.exists(args.whispercpp_model):
        raise FileNotFoundError(f"whisper.cpp model not found: {args.whispercpp_model}")

    with tempfile.TemporaryDirectory() as tmpdir:
        out_prefix = os.path.join(tmpdir, "out")
        cmd = [
            bin_path,
            "-m",
            args.whispercpp_model,
            "-f",
            args.input,
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
            raise RuntimeError(
                "whisper.cpp failed.\n"
                f"command: {' '.join(cmd)}\n"
                f"stdout:\n{proc.stdout}\n"
                f"stderr:\n{proc.stderr}"
            )

        txt_path = out_prefix + ".txt"
        if not os.path.exists(txt_path):
            raise RuntimeError(
                "whisper.cpp did not produce a .txt output. "
                "Ensure the binary supports -otxt and -of."
            )
        with open(txt_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read().strip()

    return {"text": text, "backend": "whispercpp"}


def main() -> int:
    args = _parse_args()

    if not os.path.exists(args.input):
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    if args.backend == "whispercpp":
        if args.device is not None:
            print("warning: --device is ignored for backend=whispercpp", file=sys.stderr)
        if args.fp16:
            print("warning: --fp16 is ignored for backend=whispercpp", file=sys.stderr)
        try:
            result = _run_whispercpp_file(args)
        except Exception as exc:
            print(str(exc), file=sys.stderr)
            return 2
        _write_output(result.get("text", ""), result, args.format, args.output)
        return 0

    import whisper
    model = whisper.load_model(args.model, device=args.device)

    # If device is CPU, avoid fp16; otherwise respect flag.
    fp16 = args.fp16
    if args.device == "cpu":
        fp16 = False

    result = model.transcribe(
        args.input,
        language=args.language,
        task=args.task,
        fp16=fp16,
    )

    _write_output(result.get("text", ""), result, args.format, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
