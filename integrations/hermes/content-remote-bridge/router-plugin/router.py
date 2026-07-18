"""Fixed Weixin orchestration for the fact-grounded Content OS CLI."""

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
from secrets import token_hex
from typing import Any

logger = logging.getLogger(__name__)

SESSION_TTL_HOURS = 24
FORBIDDEN_REPLY_MARKERS = ("/users/", "documents", "downloads", "private-backups", "../", "~\\")
LOCAL_PATH_PATTERN = re.compile(r"(?:^|[\s\"'`])(?:/Users/|/private/|~/|\.\./|[A-Za-z]:\\)", re.IGNORECASE)
SOURCE_INTENT = re.compile(r"^\s*基于这条素材(?:给我)?(?:三个内容方向|三个选题)\s*$")
INPUT_PATTERNS = (
    re.compile(r"^\s*这件事能写什么\s*[:：]?\s*(?P<input>.+?)\s*$", re.DOTALL),
    re.compile(r"^\s*给我三个内容方向\s*[:：]?\s*(?P<input>.+?)\s*$", re.DOTALL),
    re.compile(r"^\s*帮我想三个选题\s*[:：]?\s*(?P<input>.+?)\s*$", re.DOTALL),
    re.compile(r"^\s*/content-direction\s+(?P<input>.+?)\s*$", re.IGNORECASE | re.DOTALL),
    re.compile(r"^\s*/content-create\s+(?P<input>.+?)\s*$", re.IGNORECASE | re.DOTALL),
)
SELECTION_PATTERN = re.compile(r"^\s*(?:选\s*)?([123])\s*$")
RADAR_INTENT_PATTERN = re.compile(r"^\s*(?:从素材库找|从收藏库找|我收藏过哪些|在\s*obsidian\s*里找|看来源\s+\d+)", re.IGNORECASE)
PROJECT_READ_REQUEST_PATTERN = re.compile(
    r"(?:读取|查看|参考|看看).{0,12}(?:项目|资料|文档)|(?:去\s*)?(?:codex|项目).{0,12}(?:看看|查看|读取|参考)|资料.{0,12}(?:电脑|读取|查看)",
    re.IGNORECASE | re.DOTALL,
)
EXISTING_PROJECT_PATTERN = re.compile(r"我(?:已经)?(?:有|在做).{0,16}项目|已有.{0,12}项目", re.DOTALL)
PROJECT_READ_UNAVAILABLE_REPLY = "已记录你已有相关项目，但当前内容桥接尚未读取项目资料。请补充项目目前做到哪一步，或使用后续的授权项目读取入口。"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expires() -> str:
    return (_now() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()


def parse_selection(message: str) -> int | None:
    match = SELECTION_PATTERN.match(message or "")
    return int(match.group(1)) if match else None


def classify_message(message: str, platform: str) -> dict[str, str]:
    """Classify only protected bridge commands; radar phrases stay untouched."""
    if platform.lower() != "weixin":
        return {"action": "allow"}
    if SOURCE_INTENT.match(message or ""):
        return {"action": "bridge", "kind": "radar_source"}
    for pattern in INPUT_PATTERNS:
        match = pattern.match(message or "")
        if match:
            return {"action": "bridge", "kind": "topics", "input": match.group("input").strip()}
    return {"action": "allow"}


def is_radar_intent(message: str) -> bool:
    return bool(RADAR_INTENT_PATTERN.match(message or ""))


def filter_reply(value: object) -> str:
    text = str(value or "").strip()
    if any(marker in text.lower() for marker in FORBIDDEN_REPLY_MARKERS):
        return "为保护授权范围，此内容不能显示。"
    return text


class SessionStore:
    def __init__(self, root: str | Path, salt: str):
        self.root = Path(root)
        self.salt = salt
        self.root.mkdir(parents=True, exist_ok=True)

    def chat_hash(self, chat_id: str) -> str:
        return hashlib.sha256(f"{self.salt}:{chat_id}".encode("utf-8")).hexdigest()

    def _path(self, chat_hash: str) -> Path:
        return self.root / f"{chat_hash}.json"

    def write(self, session: dict[str, Any]) -> None:
        path = self._path(str(session["chatIdHash"]))
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(session, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(path)

    def create(self, chat_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        session = {
            "chatIdHash": self.chat_hash(chat_id),
            "rawInput": payload.get("rawInput", ""),
            "sourceMaterials": payload.get("sourceMaterials", []),
            "topics": payload.get("topics", []),
            "selectedTopic": payload.get("selectedTopic"),
            "factQuestions": payload.get("factQuestions", []),
            "factAnswers": payload.get("factAnswers", []),
            "unverifiedRequests": payload.get("unverifiedRequests", []),
            "detailMode": payload.get("detailMode"),
            "stage": payload.get("stage", "awaiting_input"),
            "createdAt": _now().isoformat(),
            "expiresAt": _expires(),
        }
        self.write(session)
        return session

    def load(self, chat_id: str) -> dict[str, Any] | None:
        path = self._path(self.chat_hash(chat_id))
        try:
            session = json.loads(path.read_text(encoding="utf-8"))
            if datetime.fromisoformat(session["expiresAt"]) <= _now():
                path.unlink(missing_ok=True)
                return None
            return session if isinstance(session, dict) else None
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            return None

    def cancel(self, chat_id: str) -> None:
        self._path(self.chat_hash(chat_id)).unlink(missing_ok=True)


def _hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))


def _runtime_config() -> dict[str, str]:
    path = _hermes_home() / "data" / "qixin-content-bridge" / "runtime.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {key: str(value) for key, value in payload.items() if isinstance(value, str)}
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def _store(config: dict[str, str]) -> SessionStore:
    salt = config.get("chatHashSalt") or token_hex(32)
    return SessionStore(_hermes_home() / "data" / "qixin-content-bridge" / "sessions", salt)


def _allowed(config: dict[str, str], chat_id: str) -> bool:
    owner_hash = config.get("allowedChatIdHash", "")
    return bool(owner_hash) and _store(config).chat_hash(chat_id) == owner_hash


def _wrapper_path() -> Path:
    return _hermes_home() / "skills" / "qixin" / "content-remote-bridge" / "scripts" / "content-remote-cli.sh"


def classify_cli_failure(returncode: int | None, stderr: str) -> str:
    """Reduce fixed-wrapper failures to safe operational categories only."""
    output = (stderr or "").lower()
    if returncode is None:
        return "provider_timeout"
    if "ark_api_key" in output or "ark_model_id" in output or "api key" in output:
        return "provider_not_configured"
    if "timed out" in output or "timeout" in output:
        return "provider_timeout"
    if "fetch failed" in output or "ark.cn-beijing" in output or "http " in output:
        return "provider_error"
    if "json" in output or "unexpected token" in output:
        return "invalid_provider_response"
    if returncode == 127 or "not found" in output or "cannot find module" in output or "no such file" in output:
        return "bridge_runtime_missing"
    return "provider_error"


def _run_cli(command: str, payload: dict[str, Any], config: dict[str, str]) -> dict[str, Any] | None:
    repository = config.get("contentOsRepo", "")
    wrapper = _wrapper_path()
    if command not in {"topics", "drafts"}:
        logger.warning("content bridge CLI failed: command=%s category=%s", command, "bridge_runtime_missing")
        return None
    if not repository:
        logger.warning("content bridge CLI failed: command=%s category=%s", command, "bridge_not_configured")
        return None
    if not wrapper.is_file():
        logger.warning("content bridge CLI failed: command=%s category=%s", command, "bridge_runtime_missing")
        return None
    environment = os.environ.copy()
    environment["CONTENT_OS_REMOTE_REPO"] = repository
    try:
        completed = subprocess.run(
            [str(wrapper), command], input=json.dumps(payload, ensure_ascii=False), text=True,
            capture_output=True, timeout=75, check=False, env=environment,
        )
        if completed.returncode != 0:
            logger.warning(
                "content bridge CLI failed: command=%s returncode=%s category=%s",
                command,
                completed.returncode,
                classify_cli_failure(completed.returncode, completed.stderr),
            )
            return None
        result = json.loads(completed.stdout)
        if not isinstance(result, dict) or result.get("status") != "ok":
            logger.warning("content bridge CLI failed: command=%s category=%s", command, "invalid_provider_response")
            return None
        return result
    except subprocess.TimeoutExpired:
        logger.warning("content bridge CLI failed: command=%s category=%s", command, classify_cli_failure(None, ""))
        return None
    except (ValueError, json.JSONDecodeError):
        logger.warning("content bridge CLI failed: command=%s category=%s", command, "invalid_provider_response")
        return None
    except OSError:
        logger.warning("content bridge CLI failed: command=%s category=%s", command, "bridge_runtime_missing")
        return None


def _safe_material(value: object) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    required = ("sourceId", "title", "sourceUrl", "excerpt")
    if any(not isinstance(value.get(key), str) or not value[key].strip() for key in required):
        return None
    candidate = {key: filter_reply(value.get(key, "")) for key in ("sourceId", "title", "author", "sourceUrl", "excerpt")}
    if not candidate["sourceId"].startswith("SRC-") or not candidate["sourceUrl"].startswith(("https://", "http://")):
        return None
    if any(item == "为保护授权范围，此内容不能显示。" for item in candidate.values()):
        return None
    return candidate


def _radar_handoff(chat_hash: str) -> dict[str, str] | None:
    path = _hermes_home() / "data" / "qixin-content-bridge" / "radar-handoffs" / f"{chat_hash}.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if datetime.fromisoformat(payload["expiresAt"]) <= _now():
            path.unlink(missing_ok=True)
            return None
        return _safe_material(payload.get("sourceMaterial"))
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        return None


def _render_topics(result: dict[str, Any]) -> str:
    topics = result.get("topics", [])
    if not isinstance(topics, list) or len(topics) != 3:
        return "当前素材暂时无法生成三个合格方向。"
    lines = ["可以从这三个方向写："]
    for index, topic in enumerate(topics, start=1):
        if not isinstance(topic, dict):
            return "当前素材暂时无法生成三个合格方向。"
        lines.extend([
            f"\n{index}｜{filter_reply(topic.get('title'))}",
            f"重点：{filter_reply(topic.get('difference'))}",
            f"为什么值得写：{filter_reply(topic.get('whyWorthWriting'))}",
            f"还缺的真实细节：{filter_reply(topic.get('missingInformation')) or '没有发布所必需的缺口。'}",
        ])
    lines.extend(["\n回复 1、2 或 3。", "回复“换一批”重新生成。", "回复“取消”结束本次创作。"])
    return filter_reply("\n".join(lines))


def _render_questions(session: dict[str, Any]) -> str:
    questions = session.get("factQuestions", [])[:3]
    lines = ["选题已记下。为了不补写没有发生的细节，还需要这些真实信息："]
    lines.extend(f"{index}｜{filter_reply(question)}" for index, question in enumerate(questions, start=1))
    lines.extend(["\n可以逐条或一次回答。", "回复“直接写短一点”可不补充直接生成。", "回复“生成三版”按已补充信息生成。", "回复“取消”结束本次创作。"])
    return filter_reply("\n".join(lines))


def _render_drafts(result: dict[str, Any]) -> str:
    names = {"record": "原事记录", "perspective": "克制判断", "concise": "最短表达"}
    drafts = result.get("drafts", [])
    if not isinstance(drafts, list) or not drafts:
        return "没有通过事实校验的草稿，请补充真实细节后再试。"
    lines = []
    for index, draft in enumerate(drafts, start=1):
        if not isinstance(draft, dict):
            continue
        lines.extend([f"{index}｜{names.get(draft.get('key'), '候选稿')}", filter_reply(draft.get("body")), f"状态：{filter_reply(draft.get('status'))}", ""])
    return filter_reply("\n".join(lines).strip())


def _deliver(gateway: Any, event: Any, response: str) -> None:
    adapter = gateway.adapters.get(event.source.platform)
    if adapter is not None:
        asyncio.get_running_loop().create_task(adapter.send(event.source.chat_id, filter_reply(response)))


def _begin_topics(chat_id: str, payload: dict[str, Any], store: SessionStore, config: dict[str, str]) -> str:
    result = _run_cli("topics", payload, config)
    if result is None:
        return "当前授权内容桥接暂不可用；未改用模板或其他工具。"
    session = store.create(chat_id, {
        "rawInput": payload["rawInput"], "sourceMaterials": payload["sourceMaterials"],
        "topics": result["topics"], "factQuestions": result.get("factQuestions", [])[:3],
        "factAnswers": [], "detailMode": None, "stage": "awaiting_topic_selection",
    })
    store.write(session)
    return _render_topics(result)


def _generate_drafts(chat_id: str, session: dict[str, Any], store: SessionStore, config: dict[str, str], detail_mode: str) -> str:
    selected = session.get("selectedTopic")
    if not isinstance(selected, dict):
        return "请先回复 1、2 或 3 选择方向。"
    result = _run_cli("drafts", {
        "rawInput": session["rawInput"], "sourceMode": "external_material" if session.get("sourceMaterials") else "personal_note",
        "sourceMaterials": session.get("sourceMaterials", []), "selectedTopic": selected,
        "factAnswers": session.get("factAnswers", [])[:3], "detailMode": detail_mode,
    }, config)
    if result is None:
        return "当前授权内容桥接暂不可用；未改用模板或其他工具。"
    session["detailMode"] = detail_mode
    session["stage"] = "drafts_ready"
    store.write(session)
    return _render_drafts(result)


def _record_unverified_project_request(message: str, session: dict[str, Any], store: SessionStore) -> str:
    if EXISTING_PROJECT_PATTERN.search(message) and "我已经有相关项目在做" not in session.get("factAnswers", []):
        session["factAnswers"] = (session.get("factAnswers", []) + ["我已经有相关项目在做"])[:3]
    request = {"text": "用户希望系统读取项目资料", "sourceStatus": "unverified_request"}
    if request not in session.get("unverifiedRequests", []):
        session["unverifiedRequests"] = (session.get("unverifiedRequests", []) + [request])[:3]
    store.write(session)
    return PROJECT_READ_UNAVAILABLE_REPLY


def _handle_active_session(message: str, chat_id: str, session: dict[str, Any], store: SessionStore, config: dict[str, str]) -> str | None:
    text = (message or "").strip()
    if text == "取消":
        store.cancel(chat_id)
        return "本次创作已取消。"
    if PROJECT_READ_REQUEST_PATTERN.search(text):
        return _record_unverified_project_request(text, session, store)
    if session.get("stage") == "awaiting_topic_selection":
        if text == "换一批":
            return _begin_topics(chat_id, {
                "rawInput": session["rawInput"], "sourceMode": "external_material" if session.get("sourceMaterials") else "personal_note",
                "sourceMaterials": session.get("sourceMaterials", []),
            }, store, config)
        selection = parse_selection(text)
        if selection is None:
            return "请回复 1、2 或 3 选择方向，也可以回复“换一批”或“取消”。"
        topics = session.get("topics", [])
        if selection > len(topics):
            return "当前会话中没有这个选题编号。"
        session["selectedTopic"] = topics[selection - 1]
        session["stage"] = "awaiting_fact_answers"
        store.write(session)
        return _render_questions(session)
    if session.get("stage") == "awaiting_fact_answers":
        if text == "直接写短一点":
            return _generate_drafts(chat_id, session, store, config, "sparse")
        if text == "生成三版":
            return _generate_drafts(chat_id, session, store, config, "enriched")
        if not text or LOCAL_PATH_PATTERN.search(text):
            return "请补充真实细节，不接受本机路径或文件内容。"
        answers = [line.strip().removeprefix(f"{index}.").strip() for index, line in enumerate(text.splitlines(), start=1) if line.strip()]
        session["factAnswers"] = (session.get("factAnswers", []) + answers)[:3]
        session["detailMode"] = "enriched"
        store.write(session)
        return "已记录真实补充。可以继续补充，或回复“生成三版”。"
    return None


def handle_pre_gateway_dispatch(event: Any, gateway: Any, **_: Any) -> dict[str, str] | None:
    platform = getattr(getattr(event.source, "platform", None), "value", "")
    if platform.lower() != "weixin":
        return None
    message = getattr(event, "text", "") or ""
    if is_radar_intent(message):
        return None
    chat_id = getattr(event.source, "chat_id", "")
    config = _runtime_config()
    store = _store(config)
    protected = classify_message(message, platform)
    active = store.load(chat_id) if _allowed(config, chat_id) else None
    selection = parse_selection(message)
    should_handle = protected.get("action") == "bridge" or active is not None or selection is not None
    if not should_handle:
        return None
    if not _allowed(config, chat_id):
        logger.warning("content bridge route rejected: category=%s", "authorization_failed")
        _deliver(gateway, event, "远程内容桥接尚未绑定授权微信账号。")
        return {"action": "skip", "reason": "qixin_content_remote_bridge_unauthorized"}
    if protected.get("kind") == "radar_source":
        material = _radar_handoff(store.chat_hash(chat_id))
        if material is None:
            response = "当前没有可用于创作的授权素材来源。请先使用“看来源 N”。"
        else:
            response = _begin_topics(chat_id, {"rawInput": "基于这条已授权外部素材生成内容方向。", "sourceMode": "external_material", "sourceMaterials": [material]}, store, config)
    elif protected.get("kind") == "topics":
        raw_input = protected.get("input", "")
        response = "不接受本机路径作为创作素材。" if LOCAL_PATH_PATTERN.search(raw_input) else _begin_topics(chat_id, {"rawInput": raw_input, "sourceMode": "personal_note", "sourceMaterials": []}, store, config)
    elif active is not None:
        response = _handle_active_session(message, chat_id, active, store, config) or "本次创作已经结束。请重新发送“这件事能写什么：素材”。"
    else:
        response = "当前没有进行中的创作会话。请先发送“这件事能写什么：素材”。"
    _deliver(gateway, event, response)
    logger.info("content bridge route handled: stage=%s", active.get("stage") if active else protected.get("kind"))
    return {"action": "skip", "reason": "qixin_content_remote_bridge"}
