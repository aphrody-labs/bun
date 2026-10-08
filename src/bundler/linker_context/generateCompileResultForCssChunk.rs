use crate::mal_prelude::*;
use core::sync::atomic::Ordering;

use bun_ast::ImportRecord;
use bun_collections::VecExt;
use bun_threading::thread_pool as ThreadPoolLib;

use std::sync::Arc;

use bun_core::strings;
use bun_paths::resolve_path::{self, platform};
use bun_sourcemap::{ChunkSources, InputSourceMap, LineColumnOffset, SourceMapState};

use crate::bun_css::{
    BundlerStyleSheet, ImportInfo, LocalsResultsMap, PrinterOptions, SourceMapping, Targets,
};

use crate::chunk::{Content, CssImportOrderKind};
use crate::linker_context_mod::LinkerContext;
use crate::thread_pool::Worker;
use crate::{Chunk, CompileResult, Index};

// CONCURRENCY: thread-pool callback — runs on worker threads, one task per
// `PendingPartRange`. Writes: `chunk.compile_results_for_chunk[i]` (disjoint
// by per-task `i`). Reads `c.graph.ast.css` / `c.options` shared. Never forms
// `&mut LinkerContext` — `c_ptr` stays raw; the CSS printer takes
// `&LinkerContext`. See `generate_compile_result_for_js_chunk` for the
// `PendingPartRange: Send` justification.
//
/// # Safety
///
/// `task` must be the intrusive `task` field of a live `PendingPartRange`
/// scheduled by `generate_chunks_in_parallel`; see
/// [`pending_part_range_prologue`](crate::linker_context_mod::pending_part_range_prologue)
/// for the full contract. The signature matches `ThreadPoolLib::Task::callback`
/// (`unsafe fn(*mut Task)`).
pub(crate) unsafe fn generate_compile_result_for_css_chunk(task: *mut ThreadPoolLib::Task) {
    // SAFETY: `task` is the intrusive `task` field of a `PendingPartRange`
    // scheduled by `generate_chunks_in_parallel`; see the helper's contract.
    let (part_range, c_ptr, chunk_ptr, mut worker) =
        unsafe { crate::linker_context_mod::pending_part_range_prologue(task) };

    // CONCURRENCY: the CSS impl is read-only over `c`/`chunk` (the
    // `bytesInOutput` bump goes through `&AtomicUsize`), so form `&` — never
    // `&mut` — to avoid aliased exclusive borrows across peer worker tasks.
    // The `&` borrows are scoped to the impl call so they do not overlap the
    // raw slot write that follows.
    let result = {
        // SAFETY: `c_ptr` is the live `LinkerContext` returned by
        // `pending_part_range_prologue`; see its contract.
        let c_ref: &LinkerContext = unsafe { &*c_ptr };
        // SAFETY: `chunk_ptr` is the live `Chunk` from the same prologue; this
        // `&` is scoped so it does not overlap the raw slot write below.
        let chunk_ref: &Chunk = unsafe { &*chunk_ptr };
        generate_compile_result_for_css_chunk_impl(&mut **worker, c_ref, chunk_ref, part_range.i)
    };

    // SAFETY: per-task unique `i`; see `Chunk::write_compile_result_slot`.
    // The slot write is routed through raw `addr_of_mut!` + `UnsafeCell` so it
    // never materializes `&mut Chunk` / `&mut [CompileResult]`.
    unsafe { Chunk::write_compile_result_slot(chunk_ptr, part_range.i as usize, result) };
}

