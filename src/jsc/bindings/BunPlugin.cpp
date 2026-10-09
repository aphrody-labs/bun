#include "BunPlugin.h"

#include "JavaScriptCore/CallData.h"
#include "JavaScriptCore/ExceptionScope.h"
#include "JavaScriptCore/JSCast.h"
#include "headers-handwritten.h"
#include "helpers.h"
#include "ZigGlobalObject.h"

#include <JavaScriptCore/JSCInlines.h>
#include <JavaScriptCore/JSGlobalObject.h>
#include <JavaScriptCore/JSMap.h>
#include <JavaScriptCore/JSMapInlines.h>
#include <JavaScriptCore/JSModuleLoader.h>
#include <JavaScriptCore/ModuleRegistryEntry.h>
#include <JavaScriptCore/CyclicModuleRecord.h>
#include <JavaScriptCore/JSModuleNamespaceObject.h>
#include <JavaScriptCore/JSModuleRecord.h>
#include <JavaScriptCore/JSObjectInlines.h>
#include <JavaScriptCore/JSPromise.h>
#include <JavaScriptCore/JSTypeInfo.h>
#include <JavaScriptCore/JavaScript.h>
#include <JavaScriptCore/ObjectConstructor.h>
#include <JavaScriptCore/RegExpObject.h>
#include <JavaScriptCore/RegularExpression.h>
#include <JavaScriptCore/SourceOrigin.h>
#include <JavaScriptCore/Structure.h>
#include <JavaScriptCore/SubspaceInlines.h>
#include <wtf/text/WTFString.h>

#include "BunClientData.h"
#include "JSCommonJSModule.h"
#include "isBuiltinModule.h"
#include "AsyncContextFrame.h"
#include "ImportMetaObject.h"
#include "BunModuleRegistry.h"
#include "WebCoreJSBuiltins.h"
#include <JavaScriptCore/IterationKind.h>
#include <JavaScriptCore/JSBoundFunction.h>
#include <JavaScriptCore/JSMapIterator.h>

BUN_DECLARE_HOST_FUNCTION(JSMock__jsMockFn);

namespace Zig {

static bool isValidNamespaceString(String& namespaceString)
{
    static JSC::Yarr::RegularExpression* namespaceRegex = nullptr;
    if (!namespaceRegex) {
        namespaceRegex = new JSC::Yarr::RegularExpression("^([/@a-zA-Z0-9_\\-]+)$"_s);
    }
    return namespaceRegex->match(namespaceString) > -1;
}

static JSC::EncodedJSValue jsFunctionAppendOnLoadPluginBody(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe, BunPluginTarget target, BunPlugin::Base& plugin)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (callframe->argumentCount() < 2) {
        throwException(globalObject, scope, createError(globalObject, "onLoad() requires at least 2 arguments"_s));
        return {};
    }

    auto* filterObject = callframe->uncheckedArgument(0).toObject(globalObject);
    RETURN_IF_EXCEPTION(scope, {});
    JSC::RegExpObject* filter = nullptr;
    auto filterValue = filterObject->getIfPropertyExists(globalObject, Identifier::fromString(vm, "filter"_s));
    RETURN_IF_EXCEPTION(scope, {});
    if (filterValue) {
        if (filterValue.isCell() && filterValue.asCell()->inherits<JSC::RegExpObject>())
            filter = uncheckedDowncast<JSC::RegExpObject>(filterValue);
    }

    if (!filter) {
        throwException(globalObject, scope, createError(globalObject, "onLoad() expects first argument to be an object with a filter RegExp"_s));
        return {};
    }

    String namespaceString = String();
    auto namespaceValue = filterObject->getIfPropertyExists(globalObject, Identifier::fromString(vm, "namespace"_s));
    RETURN_IF_EXCEPTION(scope, {});
    if (namespaceValue) {
        if (namespaceValue.isString()) {
            namespaceString = namespaceValue.toWTFString(globalObject);
            RETURN_IF_EXCEPTION(scope, {});
            if (!isValidNamespaceString(namespaceString)) {
                throwException(globalObject, scope, createError(globalObject, "namespace can only contain letters, numbers, dashes, or underscores"_s));
                return {};
            }
        }
    }

    auto func = callframe->uncheckedArgument(1);

    if (!func.isCell() || !func.isCallable()) {
        throwException(globalObject, scope, createError(globalObject, "onLoad() expects second argument to be a function"_s));
        return {};
    }

    plugin.append(vm, filter->regExp(), func.getObject(), namespaceString);

    return JSValue::encode(callframe->thisValue());
}

static EncodedJSValue jsFunctionAppendVirtualModulePluginBody(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (callframe->argumentCount() < 2) {
        throwException(globalObject, scope, createError(globalObject, "module() needs 2 arguments: a module ID and a function to call"_s));
        return {};
    }

    JSValue moduleIdValue = callframe->uncheckedArgument(0);
    JSValue functionValue = callframe->uncheckedArgument(1);

    if (!moduleIdValue.isString()) {
        throwException(globalObject, scope, createError(globalObject, "module() expects first argument to be a string for the module ID"_s));
        return {};
    }

    if (!functionValue.isCallable()) {
        throwException(globalObject, scope, createError(globalObject, "module() expects second argument to be a function"_s));
        return {};
    }

    String moduleId = moduleIdValue.toWTFString(globalObject);
    RETURN_IF_EXCEPTION(scope, {});

    if (moduleId.isEmpty()) {
        throwException(globalObject, scope, createError(globalObject, "virtual module cannot be blank"_s));
        return {};
    }

    if (Bun::isBuiltinModule(moduleId)) {
        throwException(globalObject, scope, createError(globalObject, makeString("module() cannot be used to override builtin module \""_s, moduleId, "\""_s)));
        return {};
    }

    if (moduleId.startsWith("."_s)) {
        throwException(globalObject, scope, createError(globalObject, "virtual module cannot start with \".\""_s));
        return {};
    }

    Zig::GlobalObject* global = defaultGlobalObject(globalObject);

    if (global->onLoadPlugins.virtualModules == nullptr) {
        global->onLoadPlugins.virtualModules = new BunPlugin::VirtualModuleMap;
    }
    auto* virtualModules = global->onLoadPlugins.virtualModules;

    virtualModules->set(moduleId, JSC::Strong<JSC::JSObject> { vm, uncheckedDowncast<JSC::JSObject>(functionValue) });

    auto* requireMap = global->requireMap();
    RETURN_IF_EXCEPTION(scope, {});
    requireMap->remove(globalObject, moduleIdValue);
    RETURN_IF_EXCEPTION(scope, {});

    if (moduleIdValue.isString()) {
        auto idIdent = JSC::Identifier::fromString(vm, asString(moduleIdValue)->value(globalObject));
        RETURN_IF_EXCEPTION(scope, {});
        global->moduleLoader()->removeEntry(idIdent); // takes the loader's cellLock itself
    }

    return JSValue::encode(callframe->thisValue());
}

static JSC::EncodedJSValue jsFunctionAppendOnResolvePluginBody(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe, BunPluginTarget target, BunPlugin::Base& plugin)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (callframe->argumentCount() < 2) {
        throwException(globalObject, scope, createError(globalObject, "onResolve() requires at least 2 arguments"_s));
        return {};
    }

    auto* filterObject = callframe->uncheckedArgument(0).toObject(globalObject);
    RETURN_IF_EXCEPTION(scope, {});
    JSC::RegExpObject* filter = nullptr;
    auto filterValue = filterObject->getIfPropertyExists(globalObject, Identifier::fromString(vm, "filter"_s));
    RETURN_IF_EXCEPTION(scope, {});
    if (filterValue) {
        if (filterValue.isCell() && filterValue.asCell()->inherits<JSC::RegExpObject>())
            filter = uncheckedDowncast<JSC::RegExpObject>(filterValue);
    }

    if (!filter) {
        throwException(globalObject, scope, createError(globalObject, "onResolve() expects first argument to be an object with a filter RegExp"_s));
        return {};
    }

    String namespaceString = String();
    auto namespaceValue = filterObject->getIfPropertyExists(globalObject, Identifier::fromString(vm, "namespace"_s));
    RETURN_IF_EXCEPTION(scope, {});
    if (namespaceValue) {
        if (namespaceValue.isString()) {
            namespaceString = namespaceValue.toWTFString(globalObject);
            RETURN_IF_EXCEPTION(scope, {});
            if (!isValidNamespaceString(namespaceString)) {
                throwException(globalObject, scope, createError(globalObject, "namespace can only contain letters, numbers, dashes, or underscores"_s));
                return {};
            }
        }
    }

    auto func = callframe->uncheckedArgument(1);

    if (!func.isCell() || !func.isCallable()) {
        throwException(globalObject, scope, createError(globalObject, "onResolve() expects second argument to be a function"_s));
        return {};
    }

    plugin.append(vm, filter->regExp(), uncheckedDowncast<JSObject>(func), namespaceString);

    return JSValue::encode(callframe->thisValue());
}

static JSC::EncodedJSValue jsFunctionAppendOnResolvePluginGlobal(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe, BunPluginTarget target)
{
    Zig::GlobalObject* global = defaultGlobalObject(globalObject);

    auto& plugins = global->onResolvePlugins;
    return jsFunctionAppendOnResolvePluginBody(globalObject, callframe, target, plugins);
}

static JSC::EncodedJSValue jsFunctionAppendOnLoadPluginGlobal(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe, BunPluginTarget target)
{
    Zig::GlobalObject* global = defaultGlobalObject(globalObject);

    auto& plugins = global->onLoadPlugins;
    return jsFunctionAppendOnLoadPluginBody(globalObject, callframe, target, plugins);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnLoadPluginNode, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnLoadPluginGlobal(globalObject, callframe, BunPluginTargetNode);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnLoadPluginBun, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnLoadPluginGlobal(globalObject, callframe, BunPluginTargetBun);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnLoadPluginBrowser, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnLoadPluginGlobal(globalObject, callframe, BunPluginTargetBrowser);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnResolvePluginNode, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnResolvePluginGlobal(globalObject, callframe, BunPluginTargetNode);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnResolvePluginBun, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnResolvePluginGlobal(globalObject, callframe, BunPluginTargetBun);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendVirtualModule, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendVirtualModulePluginBody(globalObject, callframe);
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionAppendOnResolvePluginBrowser, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return jsFunctionAppendOnResolvePluginGlobal(globalObject, callframe, BunPluginTargetBrowser);
}

