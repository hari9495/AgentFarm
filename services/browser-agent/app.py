import os
import re
import time
import uuid
import logging
import json
import subprocess
from typing import Any, cast
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
BROWSER_TIMEOUT_MS = int(os.environ.get("BROWSER_TIMEOUT_MS", "120000"))
MAX_BROWSER_STEPS = int(os.environ.get("MAX_BROWSER_STEPS", "15"))


# ---------------------------------------------------------------------------
# agent-browser CLI helpers (primary path)
# ---------------------------------------------------------------------------

def _run_ab(args: list[str], session_id: str, timeout_sec: int = 15) -> dict[str, Any]:
    """
    Run an agent-browser CLI command with --json output.
    Raises RuntimeError on non-zero exit or JSON parse failure.
    """
    cmd = ["agent-browser", "--session", session_id, "--json"] + args
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:300] or f"exit {r.returncode}")
    text = (r.stdout or "").strip()
    return json.loads(text) if text else {}


def _ab_llm_decide(snapshot_text: str, goal: str, history: list[dict[str, Any]], client: Any) -> dict[str, Any]:
    """
    Ask Claude to pick the next action from the accessibility-tree snapshot.
    Returns a parsed dict with keys: action, ref, value, url, result.
    """
    history_note = ""
    if history:
        recent = history[-4:]
        history_note = "\nRecent actions:\n" + "\n".join(
            f"  {h['action']} {h.get('target', h.get('ref', ''))} ok={h['ok']}"
            for h in recent
        )

    prompt = (
        f"Goal: {goal}\n\n"
        f"Current page interactive elements:\n{snapshot_text}\n"
        f"{history_note}\n\n"
        "Choose ONE next action. Return ONLY a JSON object (no markdown):\n"
        '{"action":"click","ref":"@eN"}\n'
        '{"action":"fill","ref":"@eN","value":"text"}\n'
        '{"action":"navigate","url":"https://..."}\n'
        '{"action":"done","result":"summary of what was accomplished"}'
    )

    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    # Strip markdown fences if the model adds them
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]).strip() if len(lines) > 2 else ""
    return json.loads(raw)


