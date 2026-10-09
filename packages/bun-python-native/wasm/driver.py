"""Run the upstream CPython WASI factory in an isolated cache."""

import argparse
import hashlib
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import tarfile


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def install(archive, spec, cache):
    if digest(archive) != spec["sha256"]:
        raise ValueError(f"Toolchain archive checksum mismatch: {archive}")
    target = cache / spec["directory"]
    stamp = target / ".buv-verified.json"
    if stamp.is_file() and json.loads(stamp.read_text()) == spec:
        return target
    if target.exists():
        raise ValueError(f"Unverified toolchain directory already exists: {target}")
    with tarfile.open(archive) as compressed:
        names = compressed.getnames()
        if not names or any(
            pathlib.PurePosixPath(name).parts[0] != spec["directory"]
            for name in names
        ):
            raise ValueError("Toolchain archive has an unexpected root directory")
        compressed.extractall(cache, filter="data")
    stamp.write_text(json.dumps(spec), encoding="utf-8")
    return target


def run(command, cwd, env):
    print(
        json.dumps({"command": list(map(str, command)), "cwd": str(cwd)}),
        flush=True,
    )
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=pathlib.Path, required=True)
    parser.add_argument("--cache", type=pathlib.Path, required=True)
    parser.add_argument("--tools", type=pathlib.Path, required=True)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding="utf-8"))
    work = args.request.parent
    cache = args.cache.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    sdk = install(work / "sdk.tar.gz", request["toolchain"]["sdk"], cache)
    runtime = install(work / "runtime.tar.xz", request["toolchain"]["runtime"], cache)
    source = cache / "cpython" / request["sourceHash"]
    source.parent.mkdir(parents=True, exist_ok=True)
    source_stamp = source / ".buv-source.json"
    if source.exists() and not source_stamp.is_file():
        raise ValueError(f"Incomplete source cache exists: {source}")
    if not source.exists():
        source.mkdir()
        if digest(work / "cpython.tar") != request["archiveSha256"]:
            raise ValueError("CPython archive checksum mismatch")
        with tarfile.open(work / "cpython.tar") as archive:
            archive.extractall(source, filter="data")
        for item in request["overlay"]:
            relative = pathlib.PurePosixPath(item["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("CPython overlay escapes source root")
            target = source.joinpath(*relative.parts)
            if item["sha256"] is None:
                target.unlink(missing_ok=True)
            else:
                overlay = work / "overlay" / pathlib.Path(*relative.parts)
                if digest(overlay) != item["sha256"]:
                    raise ValueError(f"CPython overlay checksum mismatch: {relative}")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(overlay, target)
        source_stamp.write_text(
            json.dumps({"sourceHash": request["sourceHash"]}), encoding="utf-8"
        )
    environment = os.environ | {
        "PATH": f"{runtime}:{sdk / 'bin'}:{os.environ['PATH']}",
        "WASI_SDK_PATH": str(sdk),
        "SOURCE_DATE_EPOCH": request["sourceDateEpoch"],
        "MAKEFLAGS": f"-j{request['jobs']}",
    }
    factory = source / "Tools" / "wasm" / "wasi.py"
    build = source / "cross-build" / "build"
    wasi = source / "cross-build" / "wasm32-wasip1"
    if not (build / "python").is_file():
        run([
            "python3", factory, "configure-build-python", "--",
            "--without-ensurepip", "--disable-test-modules",
        ], source, environment)
        run(["make", "--jobs", request["jobs"], "all"], build, environment)
    if not (wasi / "libpython3.13.a").is_file():
        run([
            "python3", factory, "configure-host", "--wasi-sdk", sdk,
            "--host-triple", "wasm32-wasip1", "--",
            "--without-ensurepip", "--disable-test-modules",
        ], source, environment)
        run(["make", "--jobs", request["jobs"], "all"], wasi, environment)
    run([
        runtime / "wasmtime", "run", "--wasm", "max-wasm-stack=8388608",
        "--dir", f"{source}::/", "--argv0", "cross-build/wasm32-wasip1/python.wasm",
        "--env", "PYTHONPATH=/cross-build/wasm32-wasip1/build/lib.wasi-wasm32-3.13",
        wasi / "python.wasm", "--version",
    ], source, environment)
    run([
        build / "python", args.tools / "freeze.py", "--request", args.request,
        "--stdlib", source / "Lib", "--out", work / "modules.h",
    ], source, environment)
    compiler = sdk / "bin" / "clang"
    link_makefile = work / "link-flags.mk"
    link_makefile.write_text(
        "include Makefile\n.PHONY: buv-link-flags\n"
        "buv-link-flags:\n\t@printf '%s\\n' '$(LIBS) $(MODLIBS) $(SYSLIBS)'\n",
        encoding="utf-8",
    )
    link_flags = shlex.split(subprocess.check_output(
        ["make", "--silent", "--file", str(link_makefile), "buv-link-flags"],
        cwd=wasi, env=environment, encoding="utf-8",
    ))
    command = [
        compiler, "--target=wasm32-wasip1", f"--sysroot={sdk / 'share' / 'wasi-sysroot'}",
        "-O2", "-g0", "-I", source / "Include", "-I", wasi, "-I", work,
        args.tools / "main.c", wasi / "libpython3.13.a",
        *link_flags,
        "-Wl,--stack-first", "-Wl,-z,stack-size=8388608",
        "-Wl,--max-memory=2147483648", "-o", work / "output.wasm",
    ]
    run(command, wasi, environment)
    receipt = {
        "target": "wasm32-wasip1", "pythonVersion": request["pythonVersion"],
        "sourceRevision": request["sourceRevision"], "sourceHash": request["sourceHash"],
        "sha256": digest(work / "output.wasm"), "compiler": str(compiler),
        "compilerSha256": digest(compiler),
        "runtimeSha256": digest(runtime / "wasmtime"),
        "frozenModules": len(json.loads((work / "modules.json").read_text())),
        "frozenIndexSha256": digest(work / "modules.json"),
        "linkFlags": link_flags,
        "stdlib": (
            "frozen Python sources and WASI builtins; "
            "package data and non-WASI extensions are excluded"
        ),
        "qualification": "compiled; application execution is a separate gate",
    }
    (work / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")


if __name__ == "__main__":
    main()
