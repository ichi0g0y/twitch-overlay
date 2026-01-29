#!/usr/bin/env python3
"""CLI audio transcription using OpenAI Whisper."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

import whisper


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Transcribe audio using OpenAI Whisper (CLI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("input", help="Path to audio/video file")
    p.add_argument(
        "-m",
        "--model",
        default="base",
        choices=[
            "tiny",
            "base",
            "small",
            "medium",
            "large",
            "large-v2",
            "large-v3",
        ],
        help="Whisper model size",
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


def main() -> int:
    args = _parse_args()

    if not os.path.exists(args.input):
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

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