def _agent_browser_task(goal: str, allowed_domain: str | None) -> dict[str, Any]:
    """
    Primary browser automation using agent-browser CLI.
    Uses accessibility-tree snapshots so the LLM works with structured text
    instead of screenshots — more reliable and cheaper per call.

    Raises RuntimeError/Exception on failure so the caller can fall back
    to the Playwright path.
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("agent-browser path requires ANTHROPIC_API_KEY")

    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError(f"anthropic not available: {exc}")

    urls = re.findall(r'https?://[^\s"\' <>]+', goal)
    if not urls:
        raise RuntimeError("No URL found in goal")

    url = urls[0]
    session_id = f"af-{uuid.uuid4().hex[:8]}"
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    steps: list[dict[str, Any]] = []
    result_value = ""

    try:
        # 1. Open browser and navigate
        open_args: list[str] = ["open", url]
        if allowed_domain:
            open_args += ["--allowed-domains", allowed_domain]
        _run_ab(open_args, session_id, timeout_sec=30)
        steps.append({"action": "navigate", "target": url, "ok": True,
                      "durationMs": 0, "timestamp": _now()})
        logger.info("agent-browser session=%s opened url=%s", session_id, url)

        # 2. Vision loop: snapshot → LLM decides → execute
        for step_num in range(MAX_BROWSER_STEPS):
            # Get accessibility tree
            try:
                snap_result = _run_ab(["snapshot", "-i"], session_id, timeout_sec=15)
            except Exception as exc:
                steps.append({"action": "snapshot", "ok": False,
                              "errorMessage": str(exc), "timestamp": _now()})
                break

            snapshot_text = (
                snap_result.get("data", {}).get("snapshot", "")
                or str(snap_result)
            ).strip()

            if not snapshot_text:
                steps.append({"action": "snapshot", "ok": False,
                              "errorMessage": "empty snapshot", "timestamp": _now()})
                break

            # LLM picks next action
            try:
                decision = _ab_llm_decide(snapshot_text, goal, steps, client)
            except Exception as exc:
                steps.append({"action": "llm_decide", "ok": False,
                              "errorMessage": str(exc), "timestamp": _now()})
                break

            action = decision.get("action", "done")
            t0 = time.monotonic()

            if action == "done":
                result_value = decision.get("result", "Task completed")
                steps.append({"action": "done", "value": result_value, "ok": True,
                              "durationMs": 0, "timestamp": _now()})
                logger.info("agent-browser session=%s done at step=%d", session_id, step_num)
                break

            elif action == "click":
                ref = decision.get("ref", "")
                try:
                    _run_ab(["click", ref], session_id, timeout_sec=10)
                    steps.append({"action": "click", "target": ref, "ok": True,
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})
                except Exception as exc:
                    steps.append({"action": "click", "target": ref, "ok": False,
                                  "errorMessage": str(exc),
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})

            elif action == "fill":
                ref = decision.get("ref", "")
                value = decision.get("value", "")
                try:
                    _run_ab(["fill", ref, value], session_id, timeout_sec=10)
                    steps.append({"action": "type", "target": ref, "value": value, "ok": True,
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})
                except Exception as exc:
                    steps.append({"action": "type", "target": ref, "ok": False,
                                  "errorMessage": str(exc),
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})

            elif action == "navigate":
                nav_url = decision.get("url", "")
                nav_args: list[str] = ["open", str(nav_url)]
                if allowed_domain:
                    nav_args += ["--allowed-domains", allowed_domain]
                try:
                    _run_ab(nav_args, session_id, timeout_sec=20)
                    steps.append({"action": "navigate", "target": nav_url, "ok": True,
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})
                except Exception as exc:
                    steps.append({"action": "navigate", "target": nav_url, "ok": False,
                                  "errorMessage": str(exc),
                                  "durationMs": int((time.monotonic() - t0) * 1000),
                                  "timestamp": _now()})

        return {"steps": steps, "result": result_value or "Task completed", "error": None}

    finally:
        # Always close the browser session to free the daemon slot
        try:
            subprocess.run(
                ["agent-browser", "--session", session_id, "close"],
                capture_output=True, timeout=5,
            )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Level-2 path: our own accessibility-tree loop using Playwright
# Identical approach to agent-browser, but zero external dependency.
# If agent-browser is removed, deprecated, or changes its CLI, this takes over.
# ---------------------------------------------------------------------------

# Roles the LLM can interact with (click / fill)
_A11Y_INTERACTIVE = frozenset({
    "button", "link", "textbox", "searchbox", "combobox",
    "checkbox", "radio", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "switch", "tab",
    "spinbutton", "slider", "treeitem",
})
# Roles shown as context but not assigned refs
_A11Y_INFORMATIONAL = frozenset({"heading", "img", "row", "listitem", "cell"})
# Layout containers whose depth we collapse
_A11Y_LAYOUT = frozenset({"WebArea", "RootWebArea", "document", "generic", "none"})


def _format_a11y_snapshot(tree: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    """
    Flatten a Playwright accessibility tree into the same text format that
    agent-browser produces, assigning @eN refs to interactive elements.

    Returns:
        (snapshot_text, ref_map)
        ref_map: {"@e1": {"role": "button", "name": "Submit", "nth": 0}, ...}
    """
    if not tree:
        return "", {}

    lines: list[str] = []
    ref_map: dict[str, Any] = {}
    counter = [0]         # mutable so nested walk() can increment
    role_seen: dict[tuple[str, str], int] = {}  # (role, name) -> count for nth()

    def walk(node: dict[str, Any], depth: int = 0) -> None:
        role = node.get("role", "")
        name = (node.get("name") or "").strip()
        children: list[dict[str, Any]] = node.get("children") or []
        indent = "  " * depth

        if role in _A11Y_INTERACTIVE and name:
            counter[0] += 1
            ref = f"@e{counter[0]}"
            key = (role, name)
            nth = role_seen.get(key, 0)
            role_seen[key] = nth + 1
            ref_map[ref] = {"role": role, "name": name, "nth": nth}

            extra = ""
            if node.get("required"):
                extra += " (required)"
            if node.get("checked"):
                extra += " (checked)"
            if node.get("disabled"):
                extra += " (disabled)"
            if node.get("value"):
                extra += f' value="{node["value"]}"'
            lines.append(f'{indent}- {role} "{name}" [{ref}]{extra}')

        elif role in _A11Y_INFORMATIONAL and name:
            lines.append(f'{indent}- {role} "{name}"')

        next_depth = depth if role in _A11Y_LAYOUT else depth + 1
        for child in children:
            walk(child, next_depth)

    walk(tree)
    return "\n".join(lines), ref_map


def _playwright_a11y_task(goal: str, allowed_domain: str | None) -> dict[str, Any]:
    """
    Level-2 browser automation: our own accessibility-tree loop.

    Uses Playwright's page.accessibility.snapshot() instead of the
    agent-browser CLI binary.  The LLM sees the same snapshot text format
    and returns the same action schema — handled by the shared _ab_llm_decide().

    Raises on hard failure so the caller falls back to _playwright_task().
    """
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("playwright-a11y path requires ANTHROPIC_API_KEY")

    try:
        import anthropic
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(f"dependency not available: {exc}")

    urls = re.findall(r'https?://[^\s"\'<>]+', goal)
    if not urls:
        raise RuntimeError("No URL found in goal")

    client: Any = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    steps: list[dict[str, Any]] = []
    result_value = ""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        try:
            # 1. Initial navigation
            url = urls[0]
            t_nav = time.monotonic()
            page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
            steps.append({"action": "navigate", "target": url, "ok": True,
                          "durationMs": int((time.monotonic() - t_nav) * 1000),
                          "timestamp": _now()})
            logger.info("playwright-a11y opened url=%s", url)

            # 2. Vision loop: accessibility snapshot → LLM decides → Playwright executes
            for step_num in range(MAX_BROWSER_STEPS):
                page.wait_for_load_state("domcontentloaded")

                try:
                    tree: dict[str, Any] | None = cast(
                        dict[str, Any] | None,
                        getattr(page, "accessibility").snapshot(),
                    )
                    snapshot_text, ref_map = _format_a11y_snapshot(tree)
                except Exception as exc:
                    steps.append({"action": "snapshot", "ok": False,
                                  "errorMessage": str(exc), "timestamp": _now()})
                    break

                if not snapshot_text.strip():
                    steps.append({"action": "snapshot", "ok": False,
                                  "errorMessage": "empty snapshot", "timestamp": _now()})
                    break

                try:
                    decision = _ab_llm_decide(snapshot_text, goal, steps, client)
                except Exception as exc:
                    steps.append({"action": "llm_decide", "ok": False,
                                  "errorMessage": str(exc), "timestamp": _now()})
                    break

                action = decision.get("action", "done")
                t0 = time.monotonic()

                if action == "done":
                    result_value = decision.get("result", "Task completed")
                    steps.append({"action": "done", "value": result_value, "ok": True,
                                  "durationMs": 0, "timestamp": _now()})
                    logger.info("playwright-a11y done at step=%d", step_num)
                    break

                elif action == "click":
                    ref = decision.get("ref", "")
                    info = ref_map.get(ref)
                    if not info:
                        steps.append({"action": "click", "target": ref, "ok": False,
                                      "errorMessage": f"unknown ref {ref}",
                                      "timestamp": _now()})
                        continue
                    try:
                        page.get_by_role(info["role"], name=info["name"]).nth(info["nth"]).click(timeout=8000)
                        steps.append({"action": "click", "target": ref, "ok": True,
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})
                    except Exception as exc:
                        steps.append({"action": "click", "target": ref, "ok": False,
                                      "errorMessage": str(exc),
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})

                elif action == "fill":
                    ref = decision.get("ref", "")
                    value = decision.get("value", "")
                    info = ref_map.get(ref)
                    if not info:
                        steps.append({"action": "type", "target": ref, "ok": False,
                                      "errorMessage": f"unknown ref {ref}",
                                      "timestamp": _now()})
                        continue
                    try:
                        page.get_by_role(info["role"], name=info["name"]).nth(info["nth"]).fill(value, timeout=8000)
                        steps.append({"action": "type", "target": ref, "value": value, "ok": True,
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})
                    except Exception as exc:
                        steps.append({"action": "type", "target": ref, "ok": False,
                                      "errorMessage": str(exc),
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})

                elif action == "navigate":
                    nav_url = decision.get("url", "")
                    if allowed_domain and allowed_domain not in str(nav_url):
                        steps.append({"action": "navigate", "target": nav_url, "ok": False,
                                      "errorMessage": f"blocked by domain policy: {allowed_domain}",
                                      "timestamp": _now()})
                        continue
                    try:
                        page.goto(str(nav_url), wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
                        steps.append({"action": "navigate", "target": nav_url, "ok": True,
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})
                    except Exception as exc:
                        steps.append({"action": "navigate", "target": nav_url, "ok": False,
                                      "errorMessage": str(exc),
                                      "durationMs": int((time.monotonic() - t0) * 1000),
                                      "timestamp": _now()})

        finally:
            browser.close()

    return {"steps": steps, "result": result_value or "Task completed", "error": None}


# ---------------------------------------------------------------------------
# Level-3 path: DOM-based Playwright (original, most compatible)
# ---------------------------------------------------------------------------

def _playwright_task(goal: str, allowed_domain: str | None) -> dict[str, Any]:
    """
    Playwright-based browser automation.
    Used as fallback when agent-browser fails or is unavailable.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        return {"steps": [], "result": None, "error": f"playwright not available: {exc}"}

    steps: list[dict[str, Any]] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()

            if ANTHROPIC_API_KEY:
                result = _claude_driven_task(page, goal, allowed_domain, steps)
            else:
                result = _simple_navigate_extract(page, goal, allowed_domain, steps)

            browser.close()
            return {"steps": steps, "result": result, "error": None}

    except Exception as exc:
        logger.exception("playwright fallback task failed")
        steps.append({
            "action": "error",
            "ok": False,
            "errorMessage": str(exc),
            "timestamp": _now(),
        })
        return {"steps": steps, "result": None, "error": str(exc)}


