"""Tests for the WAV RMS / VAD helper in desktop-agent/app.py.

Run with: python -m pytest services/desktop-agent/test_vad.py -q
"""

import struct

import pytest

from app import _compute_wav_rms  # noqa: E402


def _make_wav(samples):
    """Build a minimal 44-byte RIFF/WAVE header + 16-bit mono PCM payload."""
    data_size = len(samples) * 2
    header = b"".join([
        b"RIFF",
        struct.pack("<I", 36 + data_size),
        b"WAVE",
        b"fmt ",
        struct.pack("<I", 16),
        struct.pack("<H", 1),
        struct.pack("<H", 1),
        struct.pack("<I", 16000),
        struct.pack("<I", 32000),
        struct.pack("<H", 2),
        struct.pack("<H", 16),
        b"data",
        struct.pack("<I", data_size),
    ])
    body = struct.pack(f"<{len(samples)}h", *samples)
    return header + body


def test_rms_zero_for_empty_bytes():
    assert _compute_wav_rms(b"") == 0


def test_rms_zero_for_header_only():
    assert _compute_wav_rms(_make_wav([])) == 0


def test_rms_zero_for_pure_silence():
    silent = _make_wav([0] * 1000)
    assert _compute_wav_rms(silent) == 0


def test_rms_low_for_quiet_background_noise():
    # +/- 50 sample amplitude — well below the default 250 threshold
    noise = _make_wav([50 if i % 2 == 0 else -50 for i in range(1000)])
    rms = _compute_wav_rms(noise)
    assert 0 < rms < 250


def test_rms_high_for_loud_speech_like_signal():
    # +/- 8000 amplitude — clearly above the default threshold
    loud = _make_wav([8000 if i % 2 == 0 else -8000 for i in range(1000)])
    rms = _compute_wav_rms(loud)
    assert rms > 250


def test_rms_handles_odd_byte_count_gracefully():
    # Truncate one byte off the payload so sample_count rounds down
    truncated = _make_wav([1000] * 100)[:-1]
    rms = _compute_wav_rms(truncated)
    assert rms > 0