/// `Bun.plugin()`
static inline JSC::EncodedJSValue setupBunPlugin(JSC::JSGlobalObject* globalObject, JSC::CallFrame* callframe, BunPluginTarget target)
{
    auto& vm = JSC::getVM(globalObject);
    auto throwScope = DECLARE_THROW_SCOPE(vm);
    if (callframe->argumentCount() < 1) {
        JSC::throwTypeError(globalObject, throwScope, "plugin needs at least one argument (an object)"_s);
        return {};
    }

    JSC::JSObject* obj = callframe->uncheckedArgument(0).getObject();
    if (!obj) {
        JSC::throwTypeError(globalObject, throwScope, "plugin needs an object as first argument"_s);
        return {};
    }

    JSC::JSValue setupFunctionValue = obj->getIfPropertyExists(globalObject, Identifier::fromString(vm, "setup"_s));
    RETURN_IF_EXCEPTION(throwScope, {});
    if (!setupFunctionValue || setupFunctionValue.isUndefinedOrNull() || !setupFunctionValue.isCell() || !setupFunctionValue.isCallable()) {
        JSC::throwTypeError(globalObject, throwScope, "plugin needs a setup() function"_s);
        return {};
    }

    auto targetValue = obj->getIfPropertyExists(globalObject, Identifier::fromString(vm, "target"_s));
    RETURN_IF_EXCEPTION(throwScope, {});
    if (targetValue) {
        auto* targetJSString = targetValue.toStringOrNull(globalObject);
        RETURN_IF_EXCEPTION(throwScope, {});
        String targetString = targetJSString->value(globalObject);
        RETURN_IF_EXCEPTION(throwScope, {});
        if (!(targetString == "node"_s || targetString == "bun"_s || targetString == "browser"_s)) {
            JSC::throwTypeError(globalObject, throwScope, "plugin target must be one of 'node', 'bun' or 'browser'"_s);
            return {};
        }
    }

    JSObject* builderObject = JSC::constructEmptyObject(globalObject, globalObject->objectPrototype(), 4);

    builderObject->putDirect(vm, Identifier::fromString(vm, "target"_s), jsString(vm, String("bun"_s)), 0);
    builderObject->putDirectNativeFunction(
        vm,
        globalObject,
        JSC::Identifier::fromString(vm, "onLoad"_s),
        1,
        jsFunctionAppendOnLoadPluginBun,
        ImplementationVisibility::Public,
        NoIntrinsic,
        JSC::PropertyAttribute::DontDelete | 0);
    builderObject->putDirectNativeFunction(
        vm,
        globalObject,
        JSC::Identifier::fromString(vm, "onResolve"_s),
        1,
        jsFunctionAppendOnResolvePluginBun,
        ImplementationVisibility::Public,
        NoIntrinsic,
        JSC::PropertyAttribute::DontDelete | 0);

    builderObject->putDirectNativeFunction(
        vm,
        globalObject,
        JSC::Identifier::fromString(vm, "module"_s),
        1,
        jsFunctionAppendVirtualModule,
        ImplementationVisibility::Public,
        NoIntrinsic,
        JSC::PropertyAttribute::DontDelete | 0);

    JSC::MarkedArgumentBuffer args;
    args.append(builderObject);

    JSObject* function = uncheckedDowncast<JSObject>(setupFunctionValue);
    JSC::CallData callData = JSC::getCallData(function);
    JSValue result = call(globalObject, function, callData, JSC::jsUndefined(), args);

    RETURN_IF_EXCEPTION(throwScope, {});

    if (auto* promise = dynamicDowncast<JSC::JSPromise>(result)) {
        RELEASE_AND_RETURN(throwScope, JSValue::encode(promise));
    }

    RELEASE_AND_RETURN(throwScope, JSValue::encode(jsUndefined()));
}

void BunPlugin::Group::append(JSC::VM& vm, JSC::RegExp* filter, JSC::JSObject* func)
{
    filters.append(JSC::Strong<JSC::RegExp> { vm, filter });
    callbacks.append(JSC::Strong<JSC::JSObject> { vm, func });
}

void BunPlugin::Base::append(JSC::VM& vm, JSC::RegExp* filter, JSC::JSObject* func, String& namespaceString)
{
    if (namespaceString.isEmpty() || namespaceString == "file"_s) {
        this->fileNamespace.append(vm, filter, func);
    } else if (auto found = this->group(namespaceString)) {
        found->append(vm, filter, func);
    } else {
        Group newGroup;
        newGroup.append(vm, filter, func);
        this->groups.append(WTF::move(newGroup));
        this->namespaces.append(namespaceString);
    }
}

JSC::JSObject* BunPlugin::Group::find(JSC::JSGlobalObject* globalObject, String& path)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    size_t count = filters.size();
    for (size_t i = 0; i < count; i++) {
        auto matchResult = filters[i].get()->match(globalObject, path, 0);
        RETURN_IF_EXCEPTION(scope, nullptr);
        if (matchResult) {
            return callbacks[i].get();
        }
    }

    return nullptr;
}

void BunPlugin::OnLoad::addModuleMock(JSC::VM& vm, const String& path, JSC::JSObject* mockObject)
{
    Zig::GlobalObject* globalObject = defaultGlobalObject(mockObject->globalObject());

    if (globalObject->onLoadPlugins.virtualModules == nullptr) {
        globalObject->onLoadPlugins.virtualModules = new BunPlugin::VirtualModuleMap;
    }
    auto* virtualModules = globalObject->onLoadPlugins.virtualModules;

    virtualModules->set(path, JSC::Strong<JSC::JSObject> { vm, mockObject });
}

class JSModuleMock final : public JSC::JSNonFinalObject {
public:
    using Base = JSC::JSNonFinalObject;

    // Null for `jest.mock(specifier)` without a factory: the module is then `manualMockPath` (a `__mocks__`
    // file) when there is one, else an automock of `actualExports`.
    WriteBarrier<JSObject> factory;
    WriteBarrier<JSObject> cachedResult;
    // The module's own exports, as they were before a mock patched them in place, for `jest.requireActual`.
    WriteBarrier<Unknown> actualExports;
    WriteBarrier<JSString> specifier;
    WriteBarrier<JSString> manualMockPath;
    // The factory's promise is pending and will patch the already-loaded module when it settles.
    bool hasPendingPatch { false };
    bool hasCalledModuleMock = false;
    // The module was loaded when it was mocked and now has the mock's exports: `jest.unmock()` puts `actualExports` back.
    bool patchedLoadedModule { false };

    static JSModuleMock* create(JSC::VM& vm, JSC::Structure* structure, JSC::JSObject* callback, JSC::JSString* specifier);
    static Structure* createStructure(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::JSValue prototype);

    DECLARE_INFO;
    DECLARE_VISIT_CHILDREN;

    JSObject* executeOnce(JSC::JSGlobalObject* lexicalGlobalObject);

    // `jest.resetModules()`: the next import runs the factory again.
    void forgetResult()
    {
        if (hasPendingPatch)
            return;
        hasCalledModuleMock = false;
        cachedResult.clear();
    }

    template<typename, JSC::SubspaceAccess mode> static JSC::GCClient::IsoSubspace* subspaceFor(JSC::VM& vm)
    {
        if constexpr (mode == JSC::SubspaceAccess::Concurrently)
            return nullptr;
        return WebCore::subspaceForImpl<JSModuleMock, WebCore::UseCustomHeapCellType::No>(vm, BUN_SUBSPACE_SLOTS(m_clientSubspaceForJSModuleMock, m_subspaceForJSModuleMock));
    }

    void finishCreation(JSC::VM&);

private:
    JSModuleMock(JSC::VM&, JSC::Structure*, JSC::JSObject* callback, JSC::JSString* specifier);
};

const JSC::ClassInfo JSModuleMock::s_info = { "ModuleMock"_s, &Base::s_info, nullptr, nullptr, CREATE_METHOD_TABLE(JSModuleMock) };

JSModuleMock* JSModuleMock::create(JSC::VM& vm, JSC::Structure* structure, JSC::JSObject* callback, JSC::JSString* specifier)
{
    JSModuleMock* ptr = new (NotNull, JSC::allocateCell<JSModuleMock>(vm)) JSModuleMock(vm, structure, callback, specifier);
    ptr->finishCreation(vm);
    return ptr;
}

void JSModuleMock::finishCreation(JSC::VM& vm)
{
    Base::finishCreation(vm);
}

JSModuleMock::JSModuleMock(JSC::VM& vm, JSC::Structure* structure, JSC::JSObject* callback, JSC::JSString* specifier)
    : Base(vm, structure)
    , factory(callback, JSC::WriteBarrierEarlyInit)
    , specifier(specifier, JSC::WriteBarrierEarlyInit)
{
}

Structure* JSModuleMock::createStructure(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::JSValue prototype)
{
    return Bun::createClassStructure(vm, globalObject, prototype, JSC::TypeInfo(JSC::ObjectType, StructureFlags), info());
}

static void throwFactoryMustReturnObject(JSC::JSGlobalObject* globalObject, JSC::ThrowScope& scope)
{
    JSC::throwTypeError(globalObject, scope, "mock(module, fn) requires a function that returns an object"_s);
}

// `require(specifier)` as the module at `fromPath` would call it.
static JSC::JSValue requireFrom(Zig::GlobalObject* globalObject, const String& fromPath, JSC::JSValue specifier)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSC::JSObject* require = Bun::JSCommonJSModule::createBoundRequireFunction(vm, globalObject, fromPath);
    RETURN_IF_EXCEPTION(scope, {});
    JSC::MarkedArgumentBuffer arguments;
    arguments.append(specifier);
    RELEASE_AND_RETURN(scope, JSC::call(globalObject, require, JSC::getCallData(require), JSC::jsUndefined(), arguments));
}

