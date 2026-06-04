"""
ScreenShareController — Xvfb → FFmpeg → HLS pipeline for the desktop-agent.

Captures the virtual X display and writes HLS segments to /tmp/hls/ so any
platform adapter (Teams, Zoom, browser) can consume or relay the stream.

The HLS playlist is served by the Flask app at:
  GET /v1/screen-share/stream.m3u8     — live playlist
  GET /v1/screen-share/<segment>.ts    — individual segments

Usage:
    ctrl = ScreenShareController(display=':1', app_port=5003)
    ctrl.start(fps=15, width=1280, height=800)
    ctrl.status()   # → { active, pid, streamUrl, startedAt }
    ctrl.stop()
"""

from __future__ import annotations

import logging
import os
import subprocess
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

HLS_DIR = Path("/tmp/hls")
HLS_PLAYLIST = HLS_DIR / "screen.m3u8"
FFMPEG_LOG_FILE = Path("/tmp/ffmpeg-screenshare.log")


class ScreenShareController:
    """Manages a single FFmpeg x11grab → H.264/HLS pipeline.

    Thread-safe for concurrent start/stop/status calls from Flask's threaded
    request handlers.  Only one capture session may be active at a time — a
    second ``start()`` while one is already running returns an error dict
    without killing the current stream.
    """

    def __init__(self, display: str = ":1", app_port: int = 5003) -> None:
        self._display = display
        self._app_port = app_port
        self._proc: subprocess.Popen | None = None
        self._started_at: str | None = None
        self._stream_url: str | None = None
        self._fps: int = 15
        self._width: int = 1280
        self._height: int = 800
        self._lock = threading.Lock()

    # ── Public API ──────────────────────────────────────────────────────────

    def start(
        self,
        fps: int = 15,
        width: int = 1280,
        height: int = 800,
        segment_seconds: int = 2,
    ) -> dict:
        """Start the FFmpeg capture pipeline.

        Returns a dict with ``ok=True`` and stream metadata on success, or
        ``ok=False`` with an ``error`` string on failure.
        """
        fps = max(1, min(fps, 30))
        width = max(320, min(width, 3840))
        height = max(240, min(height, 2160))
        segment_seconds = max(1, min(segment_seconds, 10))

        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                return {
                    "ok": False,
                    "error": "Screen share already active",
                    "pid": self._proc.pid,
                    "streamUrl": self._stream_url,
                }

            HLS_DIR.mkdir(parents=True, exist_ok=True)
            # Remove stale segments and playlist from a previous session.
            for stale in HLS_DIR.glob("*.ts"):
                stale.unlink(missing_ok=True)
            HLS_PLAYLIST.unlink(missing_ok=True)

            # GOP size = fps × segment_seconds so each segment starts on a
            # keyframe, which is required for HLS to be seekable/joinable.
            gop = fps * segment_seconds

            cmd = [
                "ffmpeg", "-y",
                # Input: virtual X11 framebuffer
                "-f", "x11grab",
                "-video_size", f"{width}x{height}",
                "-framerate", str(fps),
                "-i", self._display,
                # Video codec: H.264 baseline, minimal latency
                "-vcodec", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-profile:v", "baseline",
                "-level", "3.1",
                "-pix_fmt", "yuv420p",
                "-g", str(gop),
                "-sc_threshold", "0",
                # HLS muxer
                "-hls_time", str(segment_seconds),
                "-hls_list_size", "6",
                "-hls_flags", "delete_segments+append_list",
                "-hls_segment_filename", str(HLS_DIR / "seg%05d.ts"),
                "-f", "hls",
                str(HLS_PLAYLIST),
            ]

            log_fh = FFMPEG_LOG_FILE.open("w")
            try:
                self._proc = subprocess.Popen(
                    cmd,
                    stdout=log_fh,
                    stderr=log_fh,
                    env={**os.environ, "DISPLAY": self._display},
                )
            except FileNotFoundError:
                log_fh.close()
                return {"ok": False, "error": "ffmpeg not found — is it installed?"}
            except Exception as exc:
                log_fh.close()
                return {"ok": False, "error": f"Failed to start FFmpeg: {exc}"}

            self._started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self._stream_url = (
                f"http://localhost:{self._app_port}/v1/screen-share/stream.m3u8"
            )
            self._fps = fps
            self._width = width
            self._height = height
            pid = self._proc.pid

        logger.info(
            "Screen share started: pid=%d display=%s %dx%d@%dfps",
            pid, self._display, width, height, fps,
        )
        return {
            "ok": True,
            "pid": pid,
            "streamUrl": self._stream_url,
            "startedAt": self._started_at,
            "fps": fps,
            "width": width,
            "height": height,
        }

    def stop(self) -> dict:
        """Stop the active FFmpeg pipeline.

        Idempotent — returns ``ok=True`` even when no pipeline was running.
        """
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                self._proc = None
                self._started_at = None
                self._stream_url = None
                return {"ok": True, "message": "No active screen share"}

            proc = self._proc
            pid = proc.pid
            self._proc = None
            self._started_at = None
            self._stream_url = None

        try:
            proc.terminate()
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
        except Exception as exc:
            return {"ok": False, "error": f"Error stopping FFmpeg (pid {pid}): {exc}"}

        logger.info("Screen share stopped: pid=%d", pid)
        return {"ok": True}

    def status(self) -> dict:
        """Return the current capture state as a JSON-serialisable dict."""
        with self._lock:
            active = self._proc is not None and self._proc.poll() is None
            return {
                "active": active,
                "pid": self._proc.pid if active else None,
                "streamUrl": self._stream_url if active else None,
                "startedAt": self._started_at if active else None,
                "fps": self._fps if active else None,
                "width": self._width if active else None,
                "height": self._height if active else None,
            }
