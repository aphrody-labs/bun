//! `--lang json|ts`: Win32 metadata as data for `bun:ffi` instead of Rust code.
//!
//! Functions are grouped by import DLL; structs carry their size, alignment and field offsets
//! for the requested architecture (pointer width, `SupportedArchitecture` overloads, packing,
//! explicit-layout unions); enums and constants carry their values. The TS flavour is a
//! self-contained module whose `symbols` can be passed straight to `dlopen`.

// Bun's workspace clippy.toml steers to bun_core helpers, which this vendored crate cannot depend on.
#![allow(clippy::disallowed_methods, clippy::disallowed_macros)]

use super::*;

/// Output language of [`Bindgen`].
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Lang {
    #[default]
    Rust,
    Json,
    Ts,
}

/// Target architecture for layouts and pointer-sized integers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Arch {
    X86,
    X64,
    Arm64,
}

impl Arch {
    pub(crate) fn host() -> Self {
        if cfg!(target_arch = "x86") {
            Self::X86
        } else if cfg!(target_arch = "aarch64") {
            Self::Arm64
        } else {
            Self::X64
        }
    }

    #[track_caller]
    pub(crate) fn parse(value: &str) -> Self {
        match value.to_ascii_lowercase().as_str() {
            "x64" | "x86_64" | "amd64" => Self::X64,
            "arm64" | "aarch64" => Self::Arm64,
            "x86" | "i686" | "i386" => Self::X86,
            _ => panic!("invalid architecture `{value}` (expected x64, arm64 or x86)"),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::X86 => "x86",
            Self::X64 => "x64",
            Self::Arm64 => "arm64",
        }
    }

    /// `SupportedArchitectureAttribute` bit (`x86 = 1`, `x64 = 2`, `arm64 = 4`).
    fn bit(self) -> i32 {
        match self {
            Self::X86 => 1,
            Self::X64 => 2,
            Self::Arm64 => 4,
        }
    }

    fn supports(self, arches: i32) -> bool {
        arches == 0 || arches & self.bit() != 0
    }

    fn pointer(self) -> usize {
        match self {
            Self::X86 => 4,
            _ => 8,
        }
    }
}

/// Normalizes an import scope or `--dll` argument: lowercase, `.dll` appended when there is no
/// extension (`winspool.drv` stays as is).
pub(crate) fn normalize_dll(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    let file = lower.rsplit(['/', '\\']).next().unwrap_or(&lower);
    if file.contains('.') {
        lower
    } else {
        format!("{lower}.dll")
    }
}

// ─── output tree ────────────────────────────────────────────────────────────

enum Node {
    Bool(bool),
    /// A number literal, already formatted.
    Num(String),
    Str(String),
    /// An integer outside the safe JS range: a decimal string in JSON, a bigint in TS.
    Big(String),
    /// A TS expression (`FFIType.ptr`); a string in JSON.
    Expr(String),
    Arr(Vec<Self>),
    Obj(Vec<(String, Self)>),
}

impl Node {
    fn obj() -> Self {
        Self::Obj(Vec::new())
    }

    fn str(value: impl Into<String>) -> Self {
        Self::Str(value.into())
    }

    fn push(&mut self, key: impl Into<String>, value: Self) {
        if let Self::Obj(entries) = self {
            entries.push((key.into(), value));
        }
    }

    fn int(value: i128) -> Self {
        const SAFE: i128 = (1 << 53) - 1;
        if (-SAFE..=SAFE).contains(&value) {
            Self::Num(value.to_string())
        } else {
            Self::Big(value.to_string())
        }
    }

    fn float(value: f64) -> Self {
        if value.is_finite() {
            let text = format!("{value:?}");
            Self::Num(text)
        } else {
            Self::Str(value.to_string())
        }
    }

    fn write(&self, out: &mut String, lang: Lang, indent: usize) {
        match self {
            Self::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            Self::Num(value) => out.push_str(value),
            Self::Str(value) => write_string(out, value),
            Self::Big(value) => {
                if lang == Lang::Ts {
                    out.push_str(value);
                    out.push('n');
                } else {
                    write_string(out, value);
                }
            }
            Self::Expr(value) => {
                if lang == Lang::Ts {
                    out.push_str(value);
                } else {
                    write_string(out, value.rsplit('.').next().unwrap_or(value));
                }
            }
            Self::Arr(items) => {
                // Arrays of scalars stay on one line.
                if items
                    .iter()
                    .all(|item| !matches!(item, Self::Arr(_) | Self::Obj(_)))
                {
                    out.push('[');
                    for (i, item) in items.iter().enumerate() {
                        if i > 0 {
                            out.push_str(", ");
                        }
                        item.write(out, lang, indent);
                    }
                    out.push(']');
                    return;
                }
                out.push_str("[\n");
                for (i, item) in items.iter().enumerate() {
                    push_indent(out, indent + 1);
                    item.write(out, lang, indent + 1);
                    if i + 1 < items.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                push_indent(out, indent);
                out.push(']');
            }
            Self::Obj(entries) => {
                if entries.is_empty() {
                    out.push_str("{}");
                    return;
                }
                out.push_str("{\n");
                for (i, (key, value)) in entries.iter().enumerate() {
                    push_indent(out, indent + 1);
                    write_string(out, key);
                    out.push_str(": ");
                    value.write(out, lang, indent + 1);
                    if i + 1 < entries.len() {
                        out.push(',');
                    }
                    out.push('\n');
                }
                push_indent(out, indent);
                out.push('}');
            }
        }
    }
}

fn push_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}

