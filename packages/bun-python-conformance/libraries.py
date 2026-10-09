# SPDX-License-Identifier: Apache-2.0
"""Real Python libraries inside the selected shared interpreter; no model data."""

import importlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile

import numpy as np
import torch
from tree_sitter import Language, Parser
import tree_sitter_python


def qualify():
    parser = Parser(Language(tree_sitter_python.language()))
    tree = parser.parse(b"value = 1\n")
    assert not tree.root_node.has_error
    tree.edit(
        start_byte=8, old_end_byte=9, new_end_byte=9,
        start_point=(0, 8), old_end_point=(0, 9), new_end_point=(0, 9),
    )
    assert not parser.parse(b"value = 2\n", tree).root_node.has_error
    assert parser.parse(b"def broken(:\n").root_node.has_error

    array = np.arange(8, dtype=np.float64)
    shared = torch.from_numpy(array)
    shared[0] = 41
    assert array[0] == 41
    array[1] = 42
    assert shared[1].item() == 42
    assert torch.cuda.is_available(), "CUDA wheel and real NVIDIA GPU are required"
    generator = torch.Generator().manual_seed(42)
    left = torch.randn((32, 32), dtype=torch.float64, generator=generator)
    right = torch.randn((32, 32), dtype=torch.float64, generator=generator)
    expected = left @ right
    actual = (left.cuda() @ right.cuda()).cpu()
    torch.cuda.synchronize()
    assert torch.allclose(actual, expected, rtol=1e-10, atol=1e-10)
    linear = torch.nn.Linear(4, 2, dtype=torch.float64)
    inputs = torch.arange(8, dtype=torch.float64).reshape(2, 4)
    expected_linear = linear(inputs).detach()
    actual_linear = linear.cuda()(inputs.cuda()).detach().cpu()
    assert torch.allclose(actual_linear, expected_linear, rtol=1e-10, atol=1e-10)

    # Windows keeps an imported .pyd mapped until process exit. Preserve this
    # generated artifact outside every checkout rather than masking a gate error.
    with tempfile.TemporaryDirectory(prefix="bun-python-libraries-", delete=sys.platform != "win32") as directory:
        work = pathlib.Path(directory)
        (work / "native_math.pyx").write_text(
            "def add(int left, int right):\n    return left + right\n", encoding="utf-8",
        )
        (work / "setup.py").write_text(
            "from setuptools import setup\nfrom Cython.Build import cythonize\n"
            "setup(ext_modules=cythonize('native_math.pyx', language_level=3))\n",
            encoding="utf-8",
        )
        build = subprocess.run(
            [sys.executable, "setup.py", "build_ext", "--inplace"],
            cwd=work, capture_output=True, text=True, check=False,
        )
        assert build.returncode == 0, build.stdout + build.stderr
        sys.path.insert(0, directory)
        try:
            assert importlib.import_module("native_math").add(7, 9) == 16
        finally:
            sys.path.remove(directory)

        from jupyter_client import KernelManager

        manager = KernelManager()
        manager.kernel_spec.argv = [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"]
        manager.start_kernel(cwd=directory, env=os.environ.copy())
        client = manager.client()
        client.start_channels()
        try:
            client.wait_for_ready(timeout=30)
            for code, kind, value in (
                ("sum(range(10))", "execute_result", "45"),
                ("raise ValueError('KERNEL_ERROR')", "error", "ValueError"),
            ):
                request = client.execute(code)
                observed = False
                while True:
                    message = client.get_iopub_msg(timeout=30)
                    if message.get("parent_header", {}).get("msg_id") != request:
                        continue
                    content = message["content"]
                    if message["msg_type"] == kind:
                        observed = (content["data"]["text/plain"] == value if kind == "execute_result"
                                    else content["ename"] == value)
                    if message["msg_type"] == "status" and content["execution_state"] == "idle":
                        break
                assert observed, (code, kind)
        finally:
            client.stop_channels()
            manager.shutdown_kernel(now=True)

    return {"python": sys.version.split()[0], "executable": sys.executable,
            "torch": torch.__version__, "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(),
            "checks": ["tree-sitter-incremental", "numpy-torch-shared-memory", "cuda-matmul",
                       "cuda-linear-inference", "cython-build-import", "jupyter-results-errors-shutdown"]}


if __name__ == "__main__":
    print(json.dumps(qualify()))
