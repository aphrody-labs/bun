# SPDX-License-Identifier: Apache-2.0
"""Python compiler products owned by Bun's native CLI.

Explicit bytecode/archive products retain the embedded CPython contract:

    buv compile <dir|file> --bytecode [-O|-OO]
        byte-compiles every .py into `__pycache__` as unchecked-hash pycs (no timestamp, no source stat at import time:
        the cache is reproducible and is never rewritten by a later run);
    buv compile <dir> --zipapp -m <module:function> -o <app.pyz> [-O|-OO]
        bundles the byte-compiled tree into one executable archive with a `#!/usr/bin/env -S buv python` shebang.

The Bun CLI passes --buv-executable and selects native Cython/Nuitka or a real WASI builder.
Compiler packages remain lazy, pinned UV dependencies outside the runtime binary.
"""

import argparse
import compileall
import contextlib
import hashlib
import json
import os
import py_compile
import runpy
import shlex
import shutil
import subprocess
import sys
import sysconfig
import tempfile
import zipapp
from pathlib import Path

SHEBANG = "/usr/bin/env -S buv python"


def optimize_level(args):
    if "-OO" in args:
        args.remove("-OO")
        return 2
    if "-O" in args:
        args.remove("-O")
        return 1
    return 0


def option(args, name):
    if name in args:
        at = args.index(name)
        if at + 1 < len(args):
            value = args[at + 1]
            del args[at : at + 2]
            return value
    return None


def compile_tree(path, level):
    """Byte-compiles `path` in place; returns the number of failures (0 is success)."""
    mode = py_compile.PycInvalidationMode.UNCHECKED_HASH
    if os.path.isdir(path):
        ok = compileall.compile_dir(
            path, quiet=1, force=True, optimize=level, invalidation_mode=mode
        )
    else:
        ok = bool(
            compileall.compile_file(
                path, quiet=1, force=True, optimize=level, invalidation_mode=mode
            )
        )
    return 0 if ok else 1


