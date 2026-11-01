# Synthetic audio fixtures

These are original 12-second, mono, 440 Hz test tones, not third-party recordings.
They exercise real decoding, visualization input, seeking and session restoration.

| File | Container and codec |
| --- | --- |
| tone.flac | Native FLAC, 16-bit, 16 kHz |
| tone.ogg, tone.oga | Ogg Vorbis, 16 kHz |
| voice.ogg, voice.opus | Ogg Opus, mono, voice encoding mode |
| tone.aac | AAC-LC in ADTS |
| tone.m4a | AAC-LC in MP4 |

Regenerate with `node scripts/generate-audio-fixtures.cjs`, with FFmpeg on PATH or
its executable path in `FFMPEG_PATH`. The generator is a development tool only.
`npm run test:audio` uses the checked-in samples and does not require FFmpeg.
The `test/` and `scripts/` directories are excluded from application packaging.