static JSC::JSValue createAutomock(Zig::GlobalObject* globalObject, JSC::JSValue actual)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    if (!actual || !actual.isObject())
        return JSC::constructEmptyObject(globalObject);

    JSC::JSFunction* create = JSC::JSFunction::create(vm, globalObject, jestModuleMockCreateAutomockCodeGenerator(vm), globalObject);
    JSC::JSFunction* mockFn = JSC::JSFunction::create(vm, globalObject, 1, "fn"_s, JSMock__jsMockFn, ImplementationVisibility::Public);
    JSC::MarkedArgumentBuffer arguments;
    arguments.append(actual);
    arguments.append(mockFn);
    RELEASE_AND_RETURN(scope, JSC::call(globalObject, create, JSC::getCallData(create), JSC::jsUndefined(), arguments));
}

JSObject* JSModuleMock::executeOnce(JSC::JSGlobalObject* lexicalGlobalObject)
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (hasCalledModuleMock) {
        if (cachedResult)
            return cachedResult.get();
        // The factory threw, or is still running and loads the module it mocks.
        if (factory)
            return factory.get();
        JSC::throwTypeError(lexicalGlobalObject, scope, "jest.mock(): the module was loaded while its automatic mock was being created"_s);
        return nullptr;
    }

    hasCalledModuleMock = true;

    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    JSC::JSValue result;
    if (factory) {
        JSC::JSValue callbackValue = factory.get();
        if (!callbackValue.isCallable()) {
            scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "mock(module, fn) requires a function"_s));
            return nullptr;
        }
        JSObject* callback = factory.get();
        result = JSC::profiledCall(lexicalGlobalObject, ProfilingReason::API, callback, JSC::getCallData(callback), JSC::jsUndefined(), ArgList());
    } else if (manualMockPath) {
        String path = manualMockPath->value(globalObject);
        RETURN_IF_EXCEPTION(scope, nullptr);
        result = requireFrom(globalObject, path, manualMockPath.get());
    } else {
        result = createAutomock(globalObject, actualExports.get());
    }
    RETURN_IF_EXCEPTION(scope, nullptr);

    if (!result.isObject()) {
        throwFactoryMustReturnObject(lexicalGlobalObject, scope);
        return nullptr;
    }

    auto* object = result.getObject();
    this->cachedResult.set(vm, this, object);

    return object;
}

struct LoadedModule {
    JSC::JSModuleNamespaceObject* esmNamespace { nullptr };
    Bun::JSCommonJSModule* commonJSModule { nullptr };
    // In the registry / require.cache with nothing to patch: removed so the next import loads the mock.
    bool staleESMEntry { false };
    bool staleCommonJSEntry { false };
};

static void findLoadedESModule(Zig::GlobalObject* globalObject, JSC::JSString* specifierString, LoadedModule& loaded)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    loaded.esmNamespace = nullptr;
    loaded.staleESMEntry = false;

    auto specifierIdent = JSC::Identifier::fromString(vm, specifierString->value(globalObject));
    RETURN_IF_EXCEPTION(scope, );
    auto* entry = globalObject->moduleLoader()->registryEntry(specifierIdent);
    if (!entry)
        return;

    loaded.staleESMEntry = true;
    if (auto* mod = entry->record()) {
        // getModuleNamespace asserts the record has progressed past linking.
        // A previous import that failed during link (e.g. unresolved binding)
        // leaves the record at New/Unlinked; in that case there is no
        // namespace to patch — drop the stale entry so the mock takes over
        // on the next import.
        bool linked = true;
        if (auto* cyclic = dynamicDowncast<JSC::CyclicModuleRecord>(mod))
            linked = cyclic->status() >= JSC::CyclicModuleRecord::Status::Linked;
        if (linked) {
            loaded.esmNamespace = mod->getModuleNamespace(globalObject);
            RETURN_IF_EXCEPTION(scope, );
            if (loaded.esmNamespace)
                loaded.staleESMEntry = false;
        }
    }
}

static void findLoadedCommonJSModule(Zig::GlobalObject* globalObject, JSC::JSString* specifierString, LoadedModule& loaded)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    loaded.commonJSModule = nullptr;
    loaded.staleCommonJSEntry = false;

    JSValue entryValue = globalObject->requireMap()->get(globalObject, specifierString);
    RETURN_IF_EXCEPTION(scope, );
    if (entryValue) {
        loaded.commonJSModule = dynamicDowncast<Bun::JSCommonJSModule>(entryValue);
        loaded.staleCommonJSEntry = !loaded.commonJSModule;
    }
}

static LoadedModule findLoadedModule(Zig::GlobalObject* globalObject, JSC::JSString* specifierString)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    LoadedModule loaded;
    findLoadedESModule(globalObject, specifierString, loaded);
    RETURN_IF_EXCEPTION(scope, {});
    findLoadedCommonJSModule(globalObject, specifierString, loaded);
    RETURN_IF_EXCEPTION(scope, {});
    return loaded;
}

static void overrideLoadedModuleExports(Zig::GlobalObject* globalObject, const LoadedModule& loaded, JSC::JSObject* exports)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (auto* moduleNamespaceObject = loaded.esmNamespace) {
        JSC::PropertyNameArrayBuilder names(vm, PropertyNameMode::Strings, PrivateSymbolMode::Exclude);
        // Via the method table so a module namespace object (`() => import("./mocked")`) lists its exports.
        exports->methodTable()->getOwnPropertyNames(exports, globalObject, names, DontEnumPropertiesMode::Exclude);
        RETURN_IF_EXCEPTION(scope, );

        // Read every export before overriding any, so a throwing getter leaves the
        // namespace untouched.
        MarkedArgumentBuffer values;
        values.ensureCapacity(names.size());
        for (auto& name : names) {
            JSValue value = exports->get(globalObject, name);
            RETURN_IF_EXCEPTION(scope, );
            values.append(value);
        }
        if (values.hasOverflowed()) [[unlikely]] {
            throwOutOfMemoryError(globalObject, scope);
            return;
        }
        bool hasDefault = false;
        for (size_t i = 0; i < names.size(); ++i) {
            hasDefault |= names[i] == vm.propertyNames->defaultKeyword;
            moduleNamespaceObject->overrideExportValue(globalObject, names[i], values.at(i));
            RETURN_IF_EXCEPTION(scope, );
        }
        // Without a `default` of its own, the mock is the default export, as Jest and Babel's interop make it.
        if (!hasDefault) {
            moduleNamespaceObject->overrideExportValue(globalObject, vm.propertyNames->defaultKeyword, exports);
            RETURN_IF_EXCEPTION(scope, );
        }
    }

    if (auto* moduleObject = loaded.commonJSModule) {
        moduleObject->putDirect(vm, Bun::builtinNames(vm).exportsPublicName(), exports, 0);
        moduleObject->hasEvaluated = true;
    }
}

static String callerFilePath(JSC::VM& vm, JSC::CallFrame* callframe)
{
    JSC::SourceOrigin sourceOrigin = callframe->callerSourceOrigin(vm);
    if (sourceOrigin.isNull())
        return String();
    const URL& url = sourceOrigin.url();
    if (!url.isValid() || !url.protocolIsFile())
        return String();
    return url.fileSystemPath();
}

// The key a module mock is registered under: the specifier resolved from the caller, or the specifier itself
// when it does not resolve.
static void resolveMockSpecifier(Zig::GlobalObject* globalObject, JSC::CallFrame* callframe, JSC::JSString*& specifierString, String& specifier)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSC::SourceOrigin sourceOrigin = callframe->callerSourceOrigin(vm);
    if (sourceOrigin.isNull())
        return;
    const URL& url = sourceOrigin.url();

    if (specifier.startsWith("file:"_s)) {
        URL fileURL = URL(url, specifier);
        if (fileURL.isValid()) {
            specifier = fileURL.fileSystemPath();
            specifierString = jsString(vm, specifier);
            globalObject->onLoadPlugins.mustDoExpensiveRelativeLookup = true;
            return;
        } else {
            scope.throwException(globalObject, JSC::createTypeError(globalObject, "Invalid \"file:\" URL"_s));
            return;
        }
    }

    if (url.isValid() && url.protocolIsFile()) {
        auto fromString = url.fileSystemPath();
        BunString from = Bun::toString(fromString);
        // Not resolving is fine (mocking a module that does not exist yet); anything else thrown
        // while resolving (e.g. by an onResolve plugin) propagates.
        auto result = JSValue::decode(Bun__resolveSyncWithSourceIfExists(globalObject, JSValue::encode(specifierString), &from, true));
        RETURN_IF_EXCEPTION(scope, );

        if (result.isString()) {
            auto* specifierStr = asString(result);
            if (specifierStr->length() > 0) {
                specifierString = specifierStr;
                specifier = specifierString->value(globalObject);
            }
        } else if (specifier.startsWith("./"_s) || specifier.startsWith(".."_s)) {
            // If module resolution fails, we try to resolve it relative to the current file
            auto relativeURL = URL(url, specifier);

            if (relativeURL.isValid()) {
                globalObject->onLoadPlugins.mustDoExpensiveRelativeLookup = true;

                if (relativeURL.protocolIsFile())
                    specifier = relativeURL.fileSystemPath();
                else
                    specifier = relativeURL.string();

                specifierString = jsString(vm, specifier);
            }
        }
    }
}

// The string argument `jest.requireActual(specifier)` and friends take, resolved like `mock.module()` resolves it.
static bool moduleSpecifierArgument(Zig::GlobalObject* globalObject, JSC::CallFrame* callframe, ASCIILiteral functionName, JSC::JSString*& specifierString, String& specifier)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSC::JSValue value = callframe->argument(0);
    if (!value.isString()) {
        JSC::throwTypeError(globalObject, scope, makeString(functionName, "() requires a module name string"_s));
        return false;
    }
    specifierString = asString(value);
    specifier = specifierString->value(globalObject);
    RETURN_IF_EXCEPTION(scope, false);
    if (specifier.isEmpty()) {
        JSC::throwTypeError(globalObject, scope, makeString(functionName, "() requires a module name string"_s));
        return false;
    }
    resolveMockSpecifier(globalObject, callframe, specifierString, specifier);
    RETURN_IF_EXCEPTION(scope, false);
    return true;
}