# ---------------------------------------------------------------------------
# Dispatcher: 3-level fallback chain
# ---------------------------------------------------------------------------

def _run_browser_task(goal: str, allowed_domain: str | None) -> dict[str, Any]:
    """
    3-level fallback browser dispatcher.

    Level 1 — agent-browser CLI (external Rust binary, accessibility-tree,
               fastest; primary path).
    Level 2 — _playwright_a11y_task (our own clone of the same a11y-tree
               approach using Playwright's page.accessibility.snapshot();
               activates if agent-browser is unavailable, deprecated, or
               changes policy — zero external dependency).
    Level 3 — _playwright_task (original DOM-based Playwright with Claude;
               most compatible, handles edge cases where the a11y tree is
               sparse or malformed).
    """
    # ── Level 1: agent-browser CLI ──────────────────────────────────────────
    try:
        result = _agent_browser_task(goal, allowed_domain)
        if not result["steps"]:
            raise RuntimeError("agent-browser produced no steps")
        logger.info("browser-engine=agent-browser steps=%d", len(result["steps"]))
        return result
    except Exception as exc:
        logger.warning("browser-engine=agent-browser FAILED (%s) — trying a11y", exc)

    # ── Level 2: our own accessibility-tree loop (same approach, no ext dep) ─
    try:
        result = _playwright_a11y_task(goal, allowed_domain)
        if not result["steps"]:
            raise RuntimeError("playwright-a11y produced no steps")
        logger.info("browser-engine=playwright-a11y steps=%d", len(result["steps"]))
        return result
    except Exception as exc:
        logger.warning("browser-engine=playwright-a11y FAILED (%s) — trying DOM", exc)

    # ── Level 3: DOM-based Playwright (most compatible) ──────────────────────
    logger.info("browser-engine=playwright-dom")
    return _playwright_task(goal, allowed_domain)


