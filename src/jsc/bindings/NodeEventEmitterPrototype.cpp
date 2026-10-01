#include "root.h"

#include "NodeEventEmitterPrototype.h"

#include "BunBuiltinNames.h"
#include "BunClientData.h"
#include "InternalModuleRegistry.h"
#include "WebCoreJSBuiltins.h"
#include "ZigGlobalObject.h"
#include <JavaScriptCore/JSFunction.h>
#include <JavaScriptCore/Lookup.h>
#include <JavaScriptCore/Symbol.h>
#include <wtf/text/SymbolRegistry.h>

namespace Bun {

using namespace JSC;
using namespace WebCore;

using BuiltinName = WebCore::BunBuiltinNames::Name;
using Generator = FunctionExecutable* (*)(VM&);

static constexpr unsigned constantGlobal = PropertyAttribute::DontEnum | PropertyAttribute::ReadOnly;

// The functions that the methods call, each under the `$name` that a builtin reads it by.
static constexpr struct {
    BuiltinName name;
    Generator generator;
} helpers[] = {
    { BuiltinName::k_nodeEventsAddListener, eventEmitterPrototypeInternalAddListenerCodeGenerator },
    { BuiltinName::k_nodeEventsApplyHandlers, eventEmitterPrototypeApplyHandlersCodeGenerator },
    { BuiltinName::k_nodeEventsCopyWithInserted, eventEmitterPrototypeCopyWithInsertedCodeGenerator },
    { BuiltinName::k_nodeEventsEmitError, eventEmitterPrototypeEmitErrorCodeGenerator },
    { BuiltinName::k_nodeEventsOnceWrap, eventEmitterPrototypeInternalOnceWrapCodeGenerator },
    { BuiltinName::k_nodeEventsOverflowWarning, eventEmitterPrototypeOverflowWarningCodeGenerator },
};

// Defines what the methods read by a `$nodeEvents` name, apart from the two symbols that the prototype is
// created with. JavaScriptCore resolves such a name when a function is first called, so this runs before a
// function that reads one exists.
static void defineMethodNames(Zig::GlobalObject* globalObject)
{
    auto& vm = JSC::getVM(globalObject);
    auto& names = WebCore::builtinNames(vm);
    if (globalObject->builtinGlobal(names.nodeEventsAddListenerPrivateName()))
        return;

    // events.defaultMaxListeners and events.setMaxListeners(n) assign this one.
    globalObject->addBuiltinGlobal(names.nodeEventsDefaultMaxListenersPrivateName(), jsNumber(10), PropertyAttribute::DontEnum | 0);
    globalObject->addBuiltinGlobal(names.nodeEventsKErrorMonitorPrivateName(), Symbol::create(vm, vm.symbolRegistry().symbolForKey("events.errorMonitor"_s)), constantGlobal);
    for (auto& helper : helpers)
        globalObject->addBuiltinGlobal(names.privateName(helper.name), JSFunction::create(vm, globalObject, helper.generator(vm), globalObject), constantGlobal);
}

static JSValue createMethod(VM& vm, JSObject* prototype, Generator generator)
{
    auto* globalObject = defaultGlobalObject(prototype->globalObject());
    defineMethodNames(globalObject);
    return JSFunction::create(vm, globalObject, generator(vm), globalObject);
}

// `on` is `addListener`, and `off` is `removeListener`: one function under two names. The first read of one name
// creates the function for both, so a program gets the same function whichever name it reads first. A name that
// the program assigned before that keeps what it was assigned.
static JSValue createMethodWithAlias(VM& vm, JSObject* prototype, Generator generator, ASCIILiteral name, ASCIILiteral alias)
{
    JSValue function = createMethod(vm, prototype, generator);
    for (auto key : { name, alias }) {
        auto identifier = Identifier::fromString(vm, key);
        if (!prototype->getDirect(vm, identifier))
            prototype->putDirect(vm, identifier, function);
    }
    return function;
}

template<Generator generator>
static JSValue eventEmitterMethod(VM& vm, JSObject* prototype)
{
    return createMethod(vm, prototype, generator);
}

static JSValue eventEmitterAddListener(VM& vm, JSObject* prototype)
{
    return createMethodWithAlias(vm, prototype, eventEmitterPrototypeAddListenerCodeGenerator, "addListener"_s, "on"_s);
}

static JSValue eventEmitterRemoveListener(VM& vm, JSObject* prototype)
{
    return createMethodWithAlias(vm, prototype, eventEmitterPrototypeRemoveListenerCodeGenerator, "removeListener"_s, "off"_s);
}

// JavaScript creates the two values below. When that throws, the result is empty: the read throws, and the next
// read creates the value again.

// The EventEmitter function of node:events: the first read evaluates the module.
static JSValue eventEmitterConstructor(VM& vm, JSObject* prototype)
{
    auto* globalObject = defaultGlobalObject(prototype->globalObject());
    auto scope = DECLARE_TOP_EXCEPTION_SCOPE(vm);
    JSValue constructor = globalObject->internalModuleRegistry()->requireId(globalObject, vm, InternalModuleRegistry::Field::NodeEvents);
    if (scope.exception()) [[unlikely]]
        return {};
    return constructor;
}

static JSValue eventEmitterEmit(VM& vm, JSObject* prototype)
{
    auto scope = DECLARE_TOP_EXCEPTION_SCOPE(vm);
    JSValue emit = nodeEventEmitterEmit(defaultGlobalObject(prototype->globalObject()));
    if (scope.exception()) [[unlikely]]
        return {};
    return emit;
}

// What a stream inherits: it has its `_events` before the constructor runs, which then leaves the count alone.
static JSValue eventEmitterEventsCount(VM&, JSObject*)
{
    return jsNumber(0);
}

// The own string keys of the prototype, in the order that the object literal of events.ts had.
/* Source for NodeEventEmitterPrototype.lut.h
@begin nodeEventEmitterPrototypeTable
  setMaxListeners        eventEmitterMethod<eventEmitterPrototypeSetMaxListenersCodeGenerator>        PropertyCallback
  constructor            eventEmitterConstructor                                                      PropertyCallback
  getMaxListeners        eventEmitterMethod<eventEmitterPrototypeGetMaxListenersCodeGenerator>        PropertyCallback
  emit                   eventEmitterEmit                                                             PropertyCallback
  addListener            eventEmitterAddListener                                                      PropertyCallback
  on                     eventEmitterAddListener                                                      PropertyCallback
  prependListener        eventEmitterMethod<eventEmitterPrototypePrependListenerCodeGenerator>        PropertyCallback
  once                   eventEmitterMethod<eventEmitterPrototypeOnceCodeGenerator>                   PropertyCallback
  prependOnceListener    eventEmitterMethod<eventEmitterPrototypePrependOnceListenerCodeGenerator>    PropertyCallback
  removeListener         eventEmitterRemoveListener                                                   PropertyCallback
  off                    eventEmitterRemoveListener                                                   PropertyCallback
  removeAllListeners     eventEmitterMethod<eventEmitterPrototypeRemoveAllListenersCodeGenerator>     PropertyCallback
  listeners              eventEmitterMethod<eventEmitterPrototypeListenersCodeGenerator>              PropertyCallback
  rawListeners           eventEmitterMethod<eventEmitterPrototypeRawListenersCodeGenerator>           PropertyCallback
  listenerCount          eventEmitterMethod<eventEmitterPrototypeListenerCountCodeGenerator>          PropertyCallback
  eventNames             eventEmitterMethod<eventEmitterPrototypeEventNamesCodeGenerator>             PropertyCallback
  _eventsCount           eventEmitterEventsCount                                                      PropertyCallback
@end
*/
#include "NodeEventEmitterPrototype.lut.h"

// A property of the table above is created when it is first read. Each one is a plain value. An entry with a
// getter or a setter would send every assignment to an emitter through the path that looks for setters.
class NodeEventEmitterPrototype final : public JSC::JSNonFinalObject {
public:
    using Base = JSC::JSNonFinalObject;
    static constexpr unsigned StructureFlags = Base::StructureFlags | HasStaticPropertyTable;

