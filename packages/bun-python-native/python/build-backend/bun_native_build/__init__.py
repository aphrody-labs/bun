# SPDX-License-Identifier: Apache-2.0
"""Build Python products against committed native sources owned by the Bun fork.

Native files are staged outside the product checkout and never enter its sdist.
The caller supplies APHRODY_BUN_CHECKOUT; the manifest pins a full Git revision.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import tomllib
from pathlib import Path


def _metadata():
    root = Path.cwd()
    metadata = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    return root, metadata


def _product_files(root):
    for name in (
        "pyproject.toml",
        "README.md",
        "LICENSE",
        "NOTICE",
    ):
        path = root / name
        if path.is_file():
            yield path
    for name in ("src", "python", "LICENSES", "tests"):
        directory = root / name
        if directory.is_dir():
            for path in directory.rglob("*"):
                if (
                    path.is_file()
                    and not path.is_symlink()
                    and "__pycache__" not in path.parts
                    and path.suffix not in (".pyc", ".pyd", ".so", ".dll")
                ):
                    yield path


@contextlib.contextmanager
def _native_project(editable=False):
    root, metadata = _metadata()
    native = metadata["tool"]["aphrody"]["bun-native"]
    revision = native["revision"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Bun native sources require a full immutable Git revision")
    configured = os.environ.get("APHRODY_BUN_CHECKOUT")
    if not configured:
        raise RuntimeError(
            "Set APHRODY_BUN_CHECKOUT to a qualified native Bun fork checkout"
        )
    checkout = Path(configured).resolve(strict=True)
    workspace = Path(native["workspace"])
    manifest = Path(native["manifest"])
    if (
        workspace.is_absolute()
        or manifest.is_absolute()
        or ".." in (*workspace.parts, *manifest.parts)
    ):
        raise ValueError("Native workspace and manifest must stay inside the Bun fork")
    command = ["git", "-C", str(checkout)]
    archive = subprocess.run(
        [*command, "archive", "--format=tar", revision, workspace.as_posix()],
        check=True,
        capture_output=True,
    ).stdout
    with tempfile.TemporaryDirectory(prefix="bun-python-build-") as temporary:
        staged = Path(temporary)
        with tarfile.open(fileobj=io.BytesIO(archive)) as files:
            files.extractall(staged, filter="data")
        project = staged / workspace / manifest.parent
        if not (staged / workspace / "Cargo.lock").is_file():
            raise RuntimeError(
                "The pinned Bun native workspace must include Cargo.lock"
            )
        if not (project / manifest.name).is_file():
            raise RuntimeError("The pinned Bun native manifest is missing")
        # Only Python package inputs and legal records are overlaid onto the
        # temporary native build. All Rust source still comes from Git archive.
        for path in _product_files(root):
            target = project / path.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        text = (root / "pyproject.toml").read_text(encoding="utf-8")
        text = re.sub(
            r"(?m)^manifest-path\s*=.*$", 'manifest-path = "Cargo.toml"', text
        )
        if editable:
            source = metadata["tool"]["maturin"]["python-source"]
            text = re.sub(
                r"(?m)^python-source\s*=.*$",
                f"python-source = {json.dumps(str(root / source))}",
                text,
            )
        (project / "pyproject.toml").write_text(text, encoding="utf-8")
        previous = Path.cwd()
        try:
            os.chdir(project)
            yield
        finally:
            os.chdir(previous)


def _settings(config_settings):
    import maturin

    options = maturin.get_maturin_pep517_args(config_settings)
    # Source ownership cannot be overridden through a second manifest argument.
    if any(
        arg in ("-m", "--manifest-path") or arg.startswith("--manifest-path=")
        for arg in options
    ):
        raise ValueError(
            "Native manifest is selected by the pinned Bun source contract"
        )
    return {**(config_settings or {}), "maturin.build-args": options}


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    import maturin

    destination = str(Path(wheel_directory).resolve())
    info = str(Path(metadata_directory).resolve()) if metadata_directory else None
    settings = _settings(config_settings)
    with _native_project():
        return maturin.build_wheel(destination, settings, info)


def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    import maturin

    destination = str(Path(wheel_directory).resolve())
    info = str(Path(metadata_directory).resolve()) if metadata_directory else None
    settings = _settings(config_settings)
    with _native_project(editable=True):
        return maturin.build_editable(destination, settings, info)


def prepare_metadata_for_build_wheel(metadata_directory, config_settings=None):
    import maturin

    destination = str(Path(metadata_directory).resolve())
    settings = _settings(config_settings)
    with _native_project():
        return maturin.prepare_metadata_for_build_wheel(destination, settings)


def get_requires_for_build_wheel(config_settings=None):
    return []  # maturin is declared as an isolated build requirement.


get_requires_for_build_editable = get_requires_for_build_wheel
prepare_metadata_for_build_editable = prepare_metadata_for_build_wheel


def get_requires_for_build_sdist(config_settings=None):
    return []


def build_sdist(sdist_directory, config_settings=None):
    root, metadata = _metadata()
    project = metadata["project"]
    name = re.sub(r"[-_.]+", "_", project["name"])
    prefix = f"{name}-{project['version']}"
    destination = Path(sdist_directory).resolve() / f"{prefix}.tar.gz"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(destination, "w:gz") as archive:
        for path in sorted(_product_files(root)):
            archive.add(
                path,
                arcname=f"{prefix}/{path.relative_to(root).as_posix()}",
                recursive=False,
            )
        info = tarfile.TarInfo(f"{prefix}/PKG-INFO")
        payload = f"Metadata-Version: 2.1\nName: {project['name']}\nVersion: {project['version']}\n".encode()
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    return destination.name