fn write_string(out: &mut String, value: &str) {
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            // U+2028/U+2029 are line terminators in older JS parsers.
            c if (c as u32) < 0x20 || c == '\u{2028}' || c == '\u{2029}' => {
                write!(out, "\\u{:04x}", c as u32).unwrap();
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

// ─── model ──────────────────────────────────────────────────────────────────

struct Layout {
    size: usize,
    align: usize,
}

struct Emitter<'a> {
    reader: &'a Reader,
    arch: Arch,
    /// Short name → (full name, struct) for every struct reached.
    structs: BTreeMap<String, (String, CppStruct)>,
    enums: BTreeMap<String, CppEnum>,
}

impl<'a> Emitter<'a> {
    /// The overload of a top-level struct that applies to the target architecture.
    fn select_struct(&self, ty: &CppStruct) -> CppStruct {
        let namespace = ty.def.namespace();
        if namespace.is_empty() {
            return ty.clone();
        }
        let mut first = None;
        for candidate in self.reader.with_full_name(namespace, ty.def.name()) {
            if let Type::CppStruct(candidate) = candidate {
                if self.arch.supports(candidate.def.arches()) {
                    return candidate;
                }
                first.get_or_insert(candidate);
            }
        }
        first.unwrap_or_else(|| ty.clone())
    }

    /// Native typedefs and handles (`HWND`, `LPARAM`, `BOOLEAN`): the type of their `Value`.
    fn typedef_target(&self, ty: &CppStruct) -> Option<Type> {
        if !(ty.is_native_typedef() || ty.is_handle(self.reader)) {
            return None;
        }
        let field = ty.def.fields().next()?;
        Some(field.field_type(Some(ty), self.reader))
    }

    fn full_name(&self, ty: &Type, namespace: &str) -> String {
        match ty {
            Type::CppStruct(s) => {
                let ns = s.def.namespace();
                format!("{}.{}", if ns.is_empty() { namespace } else { ns }, s.name)
            }
            _ => {
                let name = ty.type_name();
                format!("{}.{}", name.namespace(), name.name())
            }
        }
    }

    fn type_string(&self, ty: &Type, namespace: &str) -> String {
        match ty {
            Type::Void => "void".into(),
            Type::Bool => "bool".into(),
            Type::Char => "char16".into(),
            Type::I8 => "i8".into(),
            Type::U8 => "u8".into(),
            Type::I16 => "i16".into(),
            Type::U16 => "u16".into(),
            Type::I32 => "i32".into(),
            Type::U32 => "u32".into(),
            Type::I64 => "i64".into(),
            Type::U64 => "u64".into(),
            Type::F32 => "f32".into(),
            Type::F64 => "f64".into(),
            Type::ISize => "isize".into(),
            Type::USize => "usize".into(),
            Type::String => "Windows.Win32.System.WinRT.HSTRING".into(),
            Type::Object => "Windows.Win32.System.WinRT.IInspectable".into(),
            Type::Type => "System.Type".into(),
            Type::PSTR => "Windows.Win32.Foundation.PSTR".into(),
            Type::PCSTR => "Windows.Win32.Foundation.PCSTR".into(),
            Type::PWSTR => "Windows.Win32.Foundation.PWSTR".into(),
            Type::PCWSTR => "Windows.Win32.Foundation.PCWSTR".into(),
            Type::GUID => "System.Guid".into(),
            Type::HRESULT => "Windows.Win32.Foundation.HRESULT".into(),
            Type::IUnknown => "Windows.Win32.System.Com.IUnknown".into(),
            Type::BSTR => "Windows.Win32.Foundation.BSTR".into(),
            Type::BOOL => "Windows.Win32.Foundation.BOOL".into(),
            Type::NTSTATUS => "Windows.Win32.Foundation.NTSTATUS".into(),
            Type::RPC_STATUS => "Windows.Win32.System.Rpc.RPC_STATUS".into(),
            Type::PtrMut(inner, n) | Type::PtrConst(inner, n) => {
                format!("{}{}", self.type_string(inner, namespace), "*".repeat(*n))
            }
            Type::ArrayFixed(inner, n) => format!("{}[{n}]", self.type_string(inner, namespace)),
            Type::Array(inner) | Type::ArrayRef(inner) => {
                format!("{}[]", self.type_string(inner, namespace))
            }
            Type::ConstRef(inner) => format!("{}&", self.type_string(inner, namespace)),
            Type::Generic(_) => "generic".into(),
            _ => self.full_name(ty, namespace),
        }
    }

    /// The `FFIType` name of a value of this type passed or returned by value; `None` for an
    /// aggregate (struct, GUID, fixed array).
    fn scalar_ffi(&self, ty: &Type) -> Option<&'static str> {
        let wide = self.arch.pointer() == 8;
        Some(match ty {
            Type::Void => "void",
            Type::Bool => "bool",
            Type::I8 => "i8",
            Type::U8 => "u8",
            Type::I16 => "i16",
            Type::U16 | Type::Char => "u16",
            Type::I32 | Type::BOOL | Type::HRESULT | Type::NTSTATUS | Type::RPC_STATUS => "i32",
            Type::U32 => "u32",
            Type::I64 => "i64",
            Type::U64 => "u64",
            Type::F32 => "f32",
            Type::F64 => "f64",
            Type::ISize => {
                if wide {
                    "i64"
                } else {
                    "i32"
                }
            }
            Type::USize => {
                if wide {
                    "u64"
                } else {
                    "u32"
                }
            }
            Type::CppEnum(e) => return self.scalar_ffi(&e.def.underlying_type_ext(self.reader)),
            Type::Enum(e) => return self.scalar_ffi(&e.def.underlying_type_ext(self.reader)),
            Type::CppStruct(s) => {
                let s = self.select_struct(s);
                return match self.typedef_target(&s) {
                    Some(target) => self.scalar_ffi(&target),
                    None => None,
                };
            }
            Type::Struct(_) | Type::GUID | Type::ArrayFixed(..) => return None,
            _ => "ptr",
        })
    }

    fn layout(&self, ty: &Type) -> Layout {
        let pointer = self.arch.pointer();
        let scalar = |size: usize| Layout { size, align: size };
        match ty {
            Type::Void => Layout { size: 0, align: 1 },
            Type::Bool | Type::I8 | Type::U8 => scalar(1),
            Type::I16 | Type::U16 | Type::Char => scalar(2),
            Type::I32
            | Type::U32
            | Type::F32
            | Type::BOOL
            | Type::HRESULT
            | Type::NTSTATUS
            | Type::RPC_STATUS => scalar(4),
            // MSVC aligns 8-byte scalars to 8 inside structs on x86 too (default /Zp8).
            Type::I64 | Type::U64 | Type::F64 => scalar(8),
            Type::GUID => Layout { size: 16, align: 4 },
            Type::ArrayFixed(inner, n) => {
                let inner = self.layout(inner);
                Layout {
                    size: inner.size * n,
                    align: inner.align,
                }
            }
            Type::CppEnum(e) => self.layout(&e.def.underlying_type_ext(self.reader)),
            Type::Enum(e) => self.layout(&e.def.underlying_type_ext(self.reader)),
            Type::CppStruct(s) => self.struct_layout(&self.select_struct(s)).0,
            Type::Struct(s) => self.def_layout(s.def, None).0,
            _ => scalar(pointer),
        }
    }

    fn struct_layout(&self, ty: &CppStruct) -> (Layout, Vec<(String, usize, Type)>) {
        self.def_layout(ty.def, Some(ty))
    }

    fn def_layout(
        &self,
        def: TypeDef,
        enclosing: Option<&CppStruct>,
    ) -> (Layout, Vec<(String, usize, Type)>) {
        let pack = def
            .class_layout()
            .map(|layout| layout.packing_size() as usize)
            .filter(|pack| *pack > 0);
        let union = def.flags().contains(TypeAttributes::ExplicitLayout);
        let mut offset = 0usize;
        let mut size = 0usize;
        let mut align = 1usize;
        let mut fields = Vec::new();

        for field in def.fields() {
            if field.flags().contains(FieldAttributes::Literal) {
                continue;
            }
            let ty = field.field_type(enclosing, self.reader);
            let layout = self.layout(&ty);
            let field_align = pack.map_or(layout.align, |pack| layout.align.min(pack)).max(1);
            align = align.max(field_align);
            if union {
                size = size.max(layout.size);
                fields.push((field.name().to_string(), 0, ty));
            } else {
                offset = offset.next_multiple_of(field_align);
                fields.push((field.name().to_string(), offset, ty));
                offset += layout.size;
                size = offset;
            }
        }

        (
            Layout {
                size: size.next_multiple_of(align),
                align,
            },
            fields,
        )
    }

    /// Records every struct and enum reachable from `ty` (through pointers, arrays and fields).
    fn reach(&mut self, ty: &Type, namespace: &str) {
        match ty.decay() {
            Type::CppEnum(e) => {
                self.enums.insert(e.def.name().to_string(), e.clone());
            }
            Type::CppStruct(s) => {
                let s = self.select_struct(s);
                if let Some(target) = self.typedef_target(&s) {
                    self.reach(&target, namespace);
                    return;
                }
                let full = self.full_name(&Type::CppStruct(s.clone()), namespace);
                if self.structs.contains_key(s.name) {
                    return;
                }
                let own_namespace = full.rsplit_once('.').map_or("", |(ns, _)| ns).to_string();
                self.structs
                    .insert(s.name.to_string(), (full, s.clone()));
                for field in s.def.fields() {
                    if field.flags().contains(FieldAttributes::Literal) {
                        continue;
                    }
                    let field_ty = field.field_type(Some(&s), self.reader);
                    self.reach(&field_ty, &own_namespace);
                }
            }
            _ => {}
        }
    }

    fn struct_node(&self, full: &str, ty: &CppStruct) -> Node {
        let namespace = full.rsplit_once('.').map_or("", |(ns, _)| ns);
        let (layout, fields) = self.struct_layout(ty);
        let mut node = Node::obj();
        node.push("fullName", Node::str(full));
        node.push("size", Node::Num(layout.size.to_string()));
        node.push("align", Node::Num(layout.align.to_string()));
        node.push(
            "union",
            Node::Bool(ty.def.flags().contains(TypeAttributes::ExplicitLayout)),
        );
        let fields = fields
            .into_iter()
            .map(|(name, offset, field_ty)| {
                let mut field = Node::obj();
                field.push("name", Node::str(name));
                field.push("offset", Node::Num(offset.to_string()));
                field.push("type", Node::str(self.type_string(&field_ty, namespace)));
                match &field_ty {
                    Type::ArrayFixed(element, len) => {
                        if let Some(ffi) = self.scalar_ffi(element) {
                            field.push("ffi", Node::str(ffi));
                        } else if let Some(name) = self.struct_key(element) {
                            field.push("struct", Node::str(name));
                        }
                        field.push("length", Node::Num(len.to_string()));
                    }
                    _ => {
                        if let Some(ffi) = self.scalar_ffi(&field_ty) {
                            field.push("ffi", Node::str(ffi));
                        } else if let Some(name) = self.struct_key(&field_ty) {
                            field.push("struct", Node::str(name));
                        }
                    }
                }
                field
            })
            .collect();
        node.push("fields", Node::Arr(fields));
        node
    }

    /// Key in `structs` of an embedded struct field.
    fn struct_key(&self, ty: &Type) -> Option<String> {
        match ty {
            Type::CppStruct(s) => Some(self.select_struct(s).name.to_string()),
            Type::GUID => Some("GUID".into()),
            _ => None,
        }
    }

    fn param_node(&self, name: Option<&str>, ty: &Type, namespace: &str) -> Node {
        let mut node = Node::obj();
        if let Some(name) = name {
            node.push("name", Node::str(name));
        }
        node.push("type", Node::str(self.type_string(ty, namespace)));
        match self.scalar_ffi(ty) {
            Some(ffi) => node.push("ffi", Node::str(ffi)),
            None => {
                node.push("ffi", Node::str("ptr"));
                node.push("byValue", Node::Bool(true));
            }
        }
        node
    }
}