    DECLARE_INFO;

    template<typename CellType, JSC::SubspaceAccess>
    static JSC::GCClient::IsoSubspace* subspaceFor(JSC::VM& vm)
    {
        STATIC_ASSERT_ISO_SUBSPACE_SHARABLE(NodeEventEmitterPrototype, Base);
        return &vm.plainObjectSpace();
    }

    static NodeEventEmitterPrototype* create(VM& vm, JSGlobalObject* globalObject)
    {
        auto* structure = Structure::create(vm, globalObject, globalObject->objectPrototype(), TypeInfo(ObjectType, StructureFlags), info());
        auto* prototype = new (NotNull, allocateCell<NodeEventEmitterPrototype>(vm)) NodeEventEmitterPrototype(vm, structure);
        prototype->finishCreation(vm);
        return prototype;
    }

private:
    NodeEventEmitterPrototype(VM& vm, Structure* structure)
        : Base(vm, structure)
    {
    }
};

const ClassInfo NodeEventEmitterPrototype::s_info = { "EventEmitter"_s, &Base::s_info, &nodeEventEmitterPrototypeTable, nullptr, CREATE_METHOD_TABLE(NodeEventEmitterPrototype) };

JSObject* nodeEventEmitterPrototype(Zig::GlobalObject* globalObject)
{
    auto& vm = JSC::getVM(globalObject);
    auto& names = WebCore::builtinNames(vm);
    if (auto* existing = globalObject->m_nodeEventEmitterPrototype.get())
        return existing;

    // The two symbols are keys of every emitter, `process` included.
    auto* kCapture = Symbol::createWithDescription(vm, "kCapture"_s);
    globalObject->addBuiltinGlobal(names.nodeEventsKCapturePrivateName(), kCapture, constantGlobal);
    globalObject->addBuiltinGlobal(names.nodeEventsKShapeModePrivateName(), Symbol::createWithDescription(vm, "shapeMode"_s), constantGlobal);

    auto* prototype = NodeEventEmitterPrototype::create(vm, globalObject);
    // EventEmitter.captureRejections assigns this one.
    prototype->putDirect(vm, Identifier::fromUid(kCapture->privateName()), jsBoolean(false));

    globalObject->m_nodeEventEmitterPrototype.set(vm, globalObject, prototype);
    return prototype;
}

JSValue nodeEventEmitterPrototypeForModule(Zig::GlobalObject* globalObject)
{
    defineMethodNames(globalObject);
    return nodeEventEmitterPrototype(globalObject);
}

JSValue nodeEventEmitterEmit(Zig::GlobalObject* globalObject)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    if (auto* existing = globalObject->m_nodeEventEmitterEmit.get())
        return existing;

