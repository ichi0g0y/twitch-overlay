# WebSocket Transcript Spec

When `--ws-url` is provided, `mic_stream.py` sends one JSON message per finalized transcript
to the given WebSocket server. Messages are sent when text is printed (VAD segment or chunk).

## Message format

```json
{
  "type": "transcript",
  "id": "c1a4b0e8-8e1e-4f7a-8f7f-6a8c3f2e5c1a",
  "seq": 12,
  "timestamp_ms": 1737660000123,
  "text": "こんにちは",
  "is_interim": false,
  "source": "vad",
  "model": "small",
  "language": "ja",
  "task": "transcribe",
  "sample_rate": 16000,
  "duration_ms": 980
}
```

## Fields

- `type`: Always `"transcript"`.
- `id`: UUID per message.
- `seq`: Incrementing integer for this process.
- `timestamp_ms`: Unix epoch milliseconds at send time.
- `text`: Recognized text (final).
- `is_interim`: Always `false` in current implementation.
- `source`: `"vad"` or `"chunk"` depending on segmentation mode.
- `model`: Whisper model name used for final transcription.
- `language`: Language code if specified, otherwise `null`.
- `task`: `"transcribe"` or `"translate"`.
- `sample_rate`: Input sample rate.
- `duration_ms`: Duration of audio segment that produced this transcript.

## Notes

- The sender will reconnect if the WebSocket connection drops.
- Messages are sent in order per connection, but delivery is best-effort.
