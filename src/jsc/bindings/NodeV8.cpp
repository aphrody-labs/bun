// Native support for the parts of `node:v8` that need to observe the
// JavaScriptCore heap directly.
#include "root.h"

#include "ErrorCode.h"
#include "NodeV8.h"
#include "ScriptExecutionContext.h"
#include "ZigGlobalObject.h"

#include <JavaScriptCore/JSArray.h>
#include <JavaScriptCore/JSCJSValue.h>
#include <JavaScriptCore/JSObject.h>
#include <JavaScriptCore/JSString.h>
#include <JavaScriptCore/ObjectConstructor.h>
#include <wtf/StdLibExtras.h>

#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace Bun {

using namespace JSC;

// v8.isStringOneByteRepresentation() asks whether the engine is storing the
// string with one byte per character. JSC's JSString::is8Bit() answers exactly
// that question, so this is a faithful mapping rather than a content scan.
JSC_DEFINE_HOST_FUNCTION(functionIsStringOneByteRepresentation, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    JSValue argument = callFrame->argument(0);
    if (!argument.isString())
        return Bun::ERR::INVALID_ARG_TYPE(scope, globalObject, "content"_s, "string"_s, argument);

    return JSValue::encode(jsBoolean(asString(argument)->is8Bit()));
}

static GCProfilerObserver& ensureGCProfilerObserver(JSGlobalObject* globalObject)
{
    auto* global = defaultGlobalObject(globalObject);
    auto& slot = global->m_gcProfilerObserver;
    if (!slot)
        slot = makeUnique<GCProfilerObserver>(global->vm());
    return *slot;
}

JSC_DEFINE_HOST_FUNCTION(functionStartGCProfiler, (JSGlobalObject * globalObject, CallFrame*))
{
    return JSValue::encode(jsNumber(ensureGCProfilerObserver(globalObject).startSession()));
}

// FinalizationRegistry cleanup path: release the session without materializing
// the JS report, so an abandoned profiler that observed many collections is
// O(1) in JS-heap terms to clean up.
JSC_DEFINE_HOST_FUNCTION(functionDiscardGCProfiler, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    uint32_t id = callFrame->argument(0).toUInt32(globalObject);
    RETURN_IF_EXCEPTION(scope, {});

    ensureGCProfilerObserver(globalObject).stopSession(id);
    return JSValue::encode(jsUndefined());
}

JSC_DEFINE_HOST_FUNCTION(functionStopGCProfiler, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    uint32_t id = callFrame->argument(0).toUInt32(globalObject);
    RETURN_IF_EXCEPTION(scope, {});

    auto records = ensureGCProfilerObserver(globalObject).stopSession(id);
    if (!records)
        return JSValue::encode(jsUndefined());

    JSArray* result = constructEmptyArray(globalObject, nullptr, records->size());
    RETURN_IF_EXCEPTION(scope, {});

    unsigned index = 0;
    for (const auto& record : *records) {
        JSObject* entry = constructEmptyObject(globalObject);
        Bun::putDirectNamed(vm, entry, "isFullCollection"_s, jsBoolean(record.isFullCollection));
        Bun::putDirectNamed(vm, entry, "cost"_s, jsNumber(record.costMicroseconds));
        Bun::putDirectNamed(vm, entry, "usedBefore"_s, jsNumber(record.usedBefore));
        Bun::putDirectNamed(vm, entry, "capacityBefore"_s, jsNumber(record.capacityBefore));
        Bun::putDirectNamed(vm, entry, "externalBefore"_s, jsNumber(record.externalBefore));
        Bun::putDirectNamed(vm, entry, "usedAfter"_s, jsNumber(record.usedAfter));
        Bun::putDirectNamed(vm, entry, "capacityAfter"_s, jsNumber(record.capacityAfter));
        Bun::putDirectNamed(vm, entry, "externalAfter"_s, jsNumber(record.externalAfter));
        result->putDirectIndex(globalObject, index++, entry);
        RETURN_IF_EXCEPTION(scope, {});
    }

    return JSValue::encode(result);
}