def _simple_navigate_extract(page: Any, goal: str, allowed_domain: str | None, steps: list[dict[str, Any]]) -> str:
    """Fallback: navigate to a URL found in the goal and extract text content."""
    import re
    urls = re.findall(r'https?://[^\s"\'<>]+', goal)
    if not urls:
        steps.append({
            "action": "parse_goal",
            "ok": False,
            "errorMessage": "No URL found in goal",
            "timestamp": _now(),
        })
        return "No URL found in goal"

    url = urls[0]
    if allowed_domain and allowed_domain not in url:
        steps.append({
            "action": "domain_check",
            "target": url,
            "ok": False,
            "errorMessage": f"URL not in allowed domain: {allowed_domain}",
            "timestamp": _now(),
        })
        return f"URL blocked by allowed_domain policy: {allowed_domain}"

    t0 = time.monotonic()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
        content = page.inner_text("body")[:2000]
        duration_ms = int((time.monotonic() - t0) * 1000)
        steps.append({
            "action": "navigate",
            "target": url,
            "value": content[:200],
            "ok": True,
            "durationMs": duration_ms,
            "timestamp": _now(),
        })
        return content[:500]
    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        steps.append({
            "action": "navigate",
            "target": url,
            "ok": False,
            "errorMessage": str(exc),
            "durationMs": duration_ms,
            "timestamp": _now(),
        })
        return f"Navigation failed: {exc}"


