#!/usr/bin/env python3
"""
Desktop agent sidecar for AgentFarm observability.

Runs a local HTTP server that executes desktop actions and returns a JSON blob
compatible with the TypeScript action interceptor pipeline.

Dependencies (install in sidecar venv):
  pip install pyautogui mss pywinauto
"""

from __future__ import annotations

import base64
import io
import json
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional

import mss
import pyautogui

# Optional: Accessibility tree capture (Windows)
try:
    from pywinauto import GetForegroundWindow
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False

# Optional: Accessibility tree capture (Linux)
try:
    import pyatspi
    HAS_PYATSPI = True
except ImportError:
    HAS_PYATSPI = False


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def screenshot_base64() -> str:
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        raw = mss.tools.to_png(shot.rgb, shot.size)
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def capture_accessibility_tree() -> Optional[Dict[str, Any]]:
    """
    Capture accessibility tree from active window.
    Returns structured accessibility data or None if unavailable.
    """
    if HAS_PYWINAUTO:
        try:
            window = GetForegroundWindow()
            if window:
                return {
                    "platform": "windows",
                    "windowTitle": window.window_text(),
                    "processName": window.process_name(),
                    "role": "window",
                    # Note: Full tree would require deeper introspection
                    # For now, return top-level window info
                }
        except Exception:  # pylint: disable=broad-except
            pass

    if HAS_PYATSPI:
        try:
            desktop = pyatspi.Registry.getDesktop(0)
            if desktop:
                window = desktop.get_childCount() > 0 and desktop[0] or None
                if window:
                    return {
                        "platform": "linux",
                        "windowName": window.get_name(),
                        "role": window.get_role_name(),
                        "childCount": window.get_childCount(),
                    }
        except Exception:  # pylint: disable=broad-except
            pass

    # Fallback: return None if accessibility tree unavailable
    return None


@dataclass
class DesktopActionRequest:
    agentId: str
    workspaceId: str
    taskId: str
    action: str
    target: str
    payload: Dict[str, Any]


class DesktopActionExecutor:
    @staticmethod
    def execute(action: DesktopActionRequest) -> Dict[str, Any]:
        started = time.time()
        before = screenshot_base64()
        before_accessibility = capture_accessibility_tree()

        success = True
        error_message: Optional[str] = None

        try:
            if action.action == "click":
                x = int(action.payload.get("x", 0))
                y = int(action.payload.get("y", 0))
                pyautogui.click(x=x, y=y)
            elif action.action == "keypress":
                key = str(action.payload.get("key", ""))
                pyautogui.press(key)
            elif action.action == "type":
                text = str(action.payload.get("text", ""))
                pyautogui.write(text, interval=0.01)
            else:
                raise ValueError(f"Unsupported desktop action: {action.action}")
        except Exception as exc:  # pylint: disable=broad-except
            success = False
            error_message = str(exc)

        after = screenshot_base64()
        after_accessibility = capture_accessibility_tree()
        completed = time.time()

        return {
            "actionId": str(uuid.uuid4()),
            "agentId": action.agentId,
            "workspaceId": action.workspaceId,
            "taskId": action.taskId,
            "type": "desktop",
            "action": action.action,
            "target": action.target,
            "payload": action.payload,
            "screenshotBefore": before,
            "screenshotAfter": after,
            "accessibilityTreeBefore": before_accessibility,
            "accessibilityTreeAfter": after_accessibility,
            "startedAt": datetime.fromtimestamp(started, tz=timezone.utc).isoformat(),
            "completedAt": datetime.fromtimestamp(completed, tz=timezone.utc).isoformat(),
            "durationMs": int((completed - started) * 1000),
            "success": success,
            "errorMessage": error_message,
            "riskLevel": "medium",
            "recordedAt": now_iso(),
        }


class SidecarHandler(BaseHTTPRequestHandler):
    def _json_response(self, status: int, body: Dict[str, Any]) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/execute":
            self._json_response(404, {"error": "not_found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            request = DesktopActionRequest(
                agentId=payload["agentId"],
                workspaceId=payload["workspaceId"],
                taskId=payload["taskId"],
                action=payload["action"],
                target=payload.get("target", ""),
                payload=payload.get("payload", {}),
            )
        except Exception as exc:  # pylint: disable=broad-except
            self._json_response(400, {"error": "invalid_request", "message": str(exc)})
            return

        result = DesktopActionExecutor.execute(request)
        self._json_response(200, result)


def run_sidecar(host: str = "127.0.0.1", port: int = 48755) -> None:
    server = HTTPServer((host, port), SidecarHandler)
    print(f"desktop sidecar listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_sidecar()