static JSModuleMock* registeredModuleMock(Zig::GlobalObject* globalObject, const String& key)
{
    auto* virtualModules = globalObject->onLoadPlugins.virtualModules;
    if (!virtualModules)
        return nullptr;
    auto entry = virtualModules->find(key);
    if (entry == virtualModules->end())
        return nullptr;
    return dynamicDowncast<JSModuleMock>(entry->value.get());
}

// The module itself, loaded past its mock and left out of both module caches, so the next import still
// gets the mock.
static JSC::JSValue loadActualModule(Zig::GlobalObject* globalObject, const String& key, JSC::JSString* keyString, const String& fromPath)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto& plugins = globalObject->onLoadPlugins;
    auto* requireMap = globalObject->requireMap();
    auto keyIdentifier = JSC::Identifier::fromString(vm, key);

    JSC::JSValue cachedCommonJSModule = requireMap->get(globalObject, keyString);
    RETURN_IF_EXCEPTION(scope, {});
    if (cachedCommonJSModule) {
        requireMap->remove(globalObject, keyString);
        RETURN_IF_EXCEPTION(scope, {});
    }
    globalObject->moduleLoader()->removeEntry(keyIdentifier);

    plugins.actualModuleRequests.append(key);
    JSC::JSValue actual = requireFrom(globalObject, fromPath, keyString);
    plugins.actualModuleRequests.removeLast();

    JSC::Exception* exception = scope.exception();
    if (exception && !scope.tryClearException())
        return {};

    requireMap->remove(globalObject, keyString);
    RETURN_IF_EXCEPTION(scope, {});
    if (cachedCommonJSModule) {
        requireMap->set(globalObject, keyString, cachedCommonJSModule);
        RETURN_IF_EXCEPTION(scope, {});
    }
    globalObject->moduleLoader()->removeEntry(keyIdentifier);

    if (exception) {
        scope.throwException(globalObject, exception);
        return {};
    }
    return actual;
}

static JSC::JSValue requireActualModule(Zig::GlobalObject* globalObject, const String& key, JSC::JSString* keyString, const String& fromPath)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSModuleMock* mock = registeredModuleMock(globalObject, key);
    if (!mock)
        RELEASE_AND_RETURN(scope, requireFrom(globalObject, fromPath, keyString));
    if (mock->actualExports)
        return mock->actualExports.get();

    JSC::JSValue actual = loadActualModule(globalObject, key, keyString, fromPath);
    RETURN_IF_EXCEPTION(scope, {});
    mock->actualExports.set(vm, mock, actual);
    return actual;
}

// What `jest.requireActual()` returns once a mock has patched the module in place.
static JSC::JSValue snapshotLoadedModuleExports(Zig::GlobalObject* globalObject, const LoadedModule& loaded)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (auto* moduleObject = loaded.commonJSModule) {
        if (moduleObject->hasEvaluated)
            RELEASE_AND_RETURN(scope, moduleObject->exportsObject());
    }

    auto* moduleNamespaceObject = loaded.esmNamespace;
    if (!moduleNamespaceObject)
        return {};

    JSC::PropertyNameArrayBuilder names(vm, PropertyNameMode::Strings, PrivateSymbolMode::Exclude);
    moduleNamespaceObject->methodTable()->getOwnPropertyNames(moduleNamespaceObject, globalObject, names, DontEnumPropertiesMode::Exclude);
    RETURN_IF_EXCEPTION(scope, {});

    JSC::JSObject* copy = JSC::constructEmptyObject(globalObject);
    for (auto& name : names) {
        JSC::JSValue value = moduleNamespaceObject->get(globalObject, name);
        RETURN_IF_EXCEPTION(scope, {});
        copy->putDirectMayBeIndex(globalObject, name, value);
        RETURN_IF_EXCEPTION(scope, {});
    }
    return copy;
}

static bool isNodeModulesPath(const String& path)
{
    return path.contains("/node_modules/"_s) || path.contains("\\node_modules\\"_s);
}

static bool isRelativeOrAbsoluteSpecifier(const String& specifier)
{
    if (specifier.startsWith("./"_s) || specifier.startsWith("../"_s) || specifier.startsWith("/"_s) || specifier.startsWith("file:"_s))
        return true;
#if OS(WINDOWS)
    if (specifier.startsWith(".\\"_s) || specifier.startsWith("..\\"_s))
        return true;
    if (specifier.length() > 2 && isASCIIAlpha(specifier[0]) && specifier[1] == ':' && (specifier[2] == '\\' || specifier[2] == '/'))
        return true;
#endif
    return false;
}

static String resolveIfExists(Zig::GlobalObject* globalObject, const String& specifier, const String& fromPath)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    BunString from = Bun::toString(fromPath);
    auto result = JSValue::decode(Bun__resolveSyncWithSourceIfExists(globalObject, JSValue::encode(jsString(vm, specifier)), &from, true));
    RETURN_IF_EXCEPTION(scope, String());
    if (!result.isString())
        return String();
    RELEASE_AND_RETURN(scope, result.toWTFString(globalObject));
}

static size_t lastPathSeparator(const String& path)
{
    size_t slash = path.reverseFind('/');
#if OS(WINDOWS)
    size_t backslash = path.reverseFind('\\');
    if (slash == WTF::notFound || (backslash != WTF::notFound && backslash > slash))
        return backslash;
#endif
    return slash;
}

// Jest's manual mocks: `__mocks__/<name>` next to a user module, or for a package or a builtin module,
// `__mocks__/<specifier>` in the caller's directory or the closest of its parents that has one.
static String findManualMock(Zig::GlobalObject* globalObject, const String& originalSpecifier, const String& key, const String& callerPath)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (isRelativeOrAbsoluteSpecifier(originalSpecifier) && !isNodeModulesPath(key)) {
        size_t separator = lastPathSeparator(key);
        if (separator == WTF::notFound)
            return String();
        String basename = key.substring(separator + 1);
        size_t dot = basename.reverseFind('.');
        if (dot != WTF::notFound && dot > 0)
            basename = basename.left(dot);
        RELEASE_AND_RETURN(scope, resolveIfExists(globalObject, makeString("./__mocks__/"_s, basename), key));
    }

    if (callerPath.isEmpty())
        return String();
    String name = originalSpecifier.startsWith("node:"_s) ? originalSpecifier.substring(5) : originalSpecifier;
    String request = makeString("./__mocks__/"_s, name);
    String directory = callerPath;
    for (size_t separator = lastPathSeparator(directory); separator != WTF::notFound && separator > 0; separator = lastPathSeparator(directory)) {
        directory = directory.left(separator);
        String found = resolveIfExists(globalObject, request, makeString(directory, "/__mocks_lookup__"_s));
        RETURN_IF_EXCEPTION(scope, String());
        if (!found.isEmpty())
            return found;
    }
    return String();
}