fn generate_compile_result_for_css_chunk_impl(
    worker: &mut Worker,
    c: &LinkerContext,
    chunk: &Chunk,
    imports_in_chunk_index: u32,
) -> CompileResult {
    let _trace = bun_core::perf::trace("Bundler.generateCodeForFileInChunkCss");
    // `defer trace.end()` — RAII; Drop ends the trace.

    // `worker.arena` (= `BackRef` to `worker.heap`) is a disjoint field from
    // `worker.temporary_arena` borrowed `&mut` below, so a direct shared
    // borrow via `BackRef::get` is fine. The heap is pinned for the worker's
    // lifetime; see `Worker::arena`.
    let arena = worker.arena.get();
    let _arena_reset = scopeguard::guard(&mut worker.temporary_arena, |arena| {
        // temporary_arena is initialized in Worker::create before any task runs.
        if let Some(a) = arena.as_mut() {
            a.reset();
        }
    });
    let mut allocating_writer: Vec<u8> = Vec::new();

    let Content::Css(css_content) = &chunk.content else {
        unreachable!("generateCompileResultForCssChunk called on non-CSS chunk");
    };
    let css_import = css_content
        .imports_in_chunk_in_order
        .at(imports_in_chunk_index as usize);
    let css: &BundlerStyleSheet = &css_content.asts[imports_in_chunk_index as usize];
    // const symbols: []const Symbol.List = c.graph.ast.items(.symbols);
    // SAFETY: `to_css_with_writer` takes `&bun_ast::symbol::Map`, but
    // `c.graph.symbols` is `bun_ast::symbol::Map`. Both are
    // `{ symbols_for_source: NestedList }` (`UnsafeCell<T>` is `repr(transparent)`),
    // so layouts match — bridge by pointer cast.
    let symbols: &bun_ast::symbol::Map =
        unsafe { &*(&raw const c.graph.symbols).cast::<bun_ast::symbol::Map>() };
    // `LocalsResultsMap` is the same `ArrayHashMap<Ref, Box<[u8]>>` alias as
    // `bun_js_printer::MangledProps`; no cast needed.
    let local_names: &LocalsResultsMap = &c.mangled_props;
    let parse_graph = c.parse_graph();
    // SAFETY: read-only fan-out of `&[Box<[u8]>]` as `&[&[u8]]`; relies on
    // fat-pointer field-order equivalence (see `boxed_slices_as_borrowed`).
    let unique_keys: &[&[u8]] = unsafe {
        bun_ptr::boxed_slices_as_borrowed(
            parse_graph
                .input_files
                .items_unique_key_for_additional_file(),
        )
    };

    match &css_import.kind {
        CssImportOrderKind::Layers(_) => {
            let printer_options = PrinterOptions {
                // TODO: make this more configurable
                minify: c.options.minify_whitespace,
                targets: Targets::for_bundler_target(c.options.target),
                ..Default::default()
            };
            match css.to_css_with_writer(
                arena,
                &mut allocating_writer,
                &printer_options,
                Some(ImportInfo {
                    import_records: &css_import.condition_import_records,
                    ast_urls_for_css: parse_graph.ast.items_url_for_css(),
                    ast_unique_key_for_additional_file: unique_keys,
                }),
                Some(local_names),
                // layer does not need symbols i think
                symbols,
            ) {
                Ok(_) => {}
                Err(_) => {
                    return CompileResult::Css {
                        result: Err(crate::Error::PrintError),
                        source_index: Index::INVALID.get(),
                        source_map: None,
                    };
                }
            }
            CompileResult::Css {
                result: Ok(allocating_writer.into_boxed_slice()),
                source_index: Index::INVALID.get(),
                source_map: None,
            }
        }
        CssImportOrderKind::ExternalPath(_) => {
            // SAFETY: borrows `condition_import_records` storage for the duration of the
            // `to_css_with_writer` call below; the borrowed Vec is dropped (no-op)
            // before `css_import` goes out of scope, so no double-free / dangling.
            let import_records = unsafe {
                Vec::<ImportRecord>::from_borrowed_slice_dangerous(
                    css_import.condition_import_records.slice_const(),
                )
            };
            let printer_options = PrinterOptions {
                // TODO: make this more configurable
                minify: c.options.minify_whitespace,
                targets: Targets::for_bundler_target(c.options.target),
                ..Default::default()
            };
            match css.to_css_with_writer(
                arena,
                &mut allocating_writer,
                &printer_options,
                Some(ImportInfo {
                    import_records: &import_records,
                    ast_urls_for_css: parse_graph.ast.items_url_for_css(),
                    ast_unique_key_for_additional_file: unique_keys,
                }),
                Some(local_names),
                // external_path does not need symbols i think
                symbols,
            ) {
                Ok(_) => {}
                Err(_) => {
                    return CompileResult::Css {
                        result: Err(crate::Error::PrintError),
                        source_index: Index::INVALID.get(),
                        source_map: None,
                    };
                }
            }
            CompileResult::Css {
                result: Ok(allocating_writer.into_boxed_slice()),
                source_index: Index::INVALID.get(),
                source_map: None,
            }
        }
        CssImportOrderKind::SourceIndex(idx) => {
            let printer_options = PrinterOptions {
                targets: Targets::for_bundler_target(c.options.target),
                // TODO: make this more configurable
                minify: c.options.minify_whitespace
                    || c.options.minify_syntax
                    || c.options.minify_identifiers,
                ..Default::default()
            };
            let wants_source_map = c.options.source_maps != crate::options::SourceMapOption::None;
            let mut source_mappings: Vec<SourceMapping> = Vec::new();
            match css.to_css_with_writer_and_source_map(
                arena,
                &mut allocating_writer,
                &printer_options,
                Some(ImportInfo {
                    import_records: &c.graph.ast.items_import_records()[idx.get() as usize],
                    ast_urls_for_css: parse_graph.ast.items_url_for_css(),
                    ast_unique_key_for_additional_file: unique_keys,
                }),
                Some(local_names),
                symbols,
                wants_source_map.then_some(&mut source_mappings),
            ) {
                Ok(_) => {}
                Err(_) => {
                    return CompileResult::Css {
                        result: Err(crate::Error::PrintError),
                        source_index: idx.get(),
                        source_map: None,
                    };
                }
            }
            let output = allocating_writer.into_boxed_slice();
            // Update bytesInOutput for this source in the chunk (for metafile)
            // Use atomic operation since multiple threads may update the same counter
            if !output.is_empty() {
                // CONCURRENCY: key set is frozen before parallel codegen; take a
                // shared `&AtomicUsize` so concurrent workers updating the same
                // source counter never alias a `&mut`.
                if let Some(bytes) = chunk.files_with_parts_in_chunk.get(&idx.get()) {
                    let _ = bytes.fetch_add(output.len(), Ordering::Relaxed);
                }
            }
            let source_map = if wants_source_map {
                let mut end = LineColumnOffset::default();
                end.advance(&output);
                let source = &parse_graph.input_files.items_source()[idx.get() as usize];
                let to_state = |m: &SourceMapping, (source_index, line, column)| SourceMapState {
                    generated_line: m.generated_line as i32,
                    generated_column: m.generated_column as i32,
                    source_index,
                    original_line: line,
                    original_column: column,
                };
                match css_input_source_map(source) {
                    // A plugin (or a CSS tool before the build) generated this
                    // file: map through its source map to the original sources.
                    Some(input) => bun_sourcemap::Chunk::from_line_column_mappings(
                        source_mappings.iter().filter_map(|m| {
                            let found =
                                input.find(m.original_line as i32, m.original_column as i32)?;
                            Some(to_state(m, found))
                        }),
                        end.lines.zero_based(),
                        end.columns.zero_based(),
                    )
                    .map(|mut chunk| {
                        let dir = bun_paths::dirname(source.path.text).unwrap_or(b"");
                        let paths = input
                            .sources
                            .iter()
                            .map(|path| resolve_input_source(dir, path))
                            .collect();
                        chunk.sources = Some(Arc::new(ChunkSources {
                            paths,
                            contents: input.sources_content,
                        }));
                        chunk
                    }),
                    None => bun_sourcemap::Chunk::from_line_column_mappings(
                        source_mappings.iter().map(|m| {
                            to_state(m, (0, m.original_line as i32, m.original_column as i32))
                        }),
                        end.lines.zero_based(),
                        end.columns.zero_based(),
                    ),
                }
            } else {
                None
            };
            CompileResult::Css {
                result: Ok(output),
                source_index: idx.get(),
                source_map,
            }
        }
    }
}