HeapLimitObserver::HeapLimitObserver(JSGlobalObject* globalObject)
    : m_vm(&globalObject->vm())
{
    if (auto* context = defaultGlobalObject(globalObject)->scriptExecutionContext()) {
        m_contextIdentifier = context->identifier();
        m_isMainThread = context->isMainThread();
    }
}

HeapLimitObserver::~HeapLimitObserver()
{
    if (m_attached)
        m_vm->heap.removeObserver(this);
}

void HeapLimitObserver::updateAttachment()
{
    bool wanted = limit() != 0;
    if (wanted == m_attached)
        return;
    if (wanted)
        m_vm->heap.addObserver(this);
    else
        m_vm->heap.removeObserver(this);
    m_attached = wanted;
}

void HeapLimitObserver::setLimit(size_t bytes)
{
    m_limit.store(bytes, std::memory_order_relaxed);
    m_nearArmed.store(true, std::memory_order_relaxed);
    updateAttachment();
}

void HeapLimitObserver::setNearLimitCallback(VM& vm, JSObject* callback)
{
    if (callback)
        m_nearCallback.set(vm, callback);
    else
        m_nearCallback.clear();
    m_hasNearCallback.store(callback != nullptr, std::memory_order_relaxed);
}

void HeapLimitObserver::didGarbageCollect(CollectionScope collectionScope)
{
    size_t limit = this->limit();
    if (!limit)
        return;

    bool isFull = collectionScope == CollectionScope::Full;
    size_t used = isFull ? m_vm->heap.sizeAfterLastFullCollection() : m_vm->heap.sizeAfterLastCollection();

    // Only a full collection says what is really live; an eden figure still counts old garbage.
    if (isFull && used > limit) {
        if (m_isMainThread) {
            static constexpr char message[] = "\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n";
            fwrite(message, 1, sizeof(message) - 1, stderr);
            fflush(stderr);
            std::_Exit(134);
        }
        if (m_limit.exchange(0, std::memory_order_relaxed))
            m_vm->notifyNeedTermination();
        return;
    }

    size_t nearThreshold = limit / 10 * 9;
    if (used >= nearThreshold) {
        if (m_hasNearCallback.load(std::memory_order_relaxed) && m_nearArmed.exchange(false, std::memory_order_relaxed)) {
            WebCore::ScriptExecutionContext::postTaskTo(m_contextIdentifier, BunLoopKind::Regular, [used](WebCore::ScriptExecutionContext& context) {
                auto* global = defaultGlobalObject(context.jsGlobalObject());
                if (auto& observer = global->m_heapLimitObserver)
                    observer->runNearLimitCallback(global, used);
            });
        }
    } else if (isFull && used < limit / 10 * 8) {
        m_nearArmed.store(true, std::memory_order_relaxed);
    }
}

void HeapLimitObserver::runNearLimitCallback(JSGlobalObject* globalObject, size_t used)
{
    JSObject* callback = m_nearCallback.get();
    if (!callback)
        return;
    auto& vm = globalObject->vm();
    auto scope = DECLARE_TOP_EXCEPTION_SCOPE(vm);
    MarkedArgumentBuffer args;
    args.append(jsNumber(used));
    args.append(jsNumber(limit()));
    JSC::profiledCall(globalObject, ProfilingReason::API, callback, JSC::getCallData(callback), jsUndefined(), args);
    if (auto* exception = scope.exception()) [[unlikely]] {
        (void)scope.tryClearException();
        Zig::GlobalObject::reportUncaughtExceptionAtEventLoop(globalObject, exception);
    }
}

static HeapLimitObserver& ensureHeapLimitObserver(JSGlobalObject* globalObject)
{
    auto* global = defaultGlobalObject(globalObject);
    auto& slot = global->m_heapLimitObserver;
    if (!slot)
        slot = makeUnique<HeapLimitObserver>(global);
    return *slot;
}