static JSC::EncodedJSValue mockModule(JSC::JSGlobalObject* lexicalGlobalObject, JSC::CallFrame* callframe, bool factoryIsOptional)
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    Zig::GlobalObject* globalObject = defaultGlobalObject(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    if (!globalObject) [[unlikely]] {
        scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "Cannot run mock from a different global context"_s));
        return {};
    }

    if (callframe->argumentCount() < 1) {
        scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "mock(module, fn) requires a module and function"_s));
        return {};
    }

    if (!callframe->argument(0).isString()) {
        scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "mock(module, fn) requires a module name string"_s));
        return {};
    }

    JSC::JSString* specifierString = callframe->argument(0).toString(globalObject);
    RETURN_IF_EXCEPTION(scope, {});
    WTF::String specifier = specifierString->value(globalObject);
    RETURN_IF_EXCEPTION(scope, {});

    if (specifier.isEmpty()) {
        scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "mock(module, fn) requires a module and function"_s));
        return {};
    }

    JSC::JSValue callbackValue = callframe->argument(1);
    bool hasFactory = callbackValue.isCell() && callbackValue.isCallable();
    if (!hasFactory && !(factoryIsOptional && callbackValue.isUndefined())) {
        scope.throwException(lexicalGlobalObject, JSC::createTypeError(lexicalGlobalObject, "mock(module, fn) requires a function"_s));
        return {};
    }

    String originalSpecifier = specifier;
    resolveMockSpecifier(globalObject, callframe, specifierString, specifier);
    RETURN_IF_EXCEPTION(scope, {});

    JSC::JSObject* callback = hasFactory ? callbackValue.getObject() : nullptr;

    JSModuleMock* mock = JSModuleMock::create(vm, globalObject->mockModule.mockModuleStructure.getInitializedOnMainThread(globalObject), callback, specifierString);

    // A module that is already loaded while an earlier mock of it is registered is that mock.
    JSModuleMock* previous = registeredModuleMock(globalObject, specifier);
    if (previous) {
        if (previous->actualExports)
            mock->actualExports.set(vm, mock, previous->actualExports.get());
        mock->patchedLoadedModule = previous->patchedLoadedModule;
    }

    LoadedModule loaded = findLoadedModule(globalObject, specifierString);
    RETURN_IF_EXCEPTION(scope, {});
    bool isLoaded = loaded.esmNamespace || loaded.commonJSModule;

    if (isLoaded && !previous) {
        JSC::JSValue actual = snapshotLoadedModuleExports(globalObject, loaded);
        RETURN_IF_EXCEPTION(scope, {});
        if (actual)
            mock->actualExports.set(vm, mock, actual);
    }

    if (!hasFactory) {
        String callerPath = callerFilePath(vm, callframe);
        String manualMock = findManualMock(globalObject, originalSpecifier, specifier, callerPath);
        RETURN_IF_EXCEPTION(scope, {});
        if (!manualMock.isEmpty()) {
            mock->manualMockPath.set(vm, mock, jsString(vm, manualMock));
        } else if (!mock->actualExports) {
            JSC::JSValue actual = loadActualModule(globalObject, specifier, specifierString, callerPath);
            RETURN_IF_EXCEPTION(scope, {});
            mock->actualExports.set(vm, mock, actual);
        }
    }

    JSC::JSPromise* pendingFactory = nullptr;
    if (isLoaded) {
        JSValue exportsValue = mock->executeOnce(globalObject);
        RETURN_IF_EXCEPTION(scope, {});

        if (auto* promise = dynamicDowncast<JSC::JSPromise>(exportsValue)) {
            switch (promise->status()) {
            case JSC::JSPromise::Status::Rejected: {
                promise->markAsHandled();
                scope.throwException(globalObject, promise->result());
                return {};
            }
            case JSC::JSPromise::Status::Fulfilled: {
                exportsValue = promise->result();
                break;
            }
            case JSC::JSPromise::Status::Pending: {
                pendingFactory = promise;
                break;
            }
            }
        }

        // The factory may have require()d the module itself: `() => ({ ...require("./m"), extra })`.
        findLoadedCommonJSModule(globalObject, specifierString, loaded);
        RETURN_IF_EXCEPTION(scope, {});

        if (!pendingFactory) {
            if (!exportsValue.isObject()) {
                throwFactoryMustReturnObject(globalObject, scope);
                return {};
            }
            overrideLoadedModuleExports(globalObject, loaded, exportsValue.getObject());
            RETURN_IF_EXCEPTION(scope, {});
        }
        mock->patchedLoadedModule = true;
    }

    if (loaded.staleESMEntry) {
        auto specifierIdent = JSC::Identifier::fromString(vm, specifier);
        globalObject->moduleLoader()->removeEntry(specifierIdent); // takes the loader's cellLock itself
    }

    if (loaded.staleCommonJSEntry) {
        globalObject->requireMap()->remove(globalObject, specifierString);
        RETURN_IF_EXCEPTION(scope, {});
    }

    globalObject->onLoadPlugins.addModuleMock(vm, specifier, mock);

    if (!pendingFactory)
        return JSValue::encode(factoryIsOptional ? callframe->thisValue() : jsUndefined());

    JSC::JSPromise* patched = JSC::JSPromise::create(vm, globalObject->promiseStructure());
    pendingFactory->performPromiseThenWithContext(vm, globalObject, globalObject->thenable(jsFunctionMockModuleFactoryResolve), globalObject->thenable(jsFunctionMockModuleFactoryReject), patched, mock);
    mock->hasPendingPatch = true;

    return JSValue::encode(patched);
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsModuleMock);
extern "C" JSC_DEFINE_HOST_FUNCTION_WITH_ATTRIBUTES(JSMock__jsModuleMock, __attribute__((minsize)), (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    return mockModule(lexicalGlobalObject, callframe, false);
}

// `jest.mock(specifier, factory?)`: without a factory, the module's `__mocks__` file or its automock.
BUN_DECLARE_HOST_FUNCTION(JSMock__jsJestMock);
extern "C" JSC_DEFINE_HOST_FUNCTION_WITH_ATTRIBUTES(JSMock__jsJestMock, __attribute__((minsize)), (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    return mockModule(lexicalGlobalObject, callframe, true);
}

static bool isRegisteredModuleMock(Zig::GlobalObject* globalObject, JSModuleMock* mock, const String& specifier)
{
    auto* virtualModules = globalObject->onLoadPlugins.virtualModules;
    if (!virtualModules)
        return false;
    auto entry = virtualModules->find(specifier);
    return entry != virtualModules->end() && entry->value.get() == mock;
}

// False once a later mock.module() or Bun.plugin.clearAll() replaced `mock` while its factory was pending.
static bool didSettlePendingModulePatch(Zig::GlobalObject* globalObject, JSModuleMock* mock, String& specifier)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    mock->hasPendingPatch = false;

    specifier = mock->specifier->value(globalObject);
    RETURN_IF_EXCEPTION(scope, false);
    return isRegisteredModuleMock(globalObject, mock, specifier);
}

static void unregisterModuleMock(Zig::GlobalObject* globalObject, JSModuleMock* mock, const String& specifier)
{
    if (isRegisteredModuleMock(globalObject, mock, specifier))
        globalObject->onLoadPlugins.virtualModules->remove(specifier);
}

// Mocks replaced or cleared while their factory was pending are no longer in the map.
template<typename Functor>
static void forEachPendingModulePatch(Zig::GlobalObject* globalObject, const Functor& functor)
{
    auto* virtualModules = globalObject->onLoadPlugins.virtualModules;
    if (!virtualModules)
        return;
    for (auto& value : virtualModules->values()) {
        auto* mock = dynamicDowncast<JSModuleMock>(value.get());
        if (mock && mock->hasPendingPatch)
            functor(mock);
    }
}

extern "C" [[ZIG_EXPORT(nothrow)]] bool JSMock__hasPendingModulePatches(Zig::GlobalObject* globalObject)
{
    bool hasPending = false;
    forEachPendingModulePatch(globalObject, [&](JSModuleMock*) { hasPending = true; });
    return hasPending;
}

extern "C" [[ZIG_EXPORT(nothrow)]] void JSMock__forgetPendingModulePatches(Zig::GlobalObject* globalObject)
{
    forEachPendingModulePatch(globalObject, [](JSModuleMock* mock) { mock->hasPendingPatch = false; });
}

// Installs the window of a test file's `@jest-environment` docblock on the global object; returns the function
// that removes it, or undefined for the node environment.
extern "C" [[ZIG_EXPORT(zero_is_throw)]] JSC::EncodedJSValue Bun__installTestEnvironment(Zig::GlobalObject* globalObject, const BunString* name, const BunString* testPath)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSC::JSObject* require = Bun::JSCommonJSModule::createBoundRequireFunction(vm, globalObject, testPath->toWTFString());
    RETURN_IF_EXCEPTION(scope, {});
    JSC::JSFunction* install = JSC::JSFunction::create(vm, globalObject, testEnvironmentInstallTestEnvironmentCodeGenerator(vm), globalObject);
    JSC::MarkedArgumentBuffer arguments;
    arguments.append(JSC::jsString(vm, name->toWTFString()));
    arguments.append(require);
    RELEASE_AND_RETURN(scope, JSC::JSValue::encode(JSC::call(globalObject, install, JSC::getCallData(install), JSC::jsUndefined(), arguments)));
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsRequireActual);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsRequireActual, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    JSC::JSString* specifierString = nullptr;
    String specifier;
    bool ok = moduleSpecifierArgument(globalObject, callframe, "requireActual"_s, specifierString, specifier);
    RETURN_IF_EXCEPTION(scope, {});
    if (!ok)
        return {};
    RELEASE_AND_RETURN(scope, JSValue::encode(requireActualModule(globalObject, specifier, specifierString, callerFilePath(vm, callframe))));
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsRequireMock);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsRequireMock, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    JSC::JSString* specifierString = nullptr;
    String specifier;
    bool ok = moduleSpecifierArgument(globalObject, callframe, "requireMock"_s, specifierString, specifier);
    RETURN_IF_EXCEPTION(scope, {});
    if (!ok)
        return {};

    if (JSModuleMock* mock = registeredModuleMock(globalObject, specifier)) {
        JSC::JSValue result = mock->executeOnce(globalObject);
        RETURN_IF_EXCEPTION(scope, {});
        if (auto* promise = dynamicDowncast<JSC::JSPromise>(result)) {
            if (promise->status() == JSC::JSPromise::Status::Fulfilled)
                result = promise->result();
        }
        return JSValue::encode(result);
    }

    String callerPath = callerFilePath(vm, callframe);
    String manualMock = findManualMock(globalObject, asString(callframe->argument(0))->value(globalObject), specifier, callerPath);
    RETURN_IF_EXCEPTION(scope, {});
    if (!manualMock.isEmpty())
        RELEASE_AND_RETURN(scope, JSValue::encode(requireFrom(globalObject, manualMock, jsString(vm, manualMock))));

    JSC::JSValue actual = requireActualModule(globalObject, specifier, specifierString, callerPath);
    RETURN_IF_EXCEPTION(scope, {});
    RELEASE_AND_RETURN(scope, JSValue::encode(createAutomock(globalObject, actual)));
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsUnmock);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsUnmock, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    JSC::JSString* specifierString = nullptr;
    String specifier;
    bool ok = moduleSpecifierArgument(globalObject, callframe, "unmock"_s, specifierString, specifier);
    RETURN_IF_EXCEPTION(scope, {});
    if (!ok)
        return {};

    JSModuleMock* mock = registeredModuleMock(globalObject, specifier);
    if (!mock)
        return JSValue::encode(callframe->thisValue());

    LoadedModule loaded = findLoadedModule(globalObject, specifierString);
    RETURN_IF_EXCEPTION(scope, {});
    JSC::JSValue actual = mock->actualExports.get();
    if (mock->patchedLoadedModule && actual && actual.isObject()) {
        // The module was loaded before it was mocked: give its importers their exports back.
        overrideLoadedModuleExports(globalObject, loaded, actual.getObject());
        RETURN_IF_EXCEPTION(scope, {});
    } else {
        // Whatever is cached under the specifier is the mock: drop it so the next import loads the module.
        if (loaded.esmNamespace || loaded.staleESMEntry)
            globalObject->moduleLoader()->removeEntry(JSC::Identifier::fromString(vm, specifier));
        if (loaded.commonJSModule || loaded.staleCommonJSEntry) {
            globalObject->requireMap()->remove(globalObject, specifierString);
            RETURN_IF_EXCEPTION(scope, {});
        }
    }

    unregisterModuleMock(globalObject, mock, specifier);
    return JSValue::encode(callframe->thisValue());
}

