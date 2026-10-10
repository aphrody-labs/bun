# Native Windows WIC qualification

Qualification date: 2026-10-10, Windows x64, Windows SDK 10.0.26100.0.

The WIC backend uses explicit raw-pointer conversions at COM boundaries and documents the lifetime contracts of its private interface calls. Missing AV1 encoders can be discovered only when the frame is committed. HRESULT `MF_E_TOPO_CODEC_NOT_FOUND` now returns backend unavailable, which becomes `ERR_IMAGE_FORMAT_UNSUPPORTED`; other commit failures still return encode failed.

Microsoft's [HEIF codec example](https://learn.microsoft.com/en-us/windows/win32/wic/heif-codec) also discovers a missing AV1 encoder at frame commit. The optional-format test uses a 64 by 64 image and checks its format and decoded dimensions.

Native changed-binary image suite: 104 passed, four existing macOS-only skips, zero failures, 428 assertions. TypeScript, oxlint and Prettier checks passed for the changed test. A separate TIFF probe decoded two exact RGBA pixels through WIC 25 times. The native link audit reported zero duplicate strong symbols.

## Remaining limits

The installed Windows HEVC codec successfully encodes 4 by 3 and 4 by 4 images, but its decoder fails at pixel readback with `E_INVALIDARG`. A standalone Windows SDK program reproduced this independently of Bun's COM declarations. The same program decoded 16 by 16 and 64 by 64 images. This small-image limitation remains unresolved; the availability test does not establish support for every dimension.

Whole-runtime strict Clippy remains incomplete: the WIC file has no diagnostics on Windows x64 or ARM64, but other runtime files still fail. These checks do not qualify Linux, macOS, ARM64 execution, release publication or production activation.