fn value_node(value: &Value) -> Option<Node> {
    Some(match value {
        Value::Bool(v) => Node::Bool(*v),
        Value::U8(v) => Node::int((*v).into()),
        Value::I8(v) => Node::int((*v).into()),
        Value::U16(v) => Node::int((*v).into()),
        Value::I16(v) => Node::int((*v).into()),
        Value::U32(v) => Node::int((*v).into()),
        Value::I32(v) => Node::int((*v).into()),
        Value::U64(v) | Value::USize(v) => Node::int((*v).into()),
        Value::I64(v) | Value::ISize(v) => Node::int((*v).into()),
        Value::F32(v) => Node::float((*v).into()),
        Value::F64(v) => Node::float(*v),
        Value::Utf8(v) | Value::Utf16(v) => Node::str(v.clone()),
        Value::EnumValue(_, inner) => return value_node(inner),
        Value::TypeName(_) => return None,
    })
}

/// A function selected for output.
struct Function {
    dll: String,
    name: String,
    entry: String,
    namespace: &'static str,
    method: MethodDef,
}

impl Bindgen {
    /// `write()` for `--lang json|ts`.
    #[track_caller]
    pub(crate) fn write_ffi(&self, include: &[&str], exclude: &[&str]) {
        let arch = self.arch.unwrap_or_else(Arch::host);
        let reader_storage;
        let reader = if self.input.is_empty() {
            default_reader(true)
        } else {
            reader_storage = Reader::new_sys(expand_input(&self.input, self.input_default));
            &reader_storage
        };

        let references = References::new(reader, Vec::new());
        let mut parsed = Vec::new();
        for entry in include {
            parsed.extend(filter_parser::parse_filter_entry(entry));
        }
        for entry in exclude {
            let mut entries = filter_parser::parse_filter_entry(entry);
            for e in &mut entries {
                e.exclude = true;
            }
            parsed.extend(entries);
        }
        let resolved = filter_parser::resolve_entries(reader, &parsed);
        let filter = Filter::from_resolved(reader, &resolved);
        let types = TypeMap::filter(reader, &filter, &references, true);

        let dlls: BTreeSet<String> = self.dlls.iter().map(|d| normalize_dll(d)).collect();

        let mut emitter = Emitter {
            reader,
            arch,
            structs: BTreeMap::new(),
            enums: BTreeMap::new(),
        };

        // Functions.
        let mut functions: Vec<Function> = Vec::new();
        let mut consts: Vec<CppConst> = Vec::new();
        let mut selected_structs: Vec<CppStruct> = Vec::new();
        let mut selected_enums: Vec<CppEnum> = Vec::new();
        for set in types.values() {
            for ty in set {
                match ty {
                    Type::CppFn(f) => {
                        let Some(map) = f.method.impl_map() else {
                            continue;
                        };
                        if !arch.supports(f.method.arches()) {
                            continue;
                        }
                        let dll = normalize_dll(map.import_scope().name());
                        if !dlls.is_empty() && !dlls.contains(&dll) {
                            continue;
                        }
                        functions.push(Function {
                            dll,
                            name: f.method.name().to_string(),
                            entry: map.import_name().to_string(),
                            namespace: f.namespace,
                            method: f.method,
                        });
                    }
                    Type::CppConst(c) if !c.is_enum_member => consts.push(c.clone()),
                    Type::CppStruct(s) => selected_structs.push(s.clone()),
                    Type::CppEnum(e) => selected_enums.push(e.clone()),
                    _ => {}
                }
            }
        }
        functions.sort_by(|a, b| (&a.dll, &a.name).cmp(&(&b.dll, &b.name)));
        functions.dedup_by(|a, b| a.dll == b.dll && a.name == b.name);

        let function_namespaces: BTreeSet<&str> = functions.iter().map(|f| f.namespace).collect();

        // With `--dll`, types and constants follow the kept functions.
        if dlls.is_empty() {
            for s in &selected_structs {
                emitter.reach(&Type::CppStruct(s.clone()), s.def.namespace());
            }
            for e in &selected_enums {
                emitter.reach(&Type::CppEnum(e.clone()), "");
            }
        } else {
            consts.retain(|c| function_namespaces.contains(c.namespace));
        }

        let mut by_dll: BTreeMap<String, Node> = BTreeMap::new();
        let mut symbols: BTreeMap<String, Node> = BTreeMap::new();
        for f in &functions {
            let signature = f.method.method_signature(&[], reader);
            let variadic = signature.call_flags.contains(MethodCallAttributes::VARARG);
            let mut node = Node::obj();
            node.push("namespace", Node::str(f.namespace));
            if f.entry != f.name {
                node.push("entryPoint", Node::str(&f.entry));
            }
            let args = signature
                .params
                .iter()
                .map(|p| {
                    emitter.reach(&p.ty, f.namespace);
                    emitter.param_node(Some(p.name()), &p.ty, f.namespace)
                })
                .collect();
            emitter.reach(&signature.return_type, f.namespace);
            node.push("args", Node::Arr(args));
            node.push(
                "returns",
                emitter.param_node(None, &signature.return_type, f.namespace),
            );
            let set_last_error = f
                .method
                .impl_map()
                .is_some_and(|map| {
                    map.flags()
                        .contains(windows_metadata::PInvokeAttributes::SupportsLastError)
                })
                || f.method.has_attribute("SetLastErrorAttribute");
            node.push("setLastError", Node::Bool(set_last_error));
            if variadic {
                node.push("variadic", Node::Bool(true));
            }
            let dll_node = by_dll.entry(f.dll.clone()).or_insert_with(Node::obj);
            dll_node.push(f.name.clone(), node);

            // bun:ffi has no varargs.
            if !variadic {
                let ffi = |ty: &Type| {
                    Node::Expr(format!(
                        "FFIType.{}",
                        emitter.scalar_ffi(ty).unwrap_or("ptr")
                    ))
                };
                let mut symbol = Node::obj();
                symbol.push(
                    "args",
                    Node::Arr(signature.params.iter().map(|p| ffi(&p.ty)).collect()),
                );
                symbol.push("returns", ffi(&signature.return_type));
                symbols
                    .entry(f.dll.clone())
                    .or_insert_with(Node::obj)
                    .push(f.entry.clone(), symbol);
            }
        }

        // Wide aliases: `X` → `XW` when both `XA` and `XW` are kept.
        let names: BTreeSet<&str> = functions.iter().map(|f| f.name.as_str()).collect();
        let mut wide_aliases = Node::obj();
        for name in &names {
            if let Some(stem) = name.strip_suffix('W')
                && !stem.is_empty()
                && names.contains(format!("{stem}A").as_str())
            {
                wide_aliases.push(stem.to_string(), Node::str(*name));
            }
        }

        // Structs.
        let mut structs = Node::obj();
        for (key, (full, s)) in &emitter.structs {
            structs.push(key.clone(), emitter.struct_node(full, s));
        }

        // Enums.
        let mut enums_json = Node::obj();
        let mut enums_ts = Node::obj();
        for (key, e) in &emitter.enums {
            if !arch.supports(e.def.arches()) {
                continue;
            }
            let underlying = e.def.underlying_type_ext(reader);
            let mut values = Node::obj();
            for field in e.def.fields() {
                if !field.flags().contains(FieldAttributes::Literal) {
                    continue;
                }
                if let Some(value) = field.constant().and_then(|c| value_node(&c.value())) {
                    values.push(field.name().to_string(), value);
                }
            }
            let mut node = Node::obj();
            node.push("fullName", Node::str(e.type_name().to_string()));
            node.push("type", Node::str(emitter.type_string(&underlying, "")));
            node.push("flags", Node::Bool(e.def.has_attribute("FlagsAttribute")));
            let ts_values = clone_node(&values);
            node.push("values", values);
            enums_json.push(key.clone(), node);
            enums_ts.push(key.clone(), ts_values);
        }

        // Constants.
        consts.sort();
        let mut constants_json = Node::obj();
        let mut constants_ts = Node::obj();
        let mut seen = BTreeSet::new();
        for c in &consts {
            if !arch.supports(c.effective_arches()) || !seen.insert(c.field.name()) {
                continue;
            }
            let field_ty = c.field.field_type(None, reader).to_const_type();
            let value = if let Some(guid) = c.field.guid_attribute() {
                match c.field.constant().and_then(|k| value_node(&k.value())) {
                    // Property keys: GUID in the attribute, pid in the constant.
                    Some(pid) => {
                        let mut key = Node::obj();
                        key.push("fmtid", Node::str(guid.to_string()));
                        key.push("pid", pid);
                        key
                    }
                    None => Node::str(guid.to_string()),
                }
            } else if let Some(value) = c.field.constant().and_then(|k| value_node(&k.value())) {
                value
            } else {
                continue;
            };
            let mut node = Node::obj();
            node.push("type", Node::str(emitter.type_string(&field_ty, c.namespace)));
            node.push("value", clone_node(&value));
            constants_json.push(c.field.name().to_string(), node);
            constants_ts.push(c.field.name().to_string(), value);
        }

        let mut functions_node = Node::obj();
        for (dll, node) in by_dll {
            functions_node.push(dll, node);
        }

        let lang = self.lang;
        let mut out = String::new();
        if lang == Lang::Json {
            let mut root = Node::obj();
            root.push("arch", Node::str(arch.name()));
            root.push("functions", functions_node);
            root.push("structs", structs);
            root.push("enums", enums_json);
            root.push("constants", constants_json);
            root.push("wideAliases", wide_aliases);
            root.write(&mut out, lang, 0);
            out.push('\n');
        } else {
            let mut symbols_node = Node::obj();
            for (dll, node) in symbols {
                symbols_node.push(dll, node);
            }
            out.push_str("// Generated by `bun winmd --lang ts` (windows-bindgen). Do not edit.\n");
            out.push_str("import { dlopen, FFIType } from \"bun:ffi\";\n\n");
            out.push_str(
                "export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;\n",
            );
            writeln!(out, "export const arch = \"{}\";", arch.name()).unwrap();
            for (name, node) in [
                ("signatures", functions_node),
                ("symbols", symbols_node),
                ("structs", structs),
                ("enums", enums_ts),
                ("constants", constants_ts),
                ("wideAliases", wide_aliases),
            ] {
                write!(out, "export const {name} = ").unwrap();
                node.write(&mut out, lang, 0);
                out.push_str(" as const;\n");
            }
            out.push_str(
                "export function open<D extends keyof typeof symbols>(dll: D) {\n  return dlopen(dll, symbols[dll]);\n}\n",
            );
        }

        write_to_file(&self.output, out);
    }
}