    defineMethodNames(globalObject);
    // `emit` has a rest parameter, which a builtin cannot have, so a builtin returns it.
    auto* createEmit = JSFunction::create(vm, globalObject, eventEmitterPrototypeCreateEmitCodeGenerator(vm), globalObject);
    JSValue emit = JSC::profiledCall(globalObject, ProfilingReason::API, createEmit, JSC::getCallData(createEmit), jsUndefined(), ArgList());
    RETURN_IF_EXCEPTION(scope, {});
    globalObject->m_nodeEventEmitterEmit.set(vm, globalObject, asObject(emit));
    return emit;
}

void initializeNodeEventEmitter(Zig::GlobalObject* globalObject, JSObject* emitter, JSObject* events, unsigned eventsCount)
{
    auto& vm = JSC::getVM(globalObject);
    auto& names = WebCore::builtinNames(vm);

    nodeEventEmitterPrototype(globalObject);
    auto* kShapeMode = asSymbol(globalObject->builtinGlobal(names.nodeEventsKShapeModePrivateName()));
    auto* kCapture = asSymbol(globalObject->builtinGlobal(names.nodeEventsKCapturePrivateName()));

    // The own properties of a new emitter, in the order that the constructor defines them.
    emitter->putDirect(vm, names._eventsPublicName(), events);
    emitter->putDirect(vm, Identifier::fromString(vm, "_eventsCount"_s), jsNumber(eventsCount));
    emitter->putDirect(vm, Identifier::fromUid(kShapeMode->privateName()), jsBoolean(false));
    emitter->putDirect(vm, Identifier::fromString(vm, "_maxListeners"_s), jsUndefined());
    emitter->putDirect(vm, Identifier::fromUid(kCapture->privateName()), jsBoolean(false));
}

}
