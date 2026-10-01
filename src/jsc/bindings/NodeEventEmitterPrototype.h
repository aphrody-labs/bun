#pragma once

#include "root.h"

namespace Zig {
class GlobalObject;
}

namespace Bun {

// `EventEmitter.prototype` of node:events. `process` inherits from it, so nearly every program creates it, and
// most never call a method: a method is a builtin of src/js/builtins/EventEmitterPrototype.ts that is created
// when it is first read. No module is evaluated until something reads `constructor`.
JSC::JSObject* nodeEventEmitterPrototype(Zig::GlobalObject*);

// The same for src/js/node/events.ts, which also reads the `$nodeEvents` names of the methods.
JSC::JSValue nodeEventEmitterPrototypeForModule(Zig::GlobalObject*);

// The `emit` that EventEmitter.prototype has until a program assigns another one. Native code calls this one.
// The first call runs a builtin to create it: the result is empty when that threw.
JSC::JSValue nodeEventEmitterEmit(Zig::GlobalObject*);

// What the EventEmitter constructor of src/js/node/events.ts does to a new emitter, for an object that native
// code creates. `events` becomes its `_events`, and holds `eventsCount` events.
void initializeNodeEventEmitter(Zig::GlobalObject*, JSC::JSObject* emitter, JSC::JSObject* events, unsigned eventsCount);

}