// Modules `jest.resetModules()` and `jest.isolateModules()` forget: files, not builtins or virtual modules.
static bool isResettableModuleKey(const String& key)
{
    if (key.startsWith('/'))
        return true;
#if OS(WINDOWS)
    if (key.startsWith("\\\\"_s))
        return true;
    if (key.length() > 2 && isASCIIAlpha(key[0]) && key[1] == ':' && (key[2] == '\\' || key[2] == '/'))
        return true;
#endif
    return false;
}

static bool hasFinishedEvaluating(JSC::AbstractModuleRecord* record)
{
    if (auto* cyclic = dynamicDowncast<JSC::CyclicModuleRecord>(record))
        return cyclic->status() == JSC::CyclicModuleRecord::Status::Evaluated;
    return true;
}

// Removes the files of both module caches but `keep` (the calling test file). With `saved`, the ES modules
// that finished evaluating are appended to it as (key, record) pairs, for restoreModuleRegistry().
static void forgetLoadedModules(Zig::GlobalObject* globalObject, const String& keep, JSC::JSArray* saved, bool onlyEvaluated)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* loader = globalObject->moduleLoader();

    Vector<JSC::Identifier> esmKeys;
    JSC::MarkedArgumentBuffer records;
    Bun::forEachModuleRegistrySpecifier(loader, [&](UniquedStringImpl* specifier, JSC::ModuleRegistryEntry* entry) {
        String key { specifier };
        if (!isResettableModuleKey(key) || key == keep)
            return;
        auto* record = entry->record();
        if (onlyEvaluated && (!record || !hasFinishedEvaluating(record)))
            return;
        esmKeys.append(JSC::Identifier::fromUid(vm, specifier));
        records.append(record && entry->moduleType() == JSC::ScriptFetchParameters::Type::JavaScript && hasFinishedEvaluating(record) ? JSC::JSValue(record) : JSC::jsUndefined());
    });
    if (records.hasOverflowed()) [[unlikely]] {
        throwOutOfMemoryError(globalObject, scope);
        return;
    }

    for (size_t i = 0; i < esmKeys.size(); ++i) {
        if (saved && !records.at(i).isUndefined()) {
            saved->push(globalObject, jsString(vm, esmKeys[i].string()));
            RETURN_IF_EXCEPTION(scope, );
            saved->push(globalObject, records.at(i));
            RETURN_IF_EXCEPTION(scope, );
        }
        loader->removeEntry(esmKeys[i]);
    }

    auto* requireMap = globalObject->requireMap();
    JSC::MarkedArgumentBuffer commonJSKeys;
    auto* iterator = JSC::JSMapIterator::create(vm, globalObject->mapIteratorStructure(), requireMap, JSC::IterationKind::Keys);
    RETURN_IF_EXCEPTION(scope, );
    JSC::JSValue keyValue;
    while (iterator->next(globalObject, keyValue)) {
        RETURN_IF_EXCEPTION(scope, );
        if (!keyValue.isString())
            continue;
        String key = asString(keyValue)->value(globalObject);
        RETURN_IF_EXCEPTION(scope, );
        if (isResettableModuleKey(key) && key != keep)
            commonJSKeys.append(keyValue);
    }
    RETURN_IF_EXCEPTION(scope, );
    if (commonJSKeys.hasOverflowed()) [[unlikely]] {
        throwOutOfMemoryError(globalObject, scope);
        return;
    }
    for (size_t i = 0; i < commonJSKeys.size(); ++i) {
        requireMap->remove(globalObject, commonJSKeys.at(i));
        RETURN_IF_EXCEPTION(scope, );
    }
}

template<typename Functor>
static void forEachModuleMock(Zig::GlobalObject* globalObject, const Functor& functor)
{
    auto* virtualModules = globalObject->onLoadPlugins.virtualModules;
    if (!virtualModules)
        return;
    for (auto& value : virtualModules->values()) {
        if (auto* mock = dynamicDowncast<JSModuleMock>(value.get()))
            functor(mock);
    }
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsResetModules);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsResetModules, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    forgetLoadedModules(globalObject, callerFilePath(vm, callframe), nullptr, false);
    RETURN_IF_EXCEPTION(scope, {});
    forEachModuleMock(globalObject, [](JSModuleMock* mock) { mock->forgetResult(); });
    return JSValue::encode(callframe->thisValue());
}

// The state `jest.isolateModules()` puts back: [keep, requireMap copy, mock states, ...(key, record) pairs].
// A mock state is a [mock, hasCalledModuleMock, cachedResult] triple, flattened.
static constexpr unsigned isolatedKeepIndex = 0;
static constexpr unsigned isolatedRequireMapIndex = 1;
static constexpr unsigned isolatedMocksIndex = 2;
static constexpr unsigned isolatedFirstModuleIndex = 3;

static JSC::JSArray* isolateModuleRegistry(Zig::GlobalObject* globalObject, const String& keep)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    JSC::JSArray* saved = JSC::constructEmptyArray(globalObject, nullptr);
    RETURN_IF_EXCEPTION(scope, nullptr);
    saved->push(globalObject, jsString(vm, keep));
    RETURN_IF_EXCEPTION(scope, nullptr);
    JSC::JSMap* requireMapCopy = globalObject->requireMap()->clone(globalObject, vm, globalObject->mapStructure());
    RETURN_IF_EXCEPTION(scope, nullptr);
    saved->push(globalObject, requireMapCopy);
    RETURN_IF_EXCEPTION(scope, nullptr);

    JSC::JSArray* mocks = JSC::constructEmptyArray(globalObject, nullptr);
    RETURN_IF_EXCEPTION(scope, nullptr);
    saved->push(globalObject, mocks);
    RETURN_IF_EXCEPTION(scope, nullptr);
    Vector<JSModuleMock*> mockList;
    forEachModuleMock(globalObject, [&](JSModuleMock* mock) { mockList.append(mock); });
    for (auto* mock : mockList) {
        mocks->push(globalObject, mock);
        RETURN_IF_EXCEPTION(scope, nullptr);
        mocks->push(globalObject, JSC::jsBoolean(mock->hasCalledModuleMock));
        RETURN_IF_EXCEPTION(scope, nullptr);
        mocks->push(globalObject, mock->cachedResult ? JSC::JSValue(mock->cachedResult.get()) : JSC::jsUndefined());
        RETURN_IF_EXCEPTION(scope, nullptr);
        mock->forgetResult();
    }

    forgetLoadedModules(globalObject, keep, saved, true);
    RETURN_IF_EXCEPTION(scope, nullptr);
    globalObject->onLoadPlugins.isIsolatingModules = true;
    return saved;
}

static void restoreModuleRegistry(Zig::GlobalObject* globalObject, JSC::JSArray* saved)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    globalObject->onLoadPlugins.isIsolatingModules = false;

    JSC::JSValue keepValue = saved->getIndex(globalObject, isolatedKeepIndex);
    RETURN_IF_EXCEPTION(scope, );
    String keep = keepValue.toWTFString(globalObject);
    RETURN_IF_EXCEPTION(scope, );

    forgetLoadedModules(globalObject, keep, nullptr, false);
    RETURN_IF_EXCEPTION(scope, );

    auto* loader = globalObject->moduleLoader();
    unsigned length = saved->length();
    for (unsigned i = isolatedFirstModuleIndex; i + 1 < length; i += 2) {
        JSC::JSValue keyValue = saved->getIndex(globalObject, i);
        RETURN_IF_EXCEPTION(scope, );
        JSC::JSValue recordValue = saved->getIndex(globalObject, i + 1);
        RETURN_IF_EXCEPTION(scope, );
        auto* record = dynamicDowncast<JSC::AbstractModuleRecord>(recordValue);
        if (!record || !keyValue.isString())
            continue;
        String key = asString(keyValue)->value(globalObject);
        RETURN_IF_EXCEPTION(scope, );
        auto* entry = loader->ensureRegistered(globalObject, JSC::Identifier::fromString(vm, key), JSC::ScriptFetchParameters::Type::JavaScript);
        RETURN_IF_EXCEPTION(scope, );
        if (entry && !entry->record())
            entry->provideModule(vm, record);
    }

    auto* requireMapCopy = dynamicDowncast<JSC::JSMap>(saved->getIndex(globalObject, isolatedRequireMapIndex));
    RETURN_IF_EXCEPTION(scope, );
    if (requireMapCopy) {
        auto* requireMap = globalObject->requireMap();
        requireMap->clear(globalObject);
        RETURN_IF_EXCEPTION(scope, );
        auto* iterator = JSC::JSMapIterator::create(vm, globalObject->mapIteratorStructure(), requireMapCopy, JSC::IterationKind::Entries);
        RETURN_IF_EXCEPTION(scope, );
        JSC::JSValue key, value;
        while (iterator->nextKeyValue(globalObject, key, value)) {
            RETURN_IF_EXCEPTION(scope, );
            requireMap->set(globalObject, key, value);
            RETURN_IF_EXCEPTION(scope, );
        }
        RETURN_IF_EXCEPTION(scope, );
    }

    auto* mocks = dynamicDowncast<JSC::JSArray>(saved->getIndex(globalObject, isolatedMocksIndex));
    RETURN_IF_EXCEPTION(scope, );
    if (mocks) {
        unsigned mocksLength = mocks->length();
        for (unsigned i = 0; i + 2 < mocksLength; i += 3) {
            auto* mock = dynamicDowncast<JSModuleMock>(mocks->getIndex(globalObject, i));
            RETURN_IF_EXCEPTION(scope, );
            JSC::JSValue hasCalled = mocks->getIndex(globalObject, i + 1);
            RETURN_IF_EXCEPTION(scope, );
            JSC::JSValue result = mocks->getIndex(globalObject, i + 2);
            RETURN_IF_EXCEPTION(scope, );
            if (!mock || mock->hasPendingPatch)
                continue;
            mock->hasCalledModuleMock = hasCalled.isTrue();
            if (result.isObject())
                mock->cachedResult.set(vm, mock, result.getObject());
            else
                mock->cachedResult.clear();
        }
    }
}

