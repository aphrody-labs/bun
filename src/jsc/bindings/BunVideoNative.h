#pragma once

#include <wtf/Platform.h>

namespace Bun {
namespace Video {

// Resolves media engines shipped beside bun.exe. The loader intentionally does
// not search PATH, so an embedded player uses the runtime's own media bundle.
void* loadAdjacentEngine(const char* name);

} // namespace Video
} // namespace Bun