JSC_DEFINE_HOST_FUNCTION(functionHeapLimit, (JSGlobalObject * globalObject, CallFrame*))
{
    auto* global = defaultGlobalObject(globalObject);
    size_t limit = global->m_heapLimitObserver ? global->m_heapLimitObserver->limit() : 0;
    return JSValue::encode(jsNumber(limit));
}

JSC_DEFINE_HOST_FUNCTION(functionSetHeapLimit, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    double bytes = callFrame->argument(0).toNumber(globalObject);
    RETURN_IF_EXCEPTION(scope, {});
    ensureHeapLimitObserver(globalObject).setLimit(std::isfinite(bytes) && bytes > 0 ? static_cast<size_t>(bytes) : 0);
    return JSValue::encode(jsUndefined());
}

// (used, limit) => void, run on the event loop once the live heap after a
// collection reaches 90% of the limit. Re-armed when a full collection
// brings it back under 80%, or when the limit changes.
JSC_DEFINE_HOST_FUNCTION(functionSetNearHeapLimitCallback, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    auto& vm = JSC::getVM(globalObject);
    JSValue callback = callFrame->argument(0);
    ensureHeapLimitObserver(globalObject).setNearLimitCallback(vm, callback.isCallable() ? callback.getObject() : nullptr);
    return JSValue::encode(jsUndefined());
}

// V8's --expose-gc is process-wide: set on the command line or later through
// v8.setFlagsFromString(), it gives every context created afterwards a global
// gc(), which is how `vm.runInNewContext("gc")` obtains one in node.
static std::atomic<bool> s_exposeGcInNewContexts { false };

void setExposeGcInNewContexts(bool expose)
{
    s_exposeGcInNewContexts.store(expose, std::memory_order_relaxed);
}

bool exposeGcInNewContexts()
{
    return s_exposeGcInNewContexts.load(std::memory_order_relaxed);
}

JSC_DEFINE_HOST_FUNCTION(functionSetExposeGc, (JSGlobalObject * globalObject, CallFrame* callFrame))
{
    setExposeGcInNewContexts(callFrame->argument(0).toBoolean(globalObject));
    return JSValue::encode(jsUndefined());
}

// bun_runtime's Arguments.rs; --max-old-space-size in MiB, 0 when absent.
extern "C" uint64_t Bun__Node__MaxOldSpaceSizeMB;

extern "C" void Bun__NodeV8__applyMaxOldSpaceSize(JSGlobalObject* globalObject)
{
    uint64_t megabytes = Bun__Node__MaxOldSpaceSizeMB;
    if (!megabytes)
        return;
    ensureHeapLimitObserver(globalObject).setLimit(static_cast<size_t>(megabytes) * 1024 * 1024);
}

JSC::JSObject* createNodeV8Binding(JSC::JSGlobalObject* globalObject)
{
    auto& vm = JSC::getVM(globalObject);
    JSC::JSObject* object = JSC::constructEmptyObject(vm, globalObject->nullPrototypeObjectStructure());
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "isStringOneByteRepresentation"_s), 1, functionIsStringOneByteRepresentation, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "startGCProfiler"_s), 0, functionStartGCProfiler, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "stopGCProfiler"_s), 1, functionStopGCProfiler, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "discardGCProfiler"_s), 1, functionDiscardGCProfiler, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "heapLimit"_s), 0, functionHeapLimit, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "setHeapLimit"_s), 1, functionSetHeapLimit, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "setNearHeapLimitCallback"_s), 1, functionSetNearHeapLimitCallback, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    object->putDirectNativeFunction(vm, globalObject, JSC::Identifier::fromString(vm, "setExposeGc"_s), 1, functionSetExposeGc, ImplementationVisibility::Public, JSC::NoIntrinsic, 0);
    return object;
}

} // namespace Bun
