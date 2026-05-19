#!/usr/bin/env python3
"""
join_meet.py -- Join Google Meet via Chrome DevTools Protocol (CDP).

Uses element selectors (not pixel coordinates) so it works regardless
of screen layout, resolution, or pop-ups.

Deploy to container:
  docker cp d:/AgentFarm/join_meet.py agentfarm-desktop-agent:/tmp/join_meet.py

Run:
  docker exec agentfarm-desktop-agent python3 /tmp/join_meet.py
"""

import json
import sys
import time
import urllib.request

import websocket  # pip: websocket-client>=1.7

CDP_URL = "http://localhost:9222"
AGENT_NAME = "AgentFarm"
MEET_PATTERN = "meet.google.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _http_get(path: str, timeout: int = 5):
    with urllib.request.urlopen(f"{CDP_URL}{path}", timeout=timeout) as r:
        return json.loads(r.read())


def _find_meet_tab(retries: int = 15, delay: float = 2.0):
    """Wait for a Meet tab to appear in Chrome's CDP tab list."""
    for attempt in range(retries):
        try:
            tabs = _http_get("/json")
            for tab in tabs:
                if MEET_PATTERN in tab.get("url", ""):
                    return tab
        except Exception as exc:
            print(f"  [CDP] Waiting for Chrome ({attempt + 1}/{retries}): {exc}")
        time.sleep(delay)
    return None


def _ws_eval(ws, js: str, msg_id: int, return_by_value: bool = True):
    """Send Runtime.evaluate over WebSocket and return the result value."""
    payload = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": js,
            "returnByValue": return_by_value,
            "awaitPromise": False,
        },
    }
    ws.send(json.dumps(payload))
    # Drain until we get our response (ignore events/notifications)
    for _ in range(20):
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            return msg.get("result", {}).get("result", {}).get("value", "")
    return "timeout"


# ---------------------------------------------------------------------------
# JavaScript helpers (injected into the Meet page)
# ---------------------------------------------------------------------------

_JS_FILL_NAME = """
(function() {
  var candidates = Array.from(
    document.querySelectorAll('input[type=text], input:not([type])')
  ).filter(function(el) {
    return el.offsetParent !== null;  // visible
  });

  // Prefer inputs whose placeholder/aria-label mentions "name"
  var nameEl = candidates.find(function(el) {
    var hint = (el.placeholder + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
    return hint.indexOf('name') !== -1;
  }) || candidates[0];

  if (!nameEl) return 'NO_INPUT';

  nameEl.focus();
  // Clear + set value the React-friendly way
  var nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  nativeInput.set.call(nameEl, '__AGENT_NAME__');
  nameEl.dispatchEvent(new Event('input',  { bubbles: true }));
  nameEl.dispatchEvent(new Event('change', { bubbles: true }));
  return 'filled:' + (nameEl.placeholder || nameEl.getAttribute('aria-label') || 'input');
})()
""".replace("__AGENT_NAME__", AGENT_NAME)

_JS_CLICK_JOIN = """
(function() {
  var allButtons = Array.from(
    document.querySelectorAll('button, [role=button]')
  );
  var joinBtn = allButtons.find(function(b) {
    var label = (b.textContent + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
    return /ask to join|join now|join meeting/.test(label);
  });
  if (!joinBtn) return 'NO_JOIN_BUTTON';
  joinBtn.click();
  return 'clicked:' + joinBtn.textContent.trim().slice(0, 40);
})()
"""

_JS_CHECK_IN_MEETING = """
(function() {
  // If the "Leave call" button is visible, we are in the meeting
  var allButtons = Array.from(document.querySelectorAll('button, [role=button]'));
  var leave = allButtons.find(function(b) {
    var label = (b.textContent + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
    return /leave|end call/.test(label);
  });
  return leave ? 'IN_MEETING' : 'NOT_IN_MEETING';
})()
"""


# ---------------------------------------------------------------------------
# Main join flow
# ---------------------------------------------------------------------------

def join_meet() -> bool:
    print("[JOIN] Waiting for Meet tab in Chrome...")
    tab = _find_meet_tab()
    if not tab:
        print("[JOIN] ERROR: Meet tab not found after 30s. Is Chrome running with --app=?")
        return False

    ws_url = tab.get("webSocketDebuggerUrl", "")
    if not ws_url:
        print("[JOIN] ERROR: No WebSocket debugger URL. Is --remote-debugging-port=9222 set?")
        return False

    print(f"[JOIN] Tab found: {tab.get('url', '')}")
    print(f"[JOIN] Connecting to CDP WebSocket...")

    ws = websocket.create_connection(ws_url, timeout=15)
    mid = 0

    # Wait for page to reach a state where the name input is visible
    print("[JOIN] Waiting for Meet UI to load (5s)...")
    time.sleep(5)

    # Step 1: Fill in the agent name
    mid += 1
    fill_result = _ws_eval(ws, _JS_FILL_NAME, mid)
    print(f"[JOIN] Name field: {fill_result}")

    if fill_result == "NO_INPUT":
        # Page may still be loading — wait and retry once
        print("[JOIN] Name input not found, waiting 5s more...")
        time.sleep(5)
        mid += 1
        fill_result = _ws_eval(ws, _JS_FILL_NAME, mid)
        print(f"[JOIN] Name field (retry): {fill_result}")

    time.sleep(1)

    # Step 2: Click the join button
    mid += 1
    join_result = _ws_eval(ws, _JS_CLICK_JOIN, mid)
    print(f"[JOIN] Join button: {join_result}")

    if "NO_JOIN_BUTTON" in str(join_result):
        print("[JOIN] Join button not found. Waiting 5s and retrying...")
        time.sleep(5)
        mid += 1
        join_result = _ws_eval(ws, _JS_CLICK_JOIN, mid)
        print(f"[JOIN] Join button (retry): {join_result}")

    ws.close()

    if "NO_JOIN_BUTTON" in str(join_result):
        print("[JOIN] FAILED: Could not find join button. Check noVNC screen manually.")
        return False

    print("[JOIN] Request sent -- waiting for host admission...")
    print("[JOIN] SUCCESS")
    return True


if __name__ == "__main__":
    ok = join_meet()
    sys.exit(0 if ok else 1)
