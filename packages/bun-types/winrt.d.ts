/**
 * Windows Runtime from JavaScript. Namespaces are projected on demand from the metadata in
 * `C:\Windows\System32\WinMetadata` (or from a framework `.winmd` with `loadMetadata`). Runtime classes
 * expose their static and factory methods; instances expose the methods of every interface the class
 * implements, with `get_X` methods also readable as `X` properties.
 *
 * - `IAsyncAction` and `IAsyncOperation<T>` results are returned as Promises.
 * - `IVector<T>` and `IVectorView<T>` results are iterable.
 * - Strings are HSTRINGs, enums are numbers, 64-bit integers are bigints.
 *
 * @example
 * ```ts
 * import winrt from "bun:winrt";
 *
 * const { StorageFolder } = winrt.namespace("Windows.Storage");
 * const folder = await StorageFolder.GetFolderFromPathAsync("C:\\Windows");
 * for (const file of await folder.GetFilesAsyncOverloadDefaultOptionsStartAndCount()) console.log(file.Name);
 * ```
 *
 * @category Windows
 */
declare module "bun:winrt" {
  /** A wrapped WinRT interface pointer; its reference is released when the wrapper is collected. */
  interface WinRTObject {
    readonly ptr: number;
    readonly interfaceName: string | undefined;
    readonly className: string | undefined;
    readonly runtimeClassName: string;
    /** `QueryInterface` to another loaded interface. */
    as(interfaceName: string): WinRTObject;
    [member: string]: any;
  }

  /** A projected namespace: runtime classes, enums and the IIDs of its interfaces. */
  interface WinRTNamespace {
    readonly namespace: string;
    readonly interfaces: Readonly<Record<string, string>>;
    [member: string]: any;
  }

  /** A WinRT type name (`"Windows.Foundation.Uri"`, `"String"`, `"i32"`) or a generic instance (`["IVector", "String"]`). */
  type WinRTType = string | [string, ...WinRTType[]];

  interface WinRT {
    /** The namespace from `System32\WinMetadata`, loaded and cached on first use. */
    namespace(name: string): WinRTNamespace;
    /** Alias of `namespace`. */
    systemMetadata(name: string): WinRTNamespace;
    /** Every namespace of a `.winmd` file (cached as JSON in the temp directory unless `cache: false`). */
    loadMetadata(path: string, options?: { cache?: boolean }): Record<string, WinRTNamespace>;
    /** `RoInitialize`; multithreaded by default, single-threaded for UI threads (XAML). */
    init(options?: { singleThreaded?: boolean }): void;
    /** `RoGetActivationFactory` for a runtime class and interface IID; returns an owned pointer. */
    activationFactory(className: string, iid: string): number;
    /** Calls a method of `object` through the interface that declares it. */
    callMethod(object: WinRTObject, methodName: string, ...args: unknown[]): any;
    /** The `IVector<T>` of an object, iterable. */
    vector(object: WinRTObject | number, elementType: WinRTType): WinRTObject & Iterable<any>;
    /** `Windows.Foundation.PropertyValue` for strings, numbers, booleans and bigints. */
    box(value: string | number | boolean | bigint): WinRTObject;
    /** The value of an `IPropertyValue`, or `object` itself when it is not one. */
    unbox(object: unknown): unknown;
    /**
     * A COM delegate whose `Invoke` calls `fn` with wrapped arguments: a loaded delegate type or a generic
     * one such as `["TypedEventHandler", "Object", "Microsoft.UI.Xaml.WindowEventArgs"]`.
     */
    delegate(
      type: WinRTType,
      fn: (...args: any[]) => unknown,
      params?: [kind: string, type: unknown][],
    ): {
      readonly ptr: number;
      readonly iid: string;
      release(): void;
    };
    /** Wraps an owned interface pointer. */
    wrap(pointer: number, interfaceName?: string, className?: string): WinRTObject;
    /** Wraps a borrowed interface pointer (adds a reference first). */
    wrapBorrowed(pointer: number, interfaceName?: string, className?: string): WinRTObject | null;
    addRef(pointer: number): number;
    queryInterface(pointer: number, iid: string): number;
    /** IID of a loaded interface or delegate, or of a generic instance (`["IVector", "String"]`). */
    iidOf(type: WinRTType): string;
    /** The WinRT type signature used to compute parameterized IIDs. */
    signatureOf(type: WinRTType): string;
    parameterizedIid(signature: string): string;
    createHString(value: string): number;
    readHString(handle: number, release?: boolean): string;
    guid(text: string): Uint8Array;
    hresultError(hr: number, what: string): Error & { code: "ERR_WINRT_HRESULT"; hresult: number };
    /** Registers a namespace description (as produced by `scripts/aphrody/winrt/gen.ts`). */
    defineNamespace(data: { namespace: string; interfaces: object; classes: object; enums: object }): WinRTNamespace;
    readonly registry: {
      interfaces: Map<string, unknown>;
      classes: Map<string, unknown>;
      enums: Map<string, unknown>;
      delegates: Map<string, unknown>;
    };
    readonly WinRTObject: new (pointer: number, interfaceName?: string, className?: string) => WinRTObject;
    [member: string]: any;
  }

  const winrt: WinRT;
  export default winrt;
}