static bool startIsolatingModules(Zig::GlobalObject* globalObject, JSC::CallFrame* callframe, ASCIILiteral functionName)
{
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    if (!callframe->argument(0).isCallable()) {
        JSC::throwTypeError(globalObject, scope, makeString(functionName, "() requires a function"_s));
        return false;
    }
    if (globalObject->onLoadPlugins.isIsolatingModules) {
        JSC::throwTypeError(globalObject, scope, "isolateModules cannot be nested inside another isolateModules or isolateModulesAsync"_s);
        return false;
    }
    return true;
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsIsolateModules);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsIsolateModules, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    bool ok = startIsolatingModules(globalObject, callframe, "isolateModules"_s);
    RETURN_IF_EXCEPTION(scope, {});
    if (!ok)
        return {};

    JSC::JSArray* saved = isolateModuleRegistry(globalObject, callerFilePath(vm, callframe));
    RETURN_IF_EXCEPTION(scope, {});
    JSC::MarkedArgumentBuffer savedRoot;
    savedRoot.append(saved);

    JSC::JSValue callback = callframe->argument(0);
    JSC::call(globalObject, callback, JSC::getCallData(callback), JSC::jsUndefined(), JSC::ArgList());

    JSC::Exception* exception = scope.exception();
    if (exception && !scope.tryClearException()) {
        globalObject->onLoadPlugins.isIsolatingModules = false;
        return {};
    }
    restoreModuleRegistry(globalObject, saved);
    RETURN_IF_EXCEPTION(scope, {});
    if (exception) {
        scope.throwException(globalObject, exception);
        return {};
    }
    return JSValue::encode(callframe->thisValue());
}

static JSC::JSValue isolatedModulesSettled(JSC::JSGlobalObject* lexicalGlobalObject, JSC::CallFrame* callframe)
{
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    if (auto* saved = dynamicDowncast<JSC::JSArray>(callframe->thisValue()))
        restoreModuleRegistry(globalObject, saved);
    return callframe->argument(0);
}

static JSC_DECLARE_HOST_FUNCTION(jsFunctionIsolatedModulesFulfilled);
static JSC_DECLARE_HOST_FUNCTION(jsFunctionIsolatedModulesRejected);

JSC_DEFINE_HOST_FUNCTION(jsFunctionIsolatedModulesFulfilled, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    isolatedModulesSettled(lexicalGlobalObject, callframe);
    RETURN_IF_EXCEPTION(scope, {});
    return JSValue::encode(JSC::jsUndefined());
}

JSC_DEFINE_HOST_FUNCTION(jsFunctionIsolatedModulesRejected, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    JSC::JSValue reason = isolatedModulesSettled(lexicalGlobalObject, callframe);
    RETURN_IF_EXCEPTION(scope, {});
    scope.throwException(lexicalGlobalObject, reason);
    return {};
}

BUN_DECLARE_HOST_FUNCTION(JSMock__jsIsolateModulesAsync);
extern "C" JSC_DEFINE_HOST_FUNCTION(JSMock__jsIsolateModulesAsync, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callframe))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* globalObject = defaultGlobalObject(lexicalGlobalObject);
    bool ok = startIsolatingModules(globalObject, callframe, "isolateModulesAsync"_s);
    RETURN_IF_EXCEPTION(scope, {});
    if (!ok)
        return {};

    JSC::JSArray* saved = isolateModuleRegistry(globalObject, callerFilePath(vm, callframe));
    RETURN_IF_EXCEPTION(scope, {});
    JSC::MarkedArgumentBuffer savedRoot;
    savedRoot.append(saved);

    JSC::JSValue callback = callframe->argument(0);
    JSC::JSValue result = JSC::call(globalObject, callback, JSC::getCallData(callback), JSC::jsUndefined(), JSC::ArgList());

    JSC::Exception* exception = scope.exception();
    if (exception) {
        if (!scope.tryClearException()) {
            globalObject->onLoadPlugins.isIsolatingModules = false;
            return {};
        }
        restoreModuleRegistry(globalObject, saved);
        RETURN_IF_EXCEPTION(scope, {});
        RELEASE_AND_RETURN(scope, JSValue::encode(JSC::JSPromise::rejectedPromise(globalObject, exception->value())));
    }

    JSC::JSPromise* promise = JSC::JSPromise::resolvedPromise(globalObject, result);
    RETURN_IF_EXCEPTION(scope, {});
    auto sourceCode = makeSource("isolateModulesAsync"_s, JSC::SourceOrigin(), JSC::SourceTaintedOrigin::Untainted);
    auto* fulfilled = JSC::JSFunction::create(vm, globalObject, 1, String(), jsFunctionIsolatedModulesFulfilled, ImplementationVisibility::Private);
    auto* rejected = JSC::JSFunction::create(vm, globalObject, 1, String(), jsFunctionIsolatedModulesRejected, ImplementationVisibility::Private);
    auto* onFulfilled = JSC::JSBoundFunction::create(vm, globalObject, fulfilled, saved, JSC::ArgList(), 1, nullptr, sourceCode);
    RETURN_IF_EXCEPTION(scope, {});
    auto* onRejected = JSC::JSBoundFunction::create(vm, globalObject, rejected, saved, JSC::ArgList(), 1, nullptr, sourceCode);
    RETURN_IF_EXCEPTION(scope, {});
    RELEASE_AND_RETURN(scope, JSValue::encode(promise->then(globalObject, onFulfilled, onRejected)));
}

template<typename Visitor>
void JSModuleMock::visitChildrenImpl(JSCell* cell, Visitor& visitor)
{
    JSModuleMock* mock = uncheckedDowncast<JSModuleMock>(cell);
    ASSERT_GC_OBJECT_INHERITS(mock, info());
    Base::visitChildren(mock, visitor);

    visitor.append(mock->factory);
    visitor.append(mock->cachedResult);
    visitor.append(mock->actualExports);
    visitor.append(mock->specifier);
    visitor.append(mock->manualMockPath);
}

DEFINE_VISIT_CHILDREN(JSModuleMock);

EncodedJSValue BunPlugin::OnLoad::run(JSC::JSGlobalObject* globalObject, const BunString* namespaceString, const BunString* path)
{
    Group* groupPtr = this->group(namespaceString ? namespaceString->toWTFString(BunString::ZeroCopy) : String());
    if (groupPtr == nullptr) {
        return JSValue::encode(jsUndefined());
    }
    Group& group = *groupPtr;

    auto pathString = path->toWTFString(BunString::ZeroCopy);

    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    auto* function = group.find(globalObject, pathString);
    RETURN_IF_EXCEPTION(scope, {});
    if (!function) {
        return JSValue::encode(JSC::jsUndefined());
    }

    JSC::MarkedArgumentBuffer arguments;

    JSC::JSObject* paramsObject = JSC::constructEmptyObject(globalObject, globalObject->objectPrototype(), 1);
    const auto& builtinNames = WebCore::builtinNames(vm);
    paramsObject->putDirect(
        vm, builtinNames.pathPublicName(),
        jsString(vm, pathString));
    arguments.append(paramsObject);

    auto result = AsyncContextFrame::call(globalObject, function, JSC::jsUndefined(), arguments);
    RETURN_IF_EXCEPTION(scope, {});

    if (auto* promise = dynamicDowncast<JSPromise>(result)) {
        switch (promise->status()) {
        case JSPromise::Status::Rejected:
        case JSPromise::Status::Pending: {
            return JSValue::encode(promise);
        }
        case JSPromise::Status::Fulfilled: {
            result = promise->result();
            break;
        }
        }
    }

    if (!result.isObject()) {
        JSC::throwTypeError(globalObject, scope, "onLoad() expects an object returned"_s);
        return {};
    }

    RELEASE_AND_RETURN(scope, JSValue::encode(result));
}

std::optional<String> BunPlugin::OnLoad::resolveVirtualModule(const String& path, const String& from)
{
    ASSERT(virtualModules);

    if (this->mustDoExpensiveRelativeLookup) {
        String joinedPath = path;

        if (path.startsWith("./"_s) || path.startsWith(".."_s)) {
            auto url = WTF::URL::fileURLWithFileSystemPath(from);
            ASSERT(url.isValid());
            joinedPath = URL(url, path).fileSystemPath();
        }

        return virtualModules->contains(joinedPath) && !actualModuleRequests.contains(joinedPath) ? std::optional<String> { joinedPath } : std::nullopt;
    }

    return virtualModules->contains(path) && !actualModuleRequests.contains(path) ? std::optional<String> { path } : std::nullopt;
}

