# SPDX-License-Identifier: Apache-2.0
"""Thin private stdio client for Bun's canonical Rust-validated Yolo surface.

No HTTP, model inference or probability policy lives in Python. A verified
Runtime owns the child, its bounded pipes, cancellation and handle lifetime.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Literal, TypedDict

from yolo_runtime import Runtime
from yolo_runtime import RuntimeError as NativeError

PROTOCOL = "bun.yolo/1"
MAX_BYTES = 1024 * 1024


class NoulQuestion(TypedDict, total=False):
    type: Literal["noul"]
    instructions: Any
    criteria: dict[str, Any] | None


class ChoiceQuestion(TypedDict):
    type: Literal["choice"]
    instructions: Any
    criteria: dict[str, Any]


class ScoreQuestion(TypedDict):
    type: Literal["score"]
    instructions: Any
    criteria: list[Any]


Question = NoulQuestion | ChoiceQuestion | ScoreQuestion


class Options(TypedDict, total=False):
    timeout: int
    maxRetries: int
    threshold: float


class Result(TypedDict):
    model: str
    answers: dict[str, dict[str, Any]]
    usage: dict[str, int] | None


class YoloError(Exception):
    def __init__(self, code: str, name: str = "Error"):
        super().__init__(code)
        self.code, self.name = code, name


def noul(
    instructions: Any = None, criteria: dict[str, Any] | None = None
) -> NoulQuestion:
    """Describe a question; Bun validates it when the operation runs."""
    return {"type": "noul", "instructions": instructions, "criteria": criteria}


def choice(instructions: Any, criteria: dict[str, Any]) -> ChoiceQuestion:
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def score(instructions: Any, criteria: list[Any]) -> ScoreQuestion:
    return {"type": "score", "instructions": instructions, "criteria": criteria}


class Yolo:
    """Borrow a verified supervisor and an explicitly selected Bun executable.

    One child per call. This instance accepts one active call; separate instances
    share the Runtime's native operation budget. It never closes the borrowed
    Runtime. Model credentials stay in environment, requests only in stdin.
    """

    def __init__(
        self,
        runtime: Runtime,
        bun: str | Path,
        *,
        transport_timeout_ms: int = 130000,
        env: dict[str, str] | None = None,
        revision: str | None = None,
    ):
        if (
            isinstance(transport_timeout_ms, bool)
            or not isinstance(transport_timeout_ms, int)
            or not 1 <= transport_timeout_ms <= 130000
        ):
            raise ValueError("transport_timeout_ms must be an integer in 1..130000")
        executable = Path(bun).expanduser()
        if not executable.is_absolute() or not executable.is_file():
            raise ValueError("An explicit existing Bun executable is required")
        runtime.require("process.stdin")
        runtime.require("process.wait")
        self.runtime, self.bun = runtime, str(executable.resolve())
        self.timeout, self.revision = transport_timeout_ms, revision
        self.env = {
            key: value
            for key in ("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH")
            if (value := os.environ.get(key))
        }
        # Explicit credentials are never copied to arguments, diagnostics or files.
        self.env.update(env or {})
        self._lock = threading.Lock()
        self._operation = None
        self._cancelled = threading.Event()

    def cancel(self) -> None:
        """Cancel the active native wait; its owner stops and joins the child."""
        self._cancelled.set()
        operation = self._operation
        if operation is not None:
            try:
                operation.cancel()
            except NativeError:
                # Completion may already have released this native operation.
                pass

    def _call(
        self, operation: str, *, _cancel: threading.Event | None = None, **payload: Any
    ) -> Any:
        if not self._lock.acquire(blocking=False):
            raise YoloError("ERR_YOLO_BUSY")
        self._cancelled = _cancel or threading.Event()
        try:
            if self._cancelled.is_set():
                raise YoloError("ERR_YOLO_CANCELLED")
            data = json.dumps(
                {"protocol": PROTOCOL, "operation": operation, **payload},
                ensure_ascii=False,
                allow_nan=False,
            ).encode("utf-8")
            if len(data) > MAX_BYTES:
                raise YoloError("ERR_YOLO_INPUT_LIMIT")
            worker = Path(__file__).with_name("yolo_worker.ts").resolve()
            with self.runtime.spawn(
                self.bun,
                (str(worker),),
                env=self.env,
                capture_limit=MAX_BYTES,
                stdin=True,
            ) as process:
                process.write_stdin(data)
                process.close_stdin()
                with process.wait_start() as pending:
                    self._operation = pending
                    if self._cancelled.is_set():
                        pending.cancel()
                    try:
                        pending.wait(self.timeout)
                    except NativeError as error:
                        pending.cancel()
                        process.stop(grace_ms=0)
                        try:
                            pending.wait(2000)
                        except NativeError:
                            pass
                        if self._cancelled.is_set():
                            raise YoloError("ERR_YOLO_CANCELLED") from None
                        if error.status == 5:
                            raise YoloError("ERR_YOLO_DEADLINE") from None
                        raise YoloError("ERR_YOLO_SUPERVISOR") from None
                    finally:
                        self._operation = None
                if self._cancelled.is_set():
                    raise YoloError("ERR_YOLO_CANCELLED")
                output = process.read()
                if len(output) > MAX_BYTES:
                    raise YoloError("ERR_YOLO_OUTPUT_LIMIT")
                try:
                    response = json.loads(output)
                except (ValueError, UnicodeDecodeError):
                    raise YoloError("ERR_YOLO_PROTOCOL") from None
                if (
                    not isinstance(response, dict)
                    or response.get("protocol") != PROTOCOL
                    or type(response.get("ok")) is not bool
                ):
                    raise YoloError("ERR_YOLO_PROTOCOL")
                if not response["ok"]:
                    # Native error values are bounded names/codes, never provider bodies.
                    error = response.get("error", {})
                    if (
                        not isinstance(error, dict)
                        or not isinstance(error.get("code"), str)
                        or not re.fullmatch(r"ERR_[A-Z0-9_]{1,96}", error["code"])
                        or not isinstance(error.get("name"), str)
                        or not re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,63}", error["name"])
                    ):
                        raise YoloError("ERR_YOLO_PROTOCOL")
                    raise YoloError(error["code"], error["name"])
                if process.status()["exit_code"] != 0 or not process.output_complete():
                    raise YoloError("ERR_YOLO_PROCESS")
                if (
                    self.revision is not None
                    and response.get("runtime", {}).get("revision") != self.revision
                ):
                    raise YoloError("ERR_YOLO_REVISION")
                if "result" not in response:
                    raise YoloError("ERR_YOLO_PROTOCOL")
                return response["result"]
        finally:
            self._operation = None
            self._lock.release()

    def inspect(
        self,
        state: Any,
        questions: dict[str, Question],
        *,
        model: str | None = None,
        options: Options | None = None,
        provider: dict[str, Any] | None = None,
    ) -> Result:
        request = {"state": state, "questions": questions}
        if model is not None:
            request["model"] = model
        return self._call(
            "inspect",
            request=request,
            options=options if options is not None else {},
            provider=provider,
        )

    system_one = inspect

    def decide(
        self,
        state: Any,
        questions: dict[str, Question],
        *,
        model: str | None = None,
        options: Options | None = None,
        provider: dict[str, Any] | None = None,
        _cancel: threading.Event | None = None,
    ) -> dict[str, bool | str | float]:
        request = {"state": state, "questions": questions}
        if model is not None:
            request["model"] = model
        return self._call(
            "decide",
            request=request,
            options=options if options is not None else {},
            provider=provider,
            _cancel=_cancel,
        )

    def value(
        self, answer: dict[str, Any], question: Question, threshold: float = 0.5
    ) -> bool | str | float:
        return self._call(
            "value", answer=answer, question=question, options={"threshold": threshold}
        )

    async def decide_async(
        self, *args: Any, **kwargs: Any
    ) -> dict[str, bool | str | float]:
        cancellation = threading.Event()
        task = asyncio.create_task(
            asyncio.to_thread(self.decide, *args, **kwargs, _cancel=cancellation)
        )
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            cancellation.set()
            if self._cancelled is cancellation:
                self.cancel()
            try:
                await task
            except YoloError:
                pass
            raise
