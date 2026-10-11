#include "BrowserRealm.h"

#include "APICast.h"
#include "JavaScriptCore/JSLock.h"
#include "JavaScriptCore/JSValueInlines.h"
#include "JavaScriptCore/ThrowScope.h"
#include "NodeVMRunTermination.h"

#include <JavaScriptCore/JSContextRef.h>
#include <JavaScriptCore/JSStringRef.h>
#include <JavaScriptCore/JSValueRef.h>
#include <wtf/text/WTFString.h>
#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>
#include <span>
#include <string>
#include <vector>

namespace Bun {

struct BrowserRealmHandle {
    JSGlobalContextRef context { nullptr };
    JSC::JSGlobalObject* global { nullptr };
    const void* tree { nullptr };
};

static WTF::String fromUTF8(const uint8_t* bytes, size_t length)
{
    static constexpr char empty[] = "";
    auto* data = length ? reinterpret_cast<const char*>(bytes) : empty;
    return WTF::String::fromUTF8(std::span<const char> { data, length });
}

static JSStringRef makeJSString(const WTF::String& value)
{
    WTF::StringView view(value);
    std::vector<JSChar> characters;
    characters.reserve(view.length());
    for (unsigned i = 0; i < view.length(); ++i)
        characters.push_back(static_cast<JSChar>(view[i]));
    return JSStringCreateWithCharacters(characters.data(), characters.size());
}

static bool copyJSString(JSContextRef context, JSValueRef value, std::string& output, JSValueRef* exception)
{
    JSStringRef string = JSValueToStringCopy(context, value, exception);
    if (!string)
        return false;
    size_t capacity = JSStringGetMaximumUTF8CStringSize(string);
    std::vector<char> buffer(capacity);
    size_t written = JSStringGetUTF8CString(string, buffer.data(), buffer.size());
    JSStringRelease(string);
    if (!written)
        return false;
    output.assign(buffer.data(), written - 1); // includes embedded NULs in the written span
    return true;
}

static void setException(JSContextRef context, JSValueRef* exception, const char* message)
{
    JSStringRef string = JSStringCreateWithUTF8CString(message);
    *exception = JSValueMakeString(context, string);
    JSStringRelease(string);
}

static BrowserRealmResult copyBytes(std::span<const uint8_t> bytes, int32_t status)
{
    auto* output = static_cast<uint8_t*>(std::malloc(bytes.size() ? bytes.size() : 1));
    if (!output)
        return { nullptr, 0, 2 };
    if (!bytes.empty())
        std::memcpy(output, bytes.data(), bytes.size());
    return { output, bytes.size(), status };
}

static BrowserRealmResult copyString(const std::string& value, int32_t status)
{
    return copyBytes(std::span<const uint8_t> { reinterpret_cast<const uint8_t*>(value.data()), value.size() }, status);
}

static JSClassRef domObjectClass()
{
    static JSClassRef klass = [] {
        JSClassDefinition definition = kJSClassDefinitionEmpty;
        definition.className = "BunPageDOM";
        return JSClassCreate(&definition);
    }();
    return klass;
}

static JSValueRef domCall(
    JSContextRef context,
    JSObjectRef function,
    JSObjectRef thisObject,
    size_t argumentCount,
    const JSValueRef arguments[],
    JSValueRef* exception);

static JSClassRef domFunctionClass()
{
    static JSClassRef klass = [] {
        JSClassDefinition definition = kJSClassDefinitionEmpty;
        definition.className = "BunPageDOMFunction";
        definition.callAsFunction = domCall;
        return JSClassCreate(&definition);
    }();
    return klass;
}

static bool putProperty(JSContextRef context, JSObjectRef object, const char* name, JSValueRef value, JSPropertyAttributes attributes)
{
    JSStringRef key = JSStringCreateWithUTF8CString(name);
    JSValueRef exception = nullptr;
    JSObjectSetProperty(context, object, key, value, attributes, &exception);
    JSStringRelease(key);
    return exception == nullptr;
}

static bool putString(JSContextRef context, JSObjectRef object, const char* name, const uint8_t* bytes, size_t length)
{
    WTF::String string = fromUTF8(bytes, length);
    JSStringRef value = makeJSString(string);
    bool result = putProperty(context, object, name, JSValueMakeString(context, value), kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete);
    JSStringRelease(value);
    return result;
}

static bool installDOM(BrowserRealmHandle& realm, const uint8_t* origin, size_t originLength, const uint8_t* frameId, size_t frameIdLength)
{
    JSContextRef context = realm.context;
    JSObjectRef global = JSContextGetGlobalObject(context);
    JSObjectRef dom = JSObjectMake(context, domObjectClass(), const_cast<void*>(realm.tree));
    if (!dom || !putString(context, dom, "origin", origin, originLength) || !putString(context, dom, "frameId", frameId, frameIdLength))
        return false;

    struct Method { const char* name; uint32_t operation; };
    static constexpr Method methods[] = {
        { "querySelectorAll", 0 },
        { "outerHTML", 1 },
        { "textContent", 2 },
        { "getAttribute", 3 },
        { "setAttribute", 4 },
    };
    for (const auto& method : methods) {
        JSObjectRef callback = JSObjectMake(context, domFunctionClass(), reinterpret_cast<void*>(static_cast<uintptr_t>(method.operation) + 1));
        if (!callback || !putProperty(context, dom, method.name, callback, kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete))
            return false;
    }
    return putProperty(context, global, "__bunDOM", dom, kJSPropertyAttributeReadOnly | kJSPropertyAttributeDontDelete);
}

static JSValueRef domCall(JSContextRef context, JSObjectRef function, JSObjectRef thisObject, size_t count, const JSValueRef arguments[], JSValueRef* exception)
{
    if (!thisObject || !exception) {
        return JSValueMakeUndefined(context);
    }
    auto* tree = static_cast<const void*>(JSObjectGetPrivate(thisObject));
    uintptr_t encodedOperation = reinterpret_cast<uintptr_t>(JSObjectGetPrivate(function));
    if (!tree || !encodedOperation) {
        setException(context, exception, "Illegal __bunDOM receiver");
        return JSValueMakeUndefined(context);
    }
    uint32_t operation = static_cast<uint32_t>(encodedOperation - 1);
    std::string first, second;
    uint32_t nodeId = UINT32_MAX;
    if (operation == 0) {
        size_t required = 1;
        if (count < required) {
            setException(context, exception, "Not enough arguments for __bunDOM operation");
            return JSValueMakeUndefined(context);
        }
        if (!copyJSString(context, arguments[0], first, exception))
            return JSValueMakeUndefined(context);
    } else if (operation >= 1 && operation <= 4) {
        size_t idIndex = 0;
        if (count > idIndex && !JSValueIsUndefined(context, arguments[idIndex]) && !JSValueIsNull(context, arguments[idIndex])) {
            if (!JSValueIsNumber(context, arguments[idIndex])) {
                setException(context, exception, "__bunDOM node ID must be an unsigned integer");
                return JSValueMakeUndefined(context);
            }
            JSValueRef conversionException = nullptr;
            double number = JSValueToNumber(context, arguments[idIndex], &conversionException);
            if (conversionException || number < 0 || number > UINT32_MAX || number != static_cast<double>(static_cast<uint32_t>(number))) {
                setException(context, exception, "__bunDOM node ID must be an unsigned integer");
                return JSValueMakeUndefined(context);
            }
            nodeId = static_cast<uint32_t>(number);
        }
        if (operation == 3 || operation == 4) {
            size_t required = operation == 3 ? 2 : 3;
            if (count < required) {
                setException(context, exception, "Not enough arguments for __bunDOM attribute operation");
                return JSValueMakeUndefined(context);
            }
            if (!copyJSString(context, arguments[1], first, exception))
                return JSValueMakeUndefined(context);
        }
        if (operation == 4 && !copyJSString(context, arguments[2], second, exception))
            return JSValueMakeUndefined(context);
    } else {
        setException(context, exception, "Unknown __bunDOM operation");
        return JSValueMakeUndefined(context);
    }
    auto result = Bun__BrowserRealm__dom(
        tree, operation, nodeId,
        reinterpret_cast<const uint8_t*>(first.data()), first.size(),
        reinterpret_cast<const uint8_t*>(second.data()), second.size());
    if (!result.bytes) {
        setException(context, exception, "Native DOM operation allocation failed");
        return JSValueMakeUndefined(context);
    }
    WTF::String json = fromUTF8(result.bytes, result.length);
    JSStringRef jsonString = makeJSString(json);
    JSValueRef value = nullptr;
    if (result.status == 0)
        value = JSValueMakeFromJSONString(context, jsonString);
    else
        *exception = JSValueMakeFromJSONString(context, jsonString);
    JSStringRelease(jsonString);
    Bun__BrowserRealm__free_dom_bytes(result.bytes, result.length);
    if (result.status != 0) {
        if (!*exception)
            setException(context, exception, "Native DOM operation failed");
        return JSValueMakeUndefined(context);
    }
    if (!value) {
        setException(context, exception, "Native DOM operation returned invalid JSON");
        return JSValueMakeUndefined(context);
    }
    return value;
}

extern "C" void* Bun__BrowserRealm__create(
    JSC::JSGlobalObject* hostGlobal,
    const void* tree,
    const uint8_t* origin, size_t originLength,
    const uint8_t* frameId, size_t frameIdLength)
{
    if (!hostGlobal || !tree || (originLength && !origin) || (frameIdLength && !frameId))
        return nullptr;
    auto* handle = new (std::nothrow) BrowserRealmHandle;
    if (!handle)
        return nullptr;
    auto group = JSC::toRef(&hostGlobal->vm());
    handle->context = JSGlobalContextCreateInGroup(group, nullptr);
    if (!handle->context) {
        delete handle;
        return nullptr;
    }
    handle->global = JSC::toJS(handle->context);
    handle->tree = tree;
    if (!installDOM(*handle, origin, originLength, frameId, frameIdLength)) {
        JSGlobalContextRelease(handle->context);
        delete handle;
        return nullptr;
    }
    return handle;
}

extern "C" bool Bun__BrowserRealm__evaluate(
    void* opaque,
    const uint8_t* source, size_t sourceLength,
    const uint8_t* sourceURL, size_t sourceURLLength,
    uint32_t timeoutMs,
    BrowserRealmResult* output)
{
    if (!opaque || !output || (sourceLength && !source) || (sourceURLLength && !sourceURL))
        return false;
    auto& handle = *static_cast<BrowserRealmHandle*>(opaque);
    if (!handle.context || !handle.global)
        return false;

    JSStringRef code = makeJSString(fromUTF8(source, sourceLength));
    JSStringRef url = makeJSString(fromUTF8(sourceURL, sourceURLLength));
    if (!code || !url) {
        if (code) JSStringRelease(code);
        if (url) JSStringRelease(url);
        return false;
    }
    JSValueRef exception = nullptr;
    JSValueRef value = nullptr;
    BrowserRealmResult encoded { nullptr, 0, 0 };
    {
        Bun::NodeVMRunTermination termination(handle.global, Seconds::fromMilliseconds(timeoutMs), false, true);
        value = JSEvaluateScript(handle.context, code, nullptr, url, 1, &exception);
        JSValueRef converted = exception ? exception : value;
        if (!converted) {
            static constexpr uint8_t undefined[] = "undefined";
            encoded = copyBytes(std::span<const uint8_t> { undefined, sizeof(undefined) - 1 }, 0);
        } else {
            // String conversion is JavaScript execution too: hostile valueOf /
            // toString must stay inside the same VM deadline as the script.
            JSValueRef conversionException = nullptr;
            JSStringRef result = JSValueToStringCopy(handle.context, converted, &conversionException);
            if (!result) {
                static constexpr char failed[] = "Page result conversion threw";
                encoded = copyString(failed, 1);
            } else {
                size_t capacity = JSStringGetMaximumUTF8CStringSize(result);
                std::vector<uint8_t> buffer(capacity);
                size_t written = JSStringGetUTF8CString(result, reinterpret_cast<char*>(buffer.data()), buffer.size());
                JSStringRelease(result);
                if (!written) {
                    static constexpr char failed[] = "Unable to encode page evaluation result";
                    encoded = copyString(failed, 1);
                } else {
                    encoded = copyBytes(std::span<const uint8_t> { buffer.data(), written - 1 }, exception || conversionException ? 1 : 0);
                }
            }
        }
        auto scope = DECLARE_THROW_SCOPE(handle.global->vm());
        bool timedOut = termination.didTimeOut();
        bool ownInterruption = termination.finish(scope);
        if (ownInterruption) {
            if (termination.vm().hasPendingTermination()) {
                // An enclosing VM stop wins. Keep it pending and do not let a
                // page-local timeout result report a successful completion.
                encoded.status = 1;
            } else {
                // finish() installed a page Error in the VM. The host API
                // returns a diagnostic as bytes, so clear that exception
                // before control returns to the Bun caller.
                scope.clearException();
                std::string message;
                if (timedOut) {
                    message = "Script execution timed out after ";
                    message += std::to_string(timeoutMs);
                    message += "ms";
                } else {
                    message = "Script execution was interrupted";
                }
                if (encoded.bytes)
                    std::free(encoded.bytes);
                encoded = copyString(message, 1);
            }
        }
    }
    JSStringRelease(code);
    JSStringRelease(url);
    *output = encoded;
    return output->bytes != nullptr && output->status == 0;
}

extern "C" void Bun__BrowserRealm__release(void* opaque)
{
    if (!opaque)
        return;
    auto* handle = static_cast<BrowserRealmHandle*>(opaque);
    if (handle->context) {
        JSGlobalContextRelease(handle->context);
        handle->context = nullptr;
        handle->global = nullptr;
    }
    delete handle;
}

extern "C" void Bun__BrowserRealm__free_bytes(uint8_t* bytes, size_t)
{
    std::free(bytes);
}

} // namespace Bun