fn clone_node(node: &Node) -> Node {
    match node {
        Node::Bool(v) => Node::Bool(*v),
        Node::Num(v) => Node::Num(v.clone()),
        Node::Str(v) => Node::Str(v.clone()),
        Node::Big(v) => Node::Big(v.clone()),
        Node::Expr(v) => Node::Expr(v.clone()),
        Node::Arr(items) => Node::Arr(items.iter().map(clone_node).collect()),
        Node::Obj(entries) => Node::Obj(
            entries
                .iter()
                .map(|(k, v)| (k.clone(), clone_node(v)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Win32 metadata of the `Microsoft.Windows.SDK.Win32Metadata` NuGet package (namespaced,
    /// with enums and `SetLastError`), or `WINDOWS_BINDGEN_WIN32_WINMD`.
    fn nuget_win32() -> Option<std::path::PathBuf> {
        if let Some(path) = std::env::var_os("WINDOWS_BINDGEN_WIN32_WINMD") {
            return Some(path.into());
        }
        let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
        let root = std::path::Path::new(&home).join(".nuget/packages/microsoft.windows.sdk.win32metadata");
        let mut versions: Vec<_> = std::fs::read_dir(root).ok()?.flatten().map(|e| e.path()).collect();
        versions.sort();
        versions.into_iter().rev().map(|v| v.join("Windows.Win32.winmd")).find(|p| p.is_file())
    }

    /// The flat `Windows.Win32.winmd` of windows-rs (`windows-default`).
    fn flat_win32() -> Option<std::path::PathBuf> {
        let path = std::path::PathBuf::from(
            std::env::var_os("WINDOWS_BINDGEN_DEFAULT_METADATA")
                .unwrap_or_else(|| "C:/forks/windows-rs/crates/libs/default".into()),
        )
        .join("Windows.Win32.winmd");
        path.is_file().then_some(path)
    }

    fn generate(args: &[&str], ext: &str) -> Option<String> {
        generate_with(nuget_win32().or_else(flat_win32), args, ext)
    }

    fn generate_with(win32: Option<std::path::PathBuf>, args: &[&str], ext: &str) -> Option<String> {
        static COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let Some(win32) = win32 else {
            eprintln!("skipped: no Windows.Win32.winmd");
            return None;
        };
        let out = std::env::temp_dir().join(format!(
            "windows-bindgen-ffi-{}-{}.{ext}",
            std::process::id(),
            COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let mut full = vec![
            "--in".to_string(),
            win32.to_string_lossy().into_owned(),
            "--out".to_string(),
            out.to_string_lossy().into_owned(),
        ];
        full.extend(args.iter().map(|s| s.to_string()));
        bindgen(full);
        let text = std::fs::read_to_string(&out).unwrap();
        std::fs::remove_file(&out).unwrap();
        if let Some(dir) = std::env::var_os("WINDOWS_BINDGEN_FFI_DUMP") {
            let name = out.file_name().unwrap();
            std::fs::write(std::path::Path::new(&dir).join(name), &text).unwrap();
        }
        Some(text)
    }

    /// Text of the object that follows `"key": ` (first occurrence after `after`).
    fn section<'t>(text: &'t str, after: &str, key: &str) -> &'t str {
        let start = text.find(after).unwrap_or_else(|| panic!("missing `{after}`"));
        let rest = &text[start..];
        let at = rest
            .find(&format!("\"{key}\": "))
            .unwrap_or_else(|| panic!("missing `{key}` after `{after}`"));
        let rest = &rest[at..];
        // Up to the matching closing brace/bracket at the same indentation.
        let mut depth = 0i32;
        for (i, c) in rest.char_indices() {
            match c {
                '{' | '[' => depth += 1,
                '}' | ']' => {
                    depth -= 1;
                    if depth == 0 {
                        return &rest[..=i];
                    }
                }
                _ => {}
            }
        }
        rest
    }

    fn compact(text: &str) -> String {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn ffi_json_layouts_and_functions() {
        let Some(json) = generate(
            &[
                "--lang",
                "json",
                "--arch",
                "x64",
                "--filter",
                "RECT",
                "POINT",
                "WNDCLASSEXW",
                "MessageBoxW",
                "MessageBoxA",
                "GetTickCount",
                "OVERLAPPED",
                "WM_CLOSE",
            ],
            "json",
        ) else {
            eprintln!("skipped: no Windows.Win32.winmd");
            return;
        };

        let rect = compact(section(&json, "\"structs\"", "RECT"));
        assert!(rect.contains("\"size\": 16"), "{rect}");
        assert!(rect.contains("\"align\": 4"), "{rect}");
        for (name, offset) in [("left", 0), ("top", 4), ("right", 8), ("bottom", 12)] {
            assert!(
                rect.contains(&format!(
                    "\"name\": \"{name}\", \"offset\": {offset}, \"type\": \"i32\", \"ffi\": \"i32\""
                )),
                "{rect}"
            );
        }
        let point = compact(section(&json, "\"structs\"", "POINT"));
        assert!(point.contains("\"size\": 8"), "{point}");

        let wnd = compact(section(&json, "\"structs\"", "WNDCLASSEXW"));
        assert!(wnd.contains("\"size\": 80"), "{wnd}");
        assert!(wnd.contains("\"align\": 8"), "{wnd}");

        // OVERLAPPED has an anonymous union (OVERLAPPED_0) of a struct and a pointer.
        let overlapped = compact(section(&json, "\"structs\"", "OVERLAPPED"));
        assert!(overlapped.contains("\"size\": 32"), "{overlapped}");
        let union = compact(section(&json, "\"structs\"", "OVERLAPPED_0"));
        assert!(union.contains("\"union\": true"), "{union}");
        assert!(union.contains("\"size\": 8"), "{union}");

        let tick = compact(section(&json, "\"kernel32.dll\"", "GetTickCount"));
        assert!(
            tick.contains("\"returns\": { \"type\": \"u32\", \"ffi\": \"u32\" }"),
            "{tick}"
        );

        let message_box = compact(section(&json, "\"user32.dll\"", "MessageBoxW"));
        let ffi: Vec<&str> = message_box
            .split("\"ffi\": \"")
            .skip(1)
            .map(|s| s.split('"').next().unwrap())
            .collect();
        assert_eq!(ffi, ["ptr", "ptr", "ptr", "u32", "i32"], "{message_box}");
        assert!(message_box.contains("\"setLastError\": true"), "{message_box}");

        assert!(compact(&json).contains("\"wideAliases\": { \"MessageBox\": \"MessageBoxW\" }"));

        let style = compact(section(&json, "\"enums\"", "MESSAGEBOX_STYLE"));
        assert!(style.contains("\"MB_OK\": 0"), "{style}");
        assert!(style.contains("\"type\": \"u32\""), "{style}");

        let close = compact(section(&json, "\"constants\"", "WM_CLOSE"));
        assert!(close.contains("\"type\": \"u32\", \"value\": 16"), "{close}");
    }

    #[test]
    fn ffi_flat_metadata() {
        // windows-rs' own flat metadata: one `Windows.Win32` namespace, no enums.
        let Some(json) = generate_with(
            flat_win32(),
            &["--lang", "json", "--arch", "x64", "--filter", "RECT", "WNDCLASSEXW", "MessageBoxW"],
            "json",
        ) else {
            return;
        };
        assert!(compact(section(&json, "\"structs\"", "RECT")).contains("\"size\": 16"));
        assert!(compact(section(&json, "\"structs\"", "WNDCLASSEXW")).contains("\"size\": 80"));
        let message_box = compact(section(&json, "\"user32.dll\"", "MessageBoxW"));
        assert!(message_box.contains("\"returns\": { \"type\": \"i32\", \"ffi\": \"i32\" }"), "{message_box}");
    }

    #[test]
    fn ffi_json_x86_layout() {
        let Some(json) = generate(
            &[
                "--lang",
                "json",
                "--arch",
                "x86",
                "--filter",
                "WNDCLASSEXW",
            ],
            "json",
        ) else {
            return;
        };
        assert!(json.contains("\"arch\": \"x86\""));
        let wnd = compact(section(&json, "\"structs\"", "WNDCLASSEXW"));
        assert!(wnd.contains("\"size\": 48"), "{wnd}");
    }

    #[test]
    fn ffi_dll_filter() {
        let Some(json) = generate(
            &[
                "--lang",
                "json",
                "--filter",
                "MessageBoxW",
                "GetTickCount",
                "--dll",
                "USER32",
            ],
            "json",
        ) else {
            return;
        };
        assert!(json.contains("\"user32.dll\""), "{json}");
        assert!(!json.contains("kernel32.dll"), "{json}");
        assert!(!json.contains("GetTickCount"), "{json}");
    }

    #[test]
    fn ffi_ts_module() {
        let Some(ts) = generate(
            &[
                "--lang",
                "ts",
                "--arch",
                "x64",
                "--filter",
                "MessageBoxW",
                "MessageBoxA",
                "GetTickCount",
                "GetTickCount64",
            ],
            "ts",
        ) else {
            return;
        };
        assert!(ts.starts_with("// Generated by `bun winmd"));
        assert!(ts.contains("import { dlopen, FFIType } from \"bun:ffi\";"));
        assert!(ts.contains("export const arch = \"x64\";"));
        let compacted = compact(&ts);
        assert!(
            compacted.contains(
                "\"MessageBoxW\": { \"args\": [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u32], \"returns\": FFIType.i32 }"
            ),
            "{ts}"
        );
        assert!(
            compacted.contains("\"GetTickCount64\": { \"args\": [], \"returns\": FFIType.u64 }"),
            "{ts}"
        );
        assert!(compacted.contains("export const enums = {"), "{ts}");
        assert!(
            ts.contains("export function open<D extends keyof typeof symbols>(dll: D)"),
            "{ts}"
        );
    }

    #[test]
    fn ffi_big_constants() {
        assert!(matches!(Node::int(1 << 53), Node::Big(_)));
        assert!(matches!(Node::int((1 << 53) - 1), Node::Num(_)));
        let mut out = String::new();
        Node::Big("18446744073709551615".into()).write(&mut out, Lang::Ts, 0);
        assert_eq!(out, "18446744073709551615n");
        out.clear();
        Node::Big("18446744073709551615".into()).write(&mut out, Lang::Json, 0);
        assert_eq!(out, "\"18446744073709551615\"");
    }

    #[test]
    fn ffi_normalize_dll() {
        assert_eq!(normalize_dll("USER32"), "user32.dll");
        assert_eq!(normalize_dll("Kernel32.DLL"), "kernel32.dll");
        assert_eq!(normalize_dll("winspool.drv"), "winspool.drv");
    }
}
