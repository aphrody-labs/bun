"""Pure eight-target fixtures; actual libc is qualified by the running process."""

import pytest
from yolo_runtime import RuntimeError, host_target, linux_abi_for, target_for


@pytest.mark.parametrize("arch", ["x86_64", "aarch64"])
def test_eight_targets(arch):
    assert target_for("Linux", arch, "gnu") == f"{arch}-unknown-linux-gnu"
    assert target_for("Linux", arch, "musl") == f"{arch}-unknown-linux-musl"
    assert target_for("Darwin", arch) == f"{arch}-apple-darwin"
    assert target_for("Windows", arch) == f"{arch}-pc-windows-msvc"


def test_linux_cannot_be_selected_from_architecture_alone():
    with pytest.raises(RuntimeError, match="qualified GNU/musl"):
        target_for("Linux", "x86_64")
    with pytest.raises(RuntimeError, match="non-Linux"):
        target_for("Windows", "aarch64", "gnu")


def test_gnu_runtime_probe_is_reduced_metadata():
    assert linux_abi_for("x86_64", gnu_version="glibc 2.43") == {
        "abi": "gnu",
        "version": "2.43",
        "source": "os.confstr.CS_GNU_LIBC_VERSION",
    }
    with pytest.raises(RuntimeError, match="Invalid GNU"):
        linux_abi_for("x86_64", gnu_version="unknown")


@pytest.mark.parametrize("arch", ["x86_64", "aarch64"])
def test_musl_requires_actual_mapped_loader(arch):
    loader = f"/usr/lib/libc.musl-{arch}.so.1"
    assert linux_abi_for(
        arch, mapped_libraries=f"7000-8000 r-xp 0000 00:00 1 {loader}\n"
    ) == {
        "abi": "musl",
        "loader": loader,
        "source": "/proc/self/maps",
    }
    with pytest.raises(RuntimeError, match="could not be qualified"):
        linux_abi_for(arch)


def test_foreign_mapped_loader_cannot_establish_musl():
    with pytest.raises(RuntimeError):
        linux_abi_for(
            "x86_64",
            mapped_libraries="7000-8000 r-xp 0000 00:00 1 /lib/ld-musl-aarch64.so.1\n",
        )


def test_native_host_target_remains_supported():
    assert host_target() in {
        f"{arch}-{platform}"
        for arch in ("x86_64", "aarch64")
        for platform in (
            "unknown-linux-gnu",
            "unknown-linux-musl",
            "apple-darwin",
            "pc-windows-msvc",
        )
    }
