extern "C" JSC::EncodedJSValue Bun__Jest__createVitestModuleObject(JSC::JSGlobalObject*);

namespace Zig {
// "vitest" resolves here under `bun test`: the bun:test API, but test callbacks receive the vitest context.
void generateNativeModule_BunVitest(
    JSC::JSGlobalObject* lexicalGlobalObject,
    JSC::Identifier moduleKey,
    Vector<JSC::Identifier, 4>& exportNames,
    JSC::MarkedArgumentBuffer& exportValues)
{
    auto& vm = JSC::getVM(lexicalGlobalObject);
    auto globalObject = uncheckedDowncast<Zig::GlobalObject>(lexicalGlobalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    auto& slot = globalObject->nativeModuleDefaultObject(Zig::NativeModuleDefaultSlot::BunVitest);
    JSObject* object = slot.get();
    if (!object) {
        JSValue result = JSValue::decode(Bun__Jest__createVitestModuleObject(globalObject));
        RETURN_IF_EXCEPTION(scope, );
        object = result.isEmpty() ? nullptr : result.getObject();
        if (!object) [[unlikely]]
            object = JSC::constructEmptyObject(globalObject);
        slot.set(vm, globalObject, object);
    }

    exportNames.append(vm.propertyNames->defaultKeyword);
    exportValues.append(object);

    JSC::PropertyNameArrayBuilder properties(vm, JSC::PropertyNameMode::Strings, JSC::PrivateSymbolMode::Exclude);
    object->methodTable()->getOwnPropertyNames(object, lexicalGlobalObject, properties, JSC::DontEnumPropertiesMode::Exclude);
    RETURN_IF_EXCEPTION(scope, );

    for (auto& property : properties.releaseData()->propertyNameVector()) {
        JSC::PropertySlot propertySlot(object, JSC::PropertySlot::InternalMethodType::Get);
        auto ownPropertySlot = object->methodTable()->getOwnPropertySlot(object, lexicalGlobalObject, property, propertySlot);
        RETURN_IF_EXCEPTION(scope, );
        if (ownPropertySlot) {
            JSValue value = propertySlot.getValue(lexicalGlobalObject, property);
            RETURN_IF_EXCEPTION(scope, );
            exportNames.append(property);
            exportValues.append(value);
        }
    }
}

} // namespace Zig