/// The source map a stylesheet links with its `sourceMappingURL` comment: a
/// `data:` URL, or a file relative to the stylesheet.
fn css_input_source_map(source: &bun_ast::Source) -> Option<InputSourceMap> {
    const DIRECTIVE: &[u8] = b"sourceMappingURL=";
    let contents = source.contents();
    let start = strings::last_index_of(contents, DIRECTIVE)?;
    let before = &contents[..start];
    if !(before.ends_with(b"/*# ") || before.ends_with(b"/*@ ")) {
        return None;
    }
    let rest = &contents[start + DIRECTIVE.len()..];
    let url = rest[..strings::index_of(rest, b"*/")?].trim_ascii();
    let json: Vec<u8> = if let Some(data) = url.strip_prefix(b"data:") {
        let comma = strings::index_of_char(data, b',')? as usize;
        let (header, payload) = (&data[..comma], &data[comma + 1..]);
        if header.ends_with(b";base64") {
            bun_base64::decode_alloc(payload).ok()?
        } else {
            percent_decode(payload)
        }
    } else {
        if !source.path.is_file() || url.is_empty() {
            return None;
        }
        let dir = bun_paths::dirname(source.path.text)?;
        let path = resolve_path::join_abs_string::<platform::Auto>(dir, &[url]).to_vec();
        bun_sys::File::read_from(bun_sys::Fd::cwd(), &path).ok()?
    };
    InputSourceMap::parse(&json).ok()
}

fn percent_decode(input: &[u8]) -> Vec<u8> {
    let hex = |b: u8| (b as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'%' && i + 2 < input.len() {
            if let (Some(hi), Some(lo)) = (hex(input[i + 1]), hex(input[i + 2])) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        out.push(input[i]);
        i += 1;
    }
    out
}

/// An input source map entry as an absolute path when it names a file.
fn resolve_input_source(dir: &[u8], path: &[u8]) -> Box<[u8]> {
    let path = path.strip_prefix(b"file://").unwrap_or(path);
    if dir.is_empty()
        || path.is_empty()
        || bun_paths::is_absolute_posix(path)
        || bun_paths::is_absolute_windows(path)
        || strings::index_of(path, b"://").is_some()
    {
        return Box::from(path);
    }
    Box::from(resolve_path::join_abs_string::<platform::Auto>(
        dir,
        &[path],
    ))
}
