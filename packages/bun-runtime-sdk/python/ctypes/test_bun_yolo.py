# SPDX-License-Identifier: Apache-2.0
"""Transport/lifetime fixtures; the opt-in native gate separately uses Bun/Rust."""

import asyncio
import json
import os
import sys
import threading
import unittest

from bun_yolo import MAX_BYTES, PROTOCOL, Yolo, YoloError, choice, noul, score
from yolo_runtime import Runtime
from yolo_runtime import RuntimeError as NativeError


class Pending:
    def __init__(self, process):
        self.process = process

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.process.log.append("operation-close")

    def wait(self, timeout):
        self.process.started.set()
        if self.process.block:
            if self.process.cancelled.wait(timeout / 1000):
                raise NativeError("fixture cancellation", 4)
            raise NativeError("fixture timeout", 5)
        return {"state": 1, "exit_code": 0, "output_complete": True}

    def cancel(self):
        self.process.cancelled.set()
        self.process.log.append("cancel")


class Process:
    def __init__(self, output=None, block=False):
        self.output = (
            json.dumps(
                {
                    "protocol": PROTOCOL,
                    "ok": True,
                    "result": {"flag": False, "route": "docs", "amount": 1.25},
                    "runtime": {"revision": "a" * 40},
                }
            ).encode()
            if output is None
            else output
        )
        self.block, self.log, self.data = block, [], b""
        self.started, self.cancelled = threading.Event(), threading.Event()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.log.append("process-close")

    def write_stdin(self, data):
        self.log.append("stdin-write")
        self.data += data

    def close_stdin(self):
        self.log.append("stdin-close")

    def wait_start(self):
        self.log.append("wait-start")
        return Pending(self)

    def read(self):
        return self.output

    def status(self):
        return {"exit_code": 0}

    def output_complete(self):
        return True

    def stop(self, grace_ms):
        self.log.append("stop")


class Supervisor:
    def __init__(self, process=None, capabilities=("process.stdin", "process.wait")):
        self.process = process or Process()
        self.capabilities = capabilities
        self.spawned = []

    def require(self, capability):
        if capability not in self.capabilities:
            raise NativeError("Unsupported native capability")

    def spawn(self, *args, **kwargs):
        self.spawned.append((args, kwargs))
        return self.process


class ClientTransport(unittest.TestCase):
    def test_private_input_only_uses_stdin_and_false_stays_false(self):
        runtime = Supervisor()
        client = Yolo(
            runtime, sys.executable, env={"TYPESAFE_API_KEY": "synthetic-key"}
        )
        result = client.decide(
            {"curated": "synthetic-state"},
            {"flag": noul("False?")},
            options={"threshold": 0.9},
        )
        self.assertIs(result["flag"], False)
        self.assertEqual(result["amount"], 1.25)
        args, options = runtime.spawned[0]
        self.assertNotIn("synthetic-state", str(args))
        self.assertNotIn("synthetic-key", str(args))
        self.assertTrue(options["stdin"])
        self.assertEqual(options["capture_limit"], MAX_BYTES)
        self.assertEqual(
            json.loads(runtime.process.data)["options"], {"threshold": 0.9}
        )
        self.assertEqual(
            runtime.process.log,
            [
                "stdin-write",
                "stdin-close",
                "wait-start",
                "operation-close",
                "process-close",
            ],
        )

    def test_descriptors_keep_structured_entries_without_model_validation(self):
        entry = {"nested": [None, "docs"]}
        self.assertIs(noul(entry)["instructions"], entry)
        self.assertEqual(
            choice(None, {"docs": entry, "graph": None})["criteria"]["docs"], entry
        )
        self.assertEqual(score("support", [None, entry])["criteria"], [None, entry])

    def test_old_abi_is_refused_before_private_process_creation(self):
        runtime = Supervisor(capabilities=())
        with self.assertRaises(NativeError):
            Yolo(runtime, sys.executable)
        self.assertEqual(runtime.spawned, [])

    def test_transport_bounds_protocol_errors_and_revision_mismatch_close_handles(self):
        runtime = Supervisor()
        client = Yolo(runtime, sys.executable)
        with self.assertRaisesRegex(YoloError, "INPUT_LIMIT"):
            client.decide("x" * MAX_BYTES, {"flag": noul("?")})
        self.assertEqual(runtime.spawned, [])
        for output in (b"[]", b"invalid", b"x" * (MAX_BYTES + 1)):
            process = Process(output)
            with self.assertRaises(YoloError):
                Yolo(Supervisor(process), sys.executable).decide(
                    None, {"flag": noul("?")}
                )
            self.assertIn("process-close", process.log)
        with self.assertRaisesRegex(YoloError, "REVISION"):
            Yolo(runtime, sys.executable, revision="b" * 40).decide(
                None, {"flag": noul("?")}
            )

    def test_deadline_cancels_stops_and_releases_the_owned_process(self):
        process = Process(block=True)
        with self.assertRaisesRegex(YoloError, "DEADLINE"):
            Yolo(Supervisor(process), sys.executable, transport_timeout_ms=1).decide(
                None, {"flag": noul("?")}
            )
        self.assertIn("cancel", process.log)
        self.assertIn("stop", process.log)
        self.assertEqual(process.log[-2:], ["operation-close", "process-close"])

    def test_async_cancellation_joins_native_completion_without_polling(self):
        process = Process(block=True)
        client = Yolo(Supervisor(process), sys.executable, transport_timeout_ms=1000)

        async def run():
            task = asyncio.create_task(client.decide_async(None, {"flag": noul("?")}))
            self.assertTrue(await asyncio.to_thread(process.started.wait, 1))
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(run())
        self.assertIn("cancel", process.log)
        self.assertEqual(process.log[-2:], ["operation-close", "process-close"])


@unittest.skipUnless(
    os.environ.get("BUN_YOLO_EXECUTABLE"),
    "Native Bun + ABI 1.6 release qualification not selected",
)
class NativeBridge(unittest.TestCase):
    def test_three_rust_primitives_through_real_stdin_and_supervision(self):
        with Runtime() as runtime:
            client = Yolo(runtime, os.environ["BUN_YOLO_EXECUTABLE"])
            result = client.decide(
                "synthetic fixture",
                {
                    "flag": noul("False?"),
                    "route": choice("Source?", {"docs": "Docs", "graph": "Graph"}),
                    "amount": score("Support?", ["None", "Some", "Complete"]),
                },
                provider={
                    "kind": "code",
                    "response": {
                        "model": "fixture",
                        "answers": {
                            "flag": {"type": "noul", "noul": 0.5},
                            "route": {
                                "type": "choice",
                                "choice": "docs",
                                "confidence": 0.9,
                                "probabilities": {"docs": 0.9, "graph": 0.1},
                            },
                            "amount": {
                                "type": "score",
                                "score": 1.25,
                                "confidence": 0.8,
                                "legend": {"0": "None", "1": "Some", "2": "Complete"},
                                "probabilities": {"0": 0.1, "1": 0.55, "2": 0.35},
                            },
                        },
                        "usage": None,
                    },
                },
            )
            self.assertEqual(result, {"flag": False, "route": "docs", "amount": 1.25})


if __name__ == "__main__":
    unittest.main()