def build_zipapp(source, main, output, level):
    """Copies `source`, byte-compiles the copy, and archives it; `main` is `module:function`."""
    if ":" not in main:
        raise ValueError("-m must be module:function")
    work = tempfile.mkdtemp(prefix="buv-compile-")
    try:
        tree = os.path.join(work, "app")
        shutil.copytree(
            source, tree, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git")
        )
        if compile_tree(tree, level):
            raise RuntimeError("byte-compilation failed")
        zipapp.create_archive(
            tree, output, interpreter=SHEBANG, main=main, compressed=True
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


def legacy_main(argv):
    args = list(argv)
    level = optimize_level(args)
    use_zipapp = "--zipapp" in args
    if use_zipapp:
        args.remove("--zipapp")
    entry = option(args, "-m")
    output = option(args, "-o")
    if len(args) != 1 or (use_zipapp and not (entry and output)):
        print(
            "usage: buv compile <dir|file> [-O|-OO]\n"
            "       buv compile <dir> --zipapp -m <module:function> -o <app.pyz> [-O|-OO]",
            file=sys.stderr,
        )
        return 64
    target = args[0]
    if not os.path.exists(target):
        print(f"buv compile: {target} does not exist", file=sys.stderr)
        return 1
    try:
        if use_zipapp:
            build_zipapp(target, entry, output, level)
            os.chmod(output, 0o755)
            print(output)
            return 0
        return compile_tree(target, level)
    except (ValueError, RuntimeError, OSError) as error:
        print(f"buv compile: {error}", file=sys.stderr)
        return 1


def native_main(argv):
    import argparse
    import hashlib
    import json
    import re
    import shlex
    import sysconfig
    from pathlib import Path

    parser = argparse.ArgumentParser(prog="buv compile")
    parser.add_argument("entry", type=Path)
    parser.add_argument("--format", choices=("exe", "shared", "wasm"), default="exe")
    parser.add_argument(
        "--target", choices=("native", "wasm", "wasm32-wasip1"), default="native"
    )
    parser.add_argument("--backend", choices=("cython", "nuitka"), default="cython")
    parser.add_argument("--outfile", "--out", "-o", type=Path)
    parser.add_argument("--module-name")
    parser.add_argument("--wasm-builder", type=Path)
    parser.add_argument("--buv-executable", type=Path, required=True)
    parser.add_argument("--db", type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--root", type=Path)
    for name in ("cpython-root", "host", "image", "cache", "jobs"):
        parser.add_argument("--" + name)
    for name in (
        "compile",
        "backend-ready",
        "offline",
        "force",
        "onefile",
        "bytecode",
        "zipapp",
    ):
        parser.add_argument("--" + name, action="store_true")
    parser.add_argument("-m", dest="main")
    parser.add_argument("-O", action="store_const", const=1, dest="optimize", default=0)
    parser.add_argument("-OO", action="store_const", const=2, dest="optimize")
    args = parser.parse_args(argv)
    entry = args.entry.resolve()
    if not entry.exists():
        raise ValueError("Python input does not exist: " + str(entry))
    if args.bytecode or args.zipapp:
        if args.zipapp:
            if not args.main or not args.outfile:
                raise ValueError("zipapp requires -m module:function and --outfile")
            build_zipapp(str(entry), args.main, str(args.outfile), args.optimize)
            print(str(args.outfile))
            return 0
        return compile_tree(str(entry), args.optimize)
    if not entry.is_file() or entry.suffix not in (".py", ".pyx"):
        raise ValueError("native compilation requires a .py or .pyx entry file")
    product = "wasm" if args.target != "native" else args.format
    if args.target != "native" and args.format == "shared":
        raise ValueError("a CPython extension cannot target WebAssembly")
    suffix = {
        "wasm": ".wasm",
        "shared": ".pyd" if os.name == "nt" else ".so",
        "exe": ".exe" if os.name == "nt" else "",
    }[product]
    output = (args.outfile or entry.with_suffix(suffix)).resolve()
    if output == entry or (output.exists() and output.samefile(entry)):
        raise ValueError("output cannot replace Python source")
    if product == "shared" and output.suffix != suffix:
        raise ValueError("shared library suffix is incompatible with the selected host")
    if product == "wasm" and output.suffix != ".wasm":
        raise ValueError("WASM output requires a .wasm suffix")
    if output.exists() and not args.force:
        raise ValueError("output exists; use --force to replace a build product")
    if args.receipt and args.receipt.resolve() in (entry, output):
        raise ValueError("receipt cannot replace source or build product")
    output.parent.mkdir(parents=True, exist_ok=True)

    def sha256(path):
        with Path(path).open("rb") as handle:
            digest = hashlib.sha256()
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def run(command, **kwargs):
        return subprocess.run(
            [str(part) for part in command],
            check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            **kwargs,
        )

    if product == "wasm":
        builder = args.wasm_builder
        if not builder or not builder.is_file() or not args.buv_executable.is_file():
            raise ValueError("WASM builder and native Buv executable must exist")
        command = [args.buv_executable, builder, "--entry", entry, "--out", output]
        for name in ("root", "db", "cpython_root", "host", "image", "cache", "jobs"):
            value = getattr(args, name)
            if value is not None:
                command.extend(["--" + name.replace("_", "-"), value])
        run(command)
        with output.open("rb") as handle:
            magic = handle.read(4)
        if magic != b"\0asm":
            raise ValueError("WASM builder did not produce a WebAssembly module")
        return 0

    module = args.module_name or entry.stem
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", module):
        raise ValueError("--module-name must be an ASCII Python identifier")
    if args.onefile and args.backend != "nuitka":
        raise ValueError("--onefile requires the Nuitka backend")
    if args.onefile and product != "exe":
        raise ValueError("--onefile requires an executable product")
    if os.name == "nt":
        if not os.environ.get("VCToolsInstallDir") or not shutil.which("cl"):
            raise ValueError(
                "Windows native compilation requires the qualified bun msvc exec environment"
            )
        os.environ["DISTUTILS_USE_SDK"] = "1"
    with tempfile.TemporaryDirectory(prefix="buv-native-") as folder:
        work = Path(folder)
        if args.backend == "cython":
            from setuptools import Distribution, Extension
            from setuptools._distutils.ccompiler import new_compiler
            from setuptools._distutils.sysconfig import customize_compiler

            if product == "shared":
                generated = work / (module + ".c")
                run(
                    [
                        args.buv_executable,
                        "python",
                        "-m",
                        "cython",
                        "-3",
                        "--module-name",
                        module,
                        "--output-file",
                        generated,
                        entry,
                    ]
                )
                distribution = Distribution(
                    {
                        "ext_modules": [
                            Extension(
                                module,
                                [str(generated)],
                                include_dirs=[str(entry.parent)],
                            )
                        ]
                    }
                )
                build = distribution.get_command_obj("build_ext")
                build.build_lib = str(work / "lib")
                build.build_temp = str(work / "obj")
                build.ensure_finalized()
                build.run()
                artifact = Path(build.get_ext_fullpath(module))
            else:
                generated = work / "main.c"
                run(
                    [
                        args.buv_executable,
                        "python",
                        "-m",
                        "cython",
                        "--embed",
                        "--module-name",
                        module,
                        "--output-file",
                        generated,
                        entry,
                    ]
                )
                compiler = new_compiler()
                customize_compiler(compiler)
                compiler.spawn = lambda command, **kwargs: run(command)
                includes = list(
                    dict.fromkeys(
                        [
                            sysconfig.get_path("include"),
                            sysconfig.get_path("platinclude"),
                        ]
                    )
                )
                objects = compiler.compile(
                    [str(generated)],
                    output_dir=str(work / "obj"),
                    include_dirs=includes,
                )
                if os.name == "nt":
                    libraries = [
                        "python"
                        + str(sys.version_info.major)
                        + str(sys.version_info.minor)
                        + getattr(sys, "abiflags", "")
                    ]
                    library_dirs = [str(Path(sys.base_prefix) / "libs")]
                    link_args = []
                else:
                    library = sysconfig.get_config_var(
                        "LDLIBRARY"
                    ) or sysconfig.get_config_var("LIBRARY")
                    libraries = [
                        re.sub(r"\.(so.*|dylib|a)$", "", library.removeprefix("lib"))
                    ]
                    library_dirs = [sysconfig.get_config_var("LIBDIR")]
                    link_args = shlex.split(
                        (sysconfig.get_config_var("LIBS") or "")
                        + " "
                        + (sysconfig.get_config_var("SYSLIBS") or "")
                    )
                program = work / "program"
                compiler.link_executable(
                    objects,
                    str(program),
                    libraries=libraries,
                    library_dirs=library_dirs,
                    extra_postargs=link_args,
                )
                artifact = Path(compiler.executable_filename(str(program)))
            backend_version = __import__("Cython").__version__
        else:
            if entry.suffix != ".py":
                raise ValueError("Nuitka requires a .py entry")
            if product == "shared" and module != entry.stem:
                raise ValueError("Nuitka module name must match the entry filename")
            command = [
                args.buv_executable,
                "python",
                "-m",
                "nuitka",
                "--output-dir=" + str(work),
            ]
            jobs = int(args.jobs or "3")
            if jobs < 1:
                raise ValueError("--jobs must be positive")
            command.append("--jobs=" + str(jobs))
            if "_virtualenv" in sys.modules:
                command.append("--include-module=_virtualenv")
            if product == "shared":
                command.append("--module")
            else:
                command.append(
                    "--output-filename=program.exe"
                    if os.name == "nt"
                    else "--output-filename=program"
                )
                if args.onefile:
                    command.append("--onefile")
            command.append(entry)
            run(command)
            candidates = (
                list(work.glob(module + "*" + suffix))
                if product == "shared"
                else [work / ("program.exe" if os.name == "nt" else "program")]
            )
            if len(candidates) != 1 or not candidates[0].is_file():
                raise ValueError("Nuitka did not produce the requested native artifact")
            artifact = candidates[0]
            import importlib.metadata

            backend_version = importlib.metadata.version("Nuitka")
        with artifact.open("rb") as handle:
            magic = handle.read(4)
        if (os.name == "nt" and magic[:2] != b"MZ") or (
            sys.platform.startswith("linux") and magic != b"\x7fELF"
        ):
            raise ValueError("compiler did not produce the selected host binary format")
        digest = sha256(artifact)
        with tempfile.NamedTemporaryFile(
            prefix=".buv-product-", dir=output.parent, delete=False
        ) as handle:
            staged = Path(handle.name)
            try:
                with artifact.open("rb") as source:
                    shutil.copyfileobj(source, handle, length=1024 * 1024)
                handle.flush()
                os.fsync(handle.fileno())
            except BaseException:
                handle.close()
                staged.unlink()
                raise
        try:
            shutil.copymode(artifact, staged)
            if args.force:
                os.replace(staged, output)
            else:
                os.link(staged, output)
        finally:
            staged.unlink(missing_ok=True)
    original = getattr(sys, "orig_argv", [])
    compiler_source = original[original.index("-c") + 1] if "-c" in original else None
    receipt = {
        "output": str(output),
        "source": str(entry),
        "sourceSha256": sha256(entry),
        "compilerSourceSha256": hashlib.sha256(
            compiler_source.encode("utf-8")
        ).hexdigest()
        if compiler_source
        else None,
        "compilerExecutable": {
            "path": str(args.buv_executable),
            "sha256": sha256(args.buv_executable),
            "revision": run(
                [args.buv_executable, "--revision"], capture_output=True, text=True
            ).stdout.strip(),
        },
        "sha256": digest,
        "format": product,
        "backend": args.backend,
        "backendVersion": backend_version,
        "abi": "PyInit_" + module
        if product == "shared"
        else "CPython-embedded-executable",
        "standalone": bool(args.onefile),
        "runtimeDependencies": []
        if args.onefile
        else ["CPython shared library", "CPython standard library"],
        "python": {
            "version": sys.version,
            "prefix": sys.base_prefix,
            "executable": sys.executable,
        },
    }
    receipt_path = args.receipt or Path(str(output) + ".json")
    receipt_path.write_text(
        json.dumps(receipt, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    if args.db:
        run(
            [
                args.buv_executable,
                "-e",
                'import graph from "bun:graph"; using db = new graph.BunPython(process.argv[1]); const receipt = await Bun.file(process.argv[2]).json(); await db.artifact(receipt.output, "python-native-" + receipt.format, null, receipt);',
                args.db,
                receipt_path,
            ]
        )
    print(json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(
            native_main(sys.argv[1:])
            if "--buv-executable" in sys.argv
            else legacy_main(sys.argv[1:])
        )
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print("buv compile: " + str(error), file=sys.stderr)
        sys.exit(1)
