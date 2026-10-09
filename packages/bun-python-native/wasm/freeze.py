"""Freeze source modules with the exact CPython interpreter used for the WASI build."""

import argparse
import hashlib
import json
import marshal
import pathlib
import sys


def c_string(value):
    return '"' + "".join(f"\\{byte:03o}" for byte in value.encode("utf-8")) + '"'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=pathlib.Path, required=True)
    parser.add_argument("--stdlib", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 13):
        raise RuntimeError("Frozen bytecode must be produced by CPython 3.13")
    request = json.loads(args.request.read_text(encoding="utf-8"))
    modules = {}
    excluded = {
        "test", "tests", "idlelib", "tkinter", "turtledemo", "venv", "ensurepip"
    }
    for path in sorted(args.stdlib.rglob("*.py")):
        relative = path.relative_to(args.stdlib)
        if any(part in excluded or part == "__pycache__" for part in relative.parts):
            continue
        package = path.name == "__init__.py"
        parts = (
            relative.parts[:-1]
            if package
            else (*relative.parts[:-1], path.stem)
        )
        name = ".".join(parts)
        if name:
            modules[name] = (
                path.read_bytes(), f"/stdlib/{relative.as_posix()}", package
            )
    for item in request["modules"]:
        name = item["name"]
        if name.split(".")[0] in {"encodings", "codecs", "io", "importlib"}:
            raise ValueError(
                f"Application overrides interpreter bootstrap module {name}"
            )
        path = args.request.parent / item["path"]
        source = path.read_bytes()
        if hashlib.sha256(source).hexdigest() != item["sha256"]:
            raise ValueError(f"Application source hash mismatch: {item['path']}")
        modules[name] = (source, item["filename"], item["package"])
    entry = request["entryModule"]
    modules["__main__"] = modules[entry]
    if modules["__main__"][2]:
        raise ValueError(
            "The application entry must be a source file, not __init__.py"
        )
    names = sorted(modules)
    index_entries = []
    with args.out.open("w", encoding="ascii", newline="\n") as output:
        for index, name in enumerate(names):
            source, filename, _ = modules[name]
            code = compile(source, filename, "exec", dont_inherit=True, optimize=0)
            bytecode = marshal.dumps(code)
            index_entries.append(
                {
                    "name": name,
                    "filename": filename,
                    "package": modules[name][2],
                    "sourceSha256": hashlib.sha256(source).hexdigest(),
                    "bytecodeSha256": hashlib.sha256(bytecode).hexdigest(),
                }
            )
            output.write(f"static const unsigned char buv_module_{index}[] = {{\n")
            for offset in range(0, len(bytecode), 32):
                output.write(
                    ",".join(str(byte) for byte in bytecode[offset:offset + 32])
                    + ",\n"
                )
            output.write("};\n")
        output.write("static const struct _frozen buv_frozen_modules[] = {\n")
        for index, name in enumerate(names):
            output.write(
                f"{{{c_string(name)}, buv_module_{index}, sizeof(buv_module_{index}), "
                f"{int(modules[name][2])}}},\n"
            )
        output.write("{NULL, NULL, 0, 0}\n};\n")
        output.write(
            "static const char *buv_entry_filename = "
            f"{c_string(modules[entry][1])};\n"
        )
    args.out.with_suffix(".json").write_text(
        json.dumps(index_entries), encoding="utf-8"
    )
    print(json.dumps({
        "frozenModules": len(modules),
        "bytecodeVersion": sys.version.split()[0],
    }))


if __name__ == "__main__":
    main()