def _claude_driven_task(page: Any, goal: str, allowed_domain: str | None, steps: list[dict[str, Any]]) -> str:
    """Drive the browser with Claude as the reasoning brain."""
    try:
        import anthropic
    except ImportError:
        return _simple_navigate_extract(page, goal, allowed_domain, steps)

    client: Any = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    system_prompt = (
        "You are a browser automation agent. You will be given a goal and must produce "
        "a sequence of browser actions as JSON. Each action must have: "
        '{"action": "navigate"|"click"|"type"|"extract"|"done", "target": "CSS selector or URL", "value": "text if typing"}. '
        "Return ONLY a JSON array of actions. Stop after 10 actions maximum."
    )
    if allowed_domain:
        system_prompt += f" Only interact with URLs on domain: {allowed_domain}."

    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": f"Goal: {goal}"}],
    )
    raw = response.content[0].text.strip()

    try:
        parsed: Any = json.loads(raw)
        actions: list[dict[str, Any]] = (
            cast(list[dict[str, Any]], parsed) if isinstance(parsed, list)
            else [{"action": "done", "value": str(raw)}]
        )
    except json.JSONDecodeError:
        actions = [{"action": "done", "value": str(raw)}]

    result_value: str = ""
    for act in actions[:10]:
        action_name = act.get("action", "unknown")
        target = act.get("target", "")
        value = act.get("value", "")
        t0 = time.monotonic()

        try:
            if action_name == "navigate":
                if allowed_domain and allowed_domain not in target:
                    steps.append({
                        "action": "navigate",
                        "target": target,
                        "ok": False,
                        "errorMessage": f"Blocked by domain policy: {allowed_domain}",
                        "timestamp": _now(),
                    })
                    continue
                page.goto(target, wait_until="domcontentloaded", timeout=BROWSER_TIMEOUT_MS)
                steps.append({
                    "action": "navigate",
                    "target": target,
                    "ok": True,
                    "durationMs": int((time.monotonic() - t0) * 1000),
                    "timestamp": _now(),
                })
            elif action_name == "click":
                page.click(target, timeout=10_000)
                steps.append({
                    "action": "click",
                    "target": target,
                    "ok": True,
                    "durationMs": int((time.monotonic() - t0) * 1000),
                    "timestamp": _now(),
                })
            elif action_name == "type":
                page.fill(target, value, timeout=10_000)
                steps.append({
                    "action": "type",
                    "target": target,
                    "value": value,
                    "ok": True,
                    "durationMs": int((time.monotonic() - t0) * 1000),
                    "timestamp": _now(),
                })
            elif action_name == "extract":
                extracted: str = str(page.inner_text(target, timeout=10_000))[:500]
                result_value = extracted
                steps.append({
                    "action": "extract",
                    "target": target,
                    "value": extracted[:200],
                    "ok": True,
                    "durationMs": int((time.monotonic() - t0) * 1000),
                    "timestamp": _now(),
                })
            elif action_name == "done":
                result_value = str(value)
                steps.append({
                    "action": "done",
                    "value": value[:200] if value else "",
                    "ok": True,
                    "durationMs": 0,
                    "timestamp": _now(),
                })
                break
        except Exception as exc:
            steps.append({
                "action": action_name,
                "target": target,
                "ok": False,
                "errorMessage": str(exc),
                "durationMs": int((time.monotonic() - t0) * 1000),
                "timestamp": _now(),
            })

    return result_value or "Task completed"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "browser-agent"})


@app.route("/run-task", methods=["POST"])
def run_task():
    data: dict[str, Any] = request.get_json(force=True) or {}
    goal = str(data.get("goal", "")).strip()
    allowed_domain = data.get("allowed_domain") or None
    task_id = data.get("task_id") or str(uuid.uuid4())

    if not goal:
        return jsonify({"error": "goal is required"}), 400

    logger.info("run-task task_id=%s goal_len=%d allowed_domain=%s", task_id, len(goal), allowed_domain)
    t0 = time.monotonic()
    outcome = _run_browser_task(goal, allowed_domain)
    duration_ms = int((time.monotonic() - t0) * 1000)

    status = "failed" if outcome["error"] else "completed"
    logger.info(
        "run-task task_id=%s status=%s steps=%d duration_ms=%d",
        task_id,
        status,
        len(outcome["steps"]),
        duration_ms,
    )

    return jsonify({
        "task_id": task_id,
        "status": status,
        "steps": outcome["steps"],
        "result": outcome["result"],
        "error": outcome["error"],
        "duration_ms": duration_ms,
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5002"))
    app.run(host="0.0.0.0", port=port)
