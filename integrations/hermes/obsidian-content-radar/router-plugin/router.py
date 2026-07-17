"""Deterministic Weixin entry point for the read-only Obsidian radar."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

NO_RESULT = "当前授权的 Obsidian 收藏库中没有找到相关素材。"
SERVICE_UNAVAILABLE = "当前授权的 Obsidian 收藏库检索暂不可用，请稍后重试。"
FORBIDDEN_REPLY_MARKERS = ("/users/", "documents", "downloads", "private-backups")
MAX_REPLY_EXCERPT_CHARS = 240
QUERY_PATTERNS = (
    re.compile(r"^\s*从素材库找\s*(?P<query>.+?)\s*$"),
    re.compile(r"^\s*从收藏库找\s*(?P<query>.+?)\s*$"),
    re.compile(r"^\s*我收藏过哪些\s*(?P<query>.+?)\s*$"),
    re.compile(r"^\s*在\s*obsidian\s*里找\s*(?P<query>.+?)\s*$", re.IGNORECASE),
    re.compile(r"^\s*/obsidian-content-radar(?:\s+(?P<query>.+?))?\s*$", re.IGNORECASE),
)
SOURCE_PATTERN = re.compile(r"^\s*看来源\s+(?P<number>[1-9]\d*)\s*$")
_recent_results: dict[str, list[dict[str, str]]] = {}


def classify_message(message: str, platform: str) -> dict[str, str]:
    """Return a fixed radar route only for protected Weixin intents."""
    if platform.lower() != "weixin":
        return {"action": "allow"}

    source_match = SOURCE_PATTERN.match(message or "")
    if source_match:
        return {"action": "radar", "text": f"/obsidian-content-radar 看来源 {source_match.group('number')}"}

    for pattern in QUERY_PATTERNS:
        match = pattern.match(message or "")
        if not match:
            continue
        query = (match.groupdict().get("query") or "").strip()
        if query:
            return {"action": "radar", "text": f"/obsidian-content-radar {query}"}
        return {"action": "radar", "text": "/obsidian-content-radar"}

    return {"action": "allow"}


def _skill_wrapper_path() -> Path:
    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    return hermes_home / "skills" / "qixin" / "obsidian-content-radar" / "scripts" / "radar-cli.sh"


def _radar_environment() -> dict[str, str]:
    environment = os.environ.copy()
    if environment.get("CONTENT_OS_RADAR_REPO"):
        return environment

    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    runtime_path = hermes_home / "data" / "qixin-content-radar" / "router-runtime.json"
    try:
        payload = json.loads(runtime_path.read_text(encoding="utf-8"))
        repository = Path(str(payload.get("contentOsRepo", ""))).resolve()
        if (repository / "package.json").is_file():
            environment["CONTENT_OS_RADAR_REPO"] = str(repository)
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return environment


def _safe_text(value: object) -> str:
    text = str(value or "").strip()
    if any(marker in text.lower() for marker in FORBIDDEN_REPLY_MARKERS):
        return ""
    return text


def _safe_url(value: object) -> str:
    url = _safe_text(value)
    if not url:
        return ""
    parsed = urlparse(url)
    return url if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def _display_item(item: dict[str, Any]) -> dict[str, str]:
    excerpt = _safe_text(item.get("excerpt"))[:MAX_REPLY_EXCERPT_CHARS]
    return {
        "sourceId": _safe_text(item.get("sourceId")),
        "title": _safe_text(item.get("title")),
        "author": _safe_text(item.get("author")),
        "sourcePlatform": _safe_text(item.get("sourcePlatform")),
        "savedAt": _safe_text(item.get("savedAt")),
        "relativePath": _safe_text(item.get("relativePath")),
        "sourceUrl": _safe_url(item.get("sourceUrl")),
        "excerpt": excerpt,
    }


def _record_authorized_source_handoff(event: Any, item: dict[str, str]) -> None:
    """Share only the selected, already-authorized source with the content bridge."""
    source_id = item.get("sourceId", "")
    source_url = item.get("sourceUrl", "")
    excerpt = item.get("excerpt", "")
    if not re.fullmatch(r"SRC-[A-Za-z0-9_-]{8,64}", source_id) or not source_url or not excerpt:
        return
    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    config_path = hermes_home / "data" / "qixin-content-bridge" / "runtime.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        salt = str(config.get("chatHashSalt", ""))
        if not salt:
            return
        chat_id = str(getattr(event.source, "chat_id", ""))
        chat_hash = hashlib.sha256(f"{salt}:{chat_id}".encode("utf-8")).hexdigest()
        material = {key: item.get(key, "") for key in ("sourceId", "title", "author", "sourceUrl", "excerpt")}
        handoff = {
            "sourceMaterial": material,
            "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        }
        handoff_dir = hermes_home / "data" / "qixin-content-bridge" / "radar-handoffs"
        handoff_dir.mkdir(parents=True, exist_ok=True)
        target = handoff_dir / f"{chat_hash}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(handoff, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(target)
    except (OSError, ValueError, json.JSONDecodeError):
        logger.warning("could not record authorized radar handoff")


def render_search_response(results: list[dict[str, Any]], query: str) -> str:
    safe_results = [_display_item(item) for item in results if isinstance(item, dict)]
    if not safe_results:
        return NO_RESULT

    lines = [f"当前授权的 Obsidian 收藏库中找到 {len(safe_results)} 条相关素材："]
    for index, item in enumerate(safe_results, start=1):
        lines.append(f"\n{index}｜{item['title'] or '未命名素材'}")
        if item["author"]:
            lines.append(f"作者：{item['author']}")
        if item["sourcePlatform"]:
            lines.append(f"来源：{item['sourcePlatform']}")
        if item["savedAt"]:
            lines.append(f"时间：{item['savedAt']}")
        if item["excerpt"]:
            lines.append(f"摘要：{item['excerpt']}")
        if item["relativePath"]:
            lines.append(f"位置：{item['relativePath']}")
    lines.append("\n回复“看来源 N”查看对应来源。")
    return "\n".join(lines)


def render_source_response(results: list[dict[str, str]], number: int) -> str:
    if number < 1 or number > len(results):
        return "当前会话中没有对应的收藏素材。"
    item = results[number - 1]
    lines = [f"{number}｜{item['title'] or '未命名素材'}"]
    if item["relativePath"]:
        lines.append(f"位置：{item['relativePath']}")
    if item["sourceUrl"]:
        lines.append(f"原始链接：{item['sourceUrl']}")
    if item["excerpt"]:
        lines.append(f"摘要：{item['excerpt']}")
    return "\n".join(lines)


def run_radar_search(query: str) -> list[dict[str, Any]] | None:
    wrapper = _skill_wrapper_path()
    try:
        completed = subprocess.run(
            [str(wrapper), "search", "--query", query, "--limit", "10"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
            env=_radar_environment(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return None
    results = payload.get("results") if isinstance(payload, dict) else None
    return results if isinstance(results, list) else None


def _session_key(event: Any) -> str:
    source = event.source
    platform = getattr(getattr(source, "platform", None), "value", "")
    return f"{platform}:{getattr(source, 'chat_id', '')}"


def _deliver(gateway: Any, event: Any, response: str) -> None:
    adapter = gateway.adapters.get(event.source.platform)
    if adapter is None:
        return
    asyncio.get_running_loop().create_task(adapter.send(event.source.chat_id, response))


def handle_pre_gateway_dispatch(event: Any, gateway: Any, **_: Any) -> dict[str, str] | None:
    platform = getattr(getattr(event.source, "platform", None), "value", "")
    route = classify_message(getattr(event, "text", ""), platform)
    if route["action"] != "radar":
        return None

    key = _session_key(event)
    source_match = SOURCE_PATTERN.match(getattr(event, "text", "") or "")
    if source_match:
        source_number = int(source_match.group("number"))
        sources = _recent_results.get(key, [])
        response = render_source_response(sources, source_number)
        if 1 <= source_number <= len(sources):
            _record_authorized_source_handoff(event, sources[source_number - 1])
    else:
        query = route["text"].removeprefix("/obsidian-content-radar").strip()
        if not query:
            response = "请使用 /obsidian-content-radar X 进行授权收藏库检索。"
        else:
            results = run_radar_search(query)
            if results is None:
                response = SERVICE_UNAVAILABLE
            else:
                _recent_results[key] = [_display_item(item) for item in results if isinstance(item, dict)]
                response = render_search_response(results, query)

    _deliver(gateway, event, response)
    logger.info("qixin radar route handled: platform=%s result_length=%d", platform, len(response))
    return {"action": "skip", "reason": "qixin_obsidian_radar_router"}
