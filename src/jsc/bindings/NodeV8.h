#pragma once

#include "root.h"

#include <JavaScriptCore/CollectionScope.h>
#include <JavaScriptCore/Heap.h>
#include <JavaScriptCore/HeapObserver.h>
#include <JavaScriptCore/JSGlobalObject.h>
#include <JavaScriptCore/JSObject.h>
#include <JavaScriptCore/Strong.h>
#include <JavaScriptCore/VM.h>
#include <wtf/HashMap.h>
#include <wtf/MonotonicTime.h>
#include <wtf/Vector.h>

#include <algorithm>
#include <atomic>
#include <optional>
#include <utility>

namespace Bun {

// One record per garbage collection observed while at least one GCProfiler is
// running. Only values JavaScriptCore actually measures are stored; the shape
// node:v8 reports is assembled in src/js/node/v8.ts.
struct GCEventRecord {
    bool isFullCollection { false };
    double costMicroseconds { 0 };
    size_t usedBefore { 0 };
    size_t capacityBefore { 0 };
    size_t externalBefore { 0 };
    size_t usedAfter { 0 };
    size_t capacityAfter { 0 };
    size_t externalAfter { 0 };
};

// Lives on Zig::GlobalObject so its lifetime matches the VM's; a worker that
// exits with a session still open drops it (and detaches from the heap) when
// the global object is destroyed.
class GCProfilerObserver final : public JSC::HeapObserver {
    WTF_DEPRECATED_MAKE_FAST_ALLOCATED(GCProfilerObserver);

public:
    explicit GCProfilerObserver(JSC::VM& vm)
        : m_vm(&vm)
    {
    }

    ~GCProfilerObserver() final
    {
        if (m_attached)
            m_vm->heap.removeObserver(this);
    }

    void willGarbageCollect() final
    {
        auto& heap = m_vm->heap;
        m_collectionStart = WTF::MonotonicTime::now();
        m_capacityBefore = heap.capacity();
        m_externalBefore = heap.extraMemorySize();
        // Only sessions that existed at this prologue receive the record; a
        // profiler started during the concurrent phase has no honest start time
        // for this collection.
        for (auto& entry : m_sessions)
            entry.value.sawPrologue = true;
    }

    void didGarbageCollect(JSC::CollectionScope collectionScope) final
    {
        // A collection already in flight when a profiler starts has no
        // matching willGarbageCollect(), so there is no honest start time.
        // Skip it rather than report a made-up cost, as node's profiler does.
        auto collectionStart = std::exchange(m_collectionStart, std::nullopt);
        if (!collectionStart || m_sessions.isEmpty())
            return;

        auto& heap = m_vm->heap;
        GCEventRecord record;
        record.isFullCollection = collectionScope == JSC::CollectionScope::Full;
        record.costMicroseconds = std::max(0.0, (WTF::MonotonicTime::now() - *collectionStart).microseconds());
        // JavaScriptCore records the live-bytes figure on both sides of the
        // collection it just finished, so these two numbers are measured rather
        // than sampled after the fact.
        if (record.isFullCollection) {
            record.usedBefore = heap.sizeBeforeLastFullCollection();
            record.usedAfter = heap.sizeAfterLastFullCollection();
        } else {
            record.usedBefore = heap.sizeBeforeLastEdenCollection();
            record.usedAfter = heap.sizeAfterLastEdenCollection();
        }
        record.capacityAfter = heap.capacity();
        record.externalAfter = heap.extraMemorySize();
        // For a full collection Heap::willStartCollection() zeroes m_extraMemorySize
        // before notifying observers, so the prologue sample under-reports; reuse the
        // epilogue value so external memory doesn't appear to grow across a sweep.
        record.capacityBefore = record.isFullCollection ? record.capacityAfter : m_capacityBefore;
        record.externalBefore = record.isFullCollection ? record.externalAfter : m_externalBefore;

        for (auto& entry : m_sessions) {
            if (std::exchange(entry.value.sawPrologue, false))
                entry.value.records.append(record);
        }
    }

    uint32_t startSession()
    {
        bool wasEmpty = m_sessions.isEmpty();
        uint32_t id = m_nextSessionID++;
        m_sessions.add(id, SessionData {});
        if (wasEmpty) {
            // Drop any timestamp left by a collection observed before the last
            // detach; pairing it with this session would report its cost as all
            // the wall time in between.
            m_collectionStart = std::nullopt;
            m_vm->heap.addObserver(this);
            m_attached = true;
        }
        return id;
    }

    std::optional<WTF::Vector<GCEventRecord>> stopSession(uint32_t id)
    {
        auto it = m_sessions.find(id);
        if (it == m_sessions.end())
            return std::nullopt;
        WTF::Vector<GCEventRecord> records = std::move(it->value.records);
        m_sessions.remove(it);
        if (m_sessions.isEmpty()) {
            m_collectionStart = std::nullopt;
            m_vm->heap.removeObserver(this);
            m_attached = false;
        }
        return records;
    }

private:
    struct SessionData {
        WTF::Vector<GCEventRecord> records;
        bool sawPrologue { false };
    };

    JSC::VM* m_vm;
    WTF::HashMap<uint32_t, SessionData, WTF::IntHash<uint32_t>, WTF::UnsignedWithZeroKeyHashTraits<uint32_t>> m_sessions;
    uint32_t m_nextSessionID { 1 };
    bool m_attached { false };
    std::optional<WTF::MonotonicTime> m_collectionStart;
    size_t m_capacityBefore { 0 };
    size_t m_externalBefore { 0 };
};

// A JavaScript heap limit (--max-old-space-size) and the "near the limit"
// notification node:v8 setHeapSnapshotNearHeapLimit() needs, both measured
// on the live bytes JavaScriptCore reports after each collection. Lives on
// Zig::GlobalObject. didGarbageCollect() can run on the collector thread with
// the mutator stopped, so it never runs JS: the near-limit callback is posted
// to the context's event loop, and the hard limit ends the process (main
// thread, like node's fatal OOM) or terminates the worker's VM.
class HeapLimitObserver final : public JSC::HeapObserver {
    WTF_DEPRECATED_MAKE_FAST_ALLOCATED(HeapLimitObserver);

public:
    explicit HeapLimitObserver(JSC::JSGlobalObject*);
    ~HeapLimitObserver() final;

    void willGarbageCollect() final {}
    void didGarbageCollect(JSC::CollectionScope) final;

    // 0 removes the limit.
    void setLimit(size_t bytes);
    size_t limit() const { return m_limit.load(std::memory_order_relaxed); }

    // Null clears it. Called on the JS thread.
    void setNearLimitCallback(JSC::VM&, JSC::JSObject*);
    void runNearLimitCallback(JSC::JSGlobalObject*, size_t used);

private:
    void updateAttachment();

    JSC::VM* m_vm;
    uint32_t m_contextIdentifier { 0 };
    bool m_isMainThread { false };
    bool m_attached { false };
    std::atomic<size_t> m_limit { 0 };
    std::atomic<bool> m_hasNearCallback { false };
    std::atomic<bool> m_nearArmed { true };
    JSC::Strong<JSC::JSObject> m_nearCallback;
};

JSC::JSObject* createNodeV8Binding(JSC::JSGlobalObject* globalObject);

// --expose-gc (CLI or v8.setFlagsFromString): node:vm contexts created while
// it is set get a global gc().
void setExposeGcInNewContexts(bool);
bool exposeGcInNewContexts();

} // namespace Bun