EncodedJSValue BunPlugin::OnResolve::run(JSC::JSGlobalObject* globalObject, const BunString* namespaceString, const BunString* path, const BunString* importer)
{
    Group* groupPtr = this->group(namespaceString ? namespaceString->toWTFString(BunString::ZeroCopy) : String());
    if (groupPtr == nullptr) {
        return JSValue::encode(jsUndefined());
    }
    Group& group = *groupPtr;
    auto& filters = group.filters;

    if (filters.size() == 0) {
        return JSValue::encode(jsUndefined());
    }

    auto& callbacks = group.callbacks;
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    WTF::String pathString = path->toWTFString(BunString::ZeroCopy);

    JSC::MarkedArgumentBuffer matchedCallbacks;
    matchedCallbacks.ensureCapacity(filters.size());
    if (matchedCallbacks.hasOverflowed()) [[unlikely]] {
        JSC::throwOutOfMemoryError(globalObject, scope);
        return {};
    }
    for (size_t i = 0; i < filters.size(); i++) {
        auto matchResult = filters[i].get()->match(globalObject, pathString, 0);
        RETURN_IF_EXCEPTION(scope, {});
        if (!matchResult) {
            continue;
        }
        auto* function = callbacks[i].get();
        if (!function) [[unlikely]] {
            continue;
        }
        matchedCallbacks.append(function);
    }
    if (matchedCallbacks.hasOverflowed()) [[unlikely]] {
        JSC::throwOutOfMemoryError(globalObject, scope);
        return {};
    }

    for (size_t i = 0; i < matchedCallbacks.size(); i++) {
        auto* function = matchedCallbacks.at(i).getObject();

        JSC::MarkedArgumentBuffer arguments;

        JSC::JSObject* paramsObject = JSC::constructEmptyObject(globalObject, globalObject->objectPrototype(), 2);
        const auto& builtinNames = WebCore::builtinNames(vm);
        auto* pathJS = Bun::toJS(globalObject, *path);
        RETURN_IF_EXCEPTION(scope, {});
        paramsObject->putDirect(
            vm, builtinNames.pathPublicName(),
            pathJS);
        auto* importerJS = Bun::toJS(globalObject, *importer);
        RETURN_IF_EXCEPTION(scope, {});
        paramsObject->putDirect(
            vm, builtinNames.importerPublicName(),
            importerJS);
        arguments.append(paramsObject);

        auto result = AsyncContextFrame::call(globalObject, function, JSC::jsUndefined(), arguments);
        RETURN_IF_EXCEPTION(scope, {});

        if (result.isUndefinedOrNull()) {
            continue;
        }

        if (auto* promise = dynamicDowncast<JSPromise>(result)) {
            switch (promise->status()) {
            case JSPromise::Status::Pending: {
                JSC::throwTypeError(globalObject, scope, "onResolve() doesn't support pending promises yet"_s);
                return {};
            }
            case JSPromise::Status::Rejected: {
                promise->setFlags(static_cast<uint16_t>(JSC::JSPromise::Status::Fulfilled));
                result = promise->result();
                return JSValue::encode(result);
            }
            case JSPromise::Status::Fulfilled: {
                result = promise->result();
                break;
            }
            }
        }

        // Check again after promise resolution
        if (result.isUndefinedOrNull()) {
            continue;
        }

        if (!result.isObject()) {
            JSC::throwTypeError(globalObject, scope, "onResolve() expects an object returned"_s);
            return {};
        }

        RELEASE_AND_RETURN(scope, JSValue::encode(result));
    }

    return JSValue::encode(JSC::jsUndefined());
}

} // namespace Zig

BUN_DEFINE_HOST_FUNCTION(jsFunctionMockModuleFactoryResolve, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callFrame))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    Zig::GlobalObject* globalObject = defaultGlobalObject(lexicalGlobalObject);
    auto* mock = uncheckedDowncast<Zig::JSModuleMock>(callFrame->argument(1));
    String specifier;
    bool isCurrent = Zig::didSettlePendingModulePatch(globalObject, mock, specifier);
    RETURN_IF_EXCEPTION(scope, {});
    if (!isCurrent)
        return JSC::JSValue::encode(JSC::jsUndefined());

    JSC::JSValue exportsValue = callFrame->argument(0);
    if (!exportsValue.isObject()) {
        Zig::throwFactoryMustReturnObject(globalObject, scope);
    } else {
        Zig::LoadedModule loaded = Zig::findLoadedModule(globalObject, mock->specifier.get());
        if (!scope.exception()) [[likely]]
            Zig::overrideLoadedModuleExports(globalObject, loaded, exportsValue.getObject());
    }
    if (scope.exception()) [[unlikely]] {
        Zig::unregisterModuleMock(globalObject, mock, specifier);
        return {};
    }

    return JSC::JSValue::encode(JSC::jsUndefined());
}

BUN_DEFINE_HOST_FUNCTION(jsFunctionMockModuleFactoryReject, (JSC::JSGlobalObject * lexicalGlobalObject, JSC::CallFrame* callFrame))
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);
    Zig::GlobalObject* globalObject = defaultGlobalObject(lexicalGlobalObject);
    String specifier;
    bool isCurrent = Zig::didSettlePendingModulePatch(globalObject, uncheckedDowncast<Zig::JSModuleMock>(callFrame->argument(1)), specifier);
    RETURN_IF_EXCEPTION(scope, {});
    if (!isCurrent)
        return JSC::JSValue::encode(JSC::jsUndefined());

    globalObject->onLoadPlugins.virtualModules->remove(specifier);
    scope.throwException(globalObject, callFrame->argument(0));
    return {};
}

extern "C" JSC::EncodedJSValue Bun__runOnResolvePlugins(Zig::GlobalObject* globalObject, const BunString* namespaceString, const BunString* path, const BunString* from)
{
    return globalObject->onResolvePlugins.run(globalObject, namespaceString, path, from);
}

extern "C" bool Bun__hasPlugins(Zig::GlobalObject* globalObject)
{
    return !globalObject->onLoadPlugins.isEmpty() || !globalObject->onResolvePlugins.isEmpty();
}

extern "C" BunString Bun__resolveVirtualModule(Zig::GlobalObject* globalObject, const BunString* specifier, const BunString* importer)
{
    auto& plugins = globalObject->onLoadPlugins;
    if (plugins.hasVirtualModules()) {
        if (auto key = plugins.resolveVirtualModule(specifier->toWTFString(), importer->toWTFString(BunString::ZeroCopy)))
            return Bun::toStringRef(*key);
    }
    return { BunStringTag::Dead };
}

extern "C" bool Bun__hasOnLoad(Zig::GlobalObject* globalObject, const BunString* namespaceString, const BunString* path)
{
    auto* group = globalObject->onLoadPlugins.group(namespaceString ? namespaceString->toWTFString(BunString::ZeroCopy) : String());
    if (!group)
        return false;
    auto pathString = path->toWTFString(BunString::ZeroCopy);
    return group->find(globalObject, pathString);
}

extern "C" JSC::EncodedJSValue Bun__runOnLoadPlugins(Zig::GlobalObject* globalObject, const BunString* namespaceString, const BunString* path)
{
    return globalObject->onLoadPlugins.run(globalObject, namespaceString, path);
}

namespace Bun {

Structure* createModuleMockStructure(JSC::VM& vm, JSC::JSGlobalObject* globalObject, JSC::JSValue prototype)
{
    return Zig::JSModuleMock::createStructure(vm, globalObject, prototype);
}

JSC::JSValue runVirtualModule(Zig::GlobalObject* globalObject, BunString* specifier, bool& wasModuleMock)
{
    auto fallback = [&]() -> JSC::JSValue {
        return JSValue::decode(Bun__runVirtualModule(globalObject, specifier));
    };

    if (!globalObject->onLoadPlugins.hasVirtualModules()) {
        return fallback();
    }
    auto& virtualModules = *globalObject->onLoadPlugins.virtualModules;
    WTF::String specifierString = specifier->toWTFString(BunString::ZeroCopy);

    if (auto virtualModuleFn = virtualModules.get(specifierString)) {
        auto& vm = JSC::getVM(globalObject);
        JSC::JSObject* function = virtualModuleFn.get();
        auto throwScope = DECLARE_THROW_SCOPE(vm);

        JSValue result;

        Zig::JSModuleMock* moduleMock = dynamicDowncast<Zig::JSModuleMock>(function);
        if (moduleMock && globalObject->onLoadPlugins.actualModuleRequests.contains(specifierString))
            return fallback();

        if (moduleMock) {
            wasModuleMock = true;
            // module mock
            result = moduleMock->executeOnce(globalObject);
        } else {
            // regular function
            JSC::MarkedArgumentBuffer arguments;
            JSC::CallData callData = JSC::getCallData(function);
            RELEASE_ASSERT(callData.type != JSC::CallData::Type::None);

            result = call(globalObject, function, callData, JSC::jsUndefined(), arguments);
        }

        RETURN_IF_EXCEPTION(throwScope, JSC::jsUndefined());

        if (auto* promise = dynamicDowncast<JSPromise>(result)) {
            switch (promise->status()) {
            case JSPromise::Status::Rejected:
            case JSPromise::Status::Pending: {
                return promise;
            }
            case JSPromise::Status::Fulfilled: {
                result = promise->result();
                break;
            }
            }
        }

        if (!result.isObject()) {
            JSC::throwTypeError(globalObject, throwScope, "virtual module expects an object returned"_s);
            return {};
        }

        return result;
    }

    return fallback();
}

JSC::JSValue builtinModuleMockExports(Zig::GlobalObject* globalObject, const String& specifier)
{
    auto& plugins = globalObject->onLoadPlugins;
    if (!plugins.hasVirtualModules())
        return {};
    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    String key = specifier;
    Zig::JSModuleMock* mock = Zig::registeredModuleMock(globalObject, key);
    if (!mock && specifier.startsWith("node:"_s)) {
        key = specifier.substring(5);
        mock = Zig::registeredModuleMock(globalObject, key);
    }
    if (!mock || plugins.actualModuleRequests.contains(key))
        return {};

    JSC::JSValue result = mock->executeOnce(globalObject);
    RETURN_IF_EXCEPTION(scope, {});
    if (auto* promise = dynamicDowncast<JSC::JSPromise>(result)) {
        switch (promise->status()) {
        case JSC::JSPromise::Status::Fulfilled:
            result = promise->result();
            break;
        case JSC::JSPromise::Status::Rejected:
            promise->markAsHandled();
            scope.throwException(globalObject, promise->result());
            return {};
        case JSC::JSPromise::Status::Pending:
            JSC::throwTypeError(globalObject, scope, makeString("require(\""_s, specifier, "\"): the factory of its mock has not settled yet"_s));
            return {};
        }
    }
    if (!result.isObject()) {
        Zig::throwFactoryMustReturnObject(globalObject, scope);
        return {};
    }
    return result;
}

} // namespace Bun

BUN_DEFINE_HOST_FUNCTION(jsFunctionBunPluginClear, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    Zig::GlobalObject* global = static_cast<Zig::GlobalObject*>(globalObject);
    global->onLoadPlugins.clear();
    global->onResolvePlugins.clear();

    return JSC::JSValue::encode(JSC::jsUndefined());
}

BUN_DEFINE_HOST_FUNCTION(jsFunctionBunPlugin, (JSC::JSGlobalObject * globalObject, JSC::CallFrame* callframe))
{
    return Bun::setupBunPlugin(globalObject, callframe, BunPluginTargetBun);
}
