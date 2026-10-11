#pragma once

#include "root.h"

#include <JavaScriptCore/JSContextRef.h>
#include <JavaScriptCore/JSValueRef.h>
#include <JavaScriptCore/JSStringRef.h>

namespace JSC {
class JSGlobalObject;
}

namespace Bun {

struct BrowserRealmResult {
    uint8_t* bytes;
    size_t length;
    int32_t status;
};

extern "C" void* Bun__BrowserRealm__create(
    JSC::JSGlobalObject* hostGlobal,
    const void* tree,
    const uint8_t* origin, size_t originLength,
    const uint8_t* frameId, size_t frameIdLength);
extern "C" bool Bun__BrowserRealm__evaluate(
    void* handle,
    const uint8_t* source, size_t sourceLength,
    const uint8_t* sourceURL, size_t sourceURLLength,
    uint32_t timeoutMs,
    BrowserRealmResult* result);
extern "C" void Bun__BrowserRealm__release(void* handle);
extern "C" void Bun__BrowserRealm__free_bytes(uint8_t* bytes, size_t length);

extern "C" BrowserRealmResult Bun__BrowserRealm__dom(
    const void* tree, uint32_t operation, uint32_t nodeId,
    const uint8_t* first, size_t firstLength,
    const uint8_t* second, size_t secondLength);
extern "C" void Bun__BrowserRealm__free_dom_bytes(uint8_t* bytes, size_t length);

} // namespace Bun
