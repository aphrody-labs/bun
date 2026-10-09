---
name: bun-runtime-shell
description: "Bun Shell ($ template) — JS wrapper builtins/shell.ts, bun_shell_parser lexer/parser/AST, runtime interpreter (NodeId arena state machine, builtins), plus process spawning (Bun.spawn, bun_spawn/bun_spawn_sys, Subprocess, Terminal PTY)"
metadata:
 type: reference
---

# Bun Shell and process spawning

## JS entry: `Bun.$`
- `$` row in bunObjectTable -> `constructBunShell` (`src/jsc/bindings/BunObject.cpp` ~351): creates private fns `createParsedShellScript`
 (`BunObject_callback_createParsedShellScript`) and `createShellInterpreter` (`BunObject_callback_createShellInterpreter`), then calls
 builtin `shellCreateBunShellTemplateFunctionCodeGenerator`.
- `src/js/builtins/shell.ts` `createBunShellTemplateFunction(createShellInterpreter_, createParsedShellScript_)`: classes `ShellError`
 (exitCode/stdout/stderr, `.text/.json/.blob`), `ShellOutput`, `ShellPromise extends Promise<ShellOutput>` (`.quiet`, `.nothrow`
 `.throws`, `.cwd`, `.env`, `.text`, `.json`, `.lines` async generator, `.arrayBuffer`, `.blob`), `ShellPrototype`
 (per-instance `$.cwd`/`$.env`/`$.nothrow`/`$.throws`, `new $.Shell`), `defaultEnv = process.env`. Set in C++ `constructBunShell`
 (BunObject.cpp ~379): `$.escape` -> `BunObject_callback_shellEscape` (`BunObject.rs::shell_escape`), `$.braces` ->
 `Generated::BunObject::jsBraces` (bindgen).
- Rust glue: `src/runtime/api/BunObject.rs` `static_adapters::parsed_shell_script_create` ->
 `crate::shell::parsed_shell_script::CREATE_PARSED_SHELL_SCRIPT`; `shell_interpreter_create` ->
 `crate::shell::interpreter::create_shell_interpreter`.
- Classes: `api/ParsedShellScript.classes.ts` (ParsedShellScript; impl `runtime/shell/ParsedShellScript.rs`), `api/Shell.classes.ts`
 (ShellInterpreter).
- Other entry points: `bun exec "<script>"` (`cli/exec_command.rs`), running `.sh` files / package.json scripts with the bun shell
 (`cli/run_command.rs`), `.bun.sh` loader `bunsh` (Loader enum). Test hooks in `src/js/internal-for-testing.ts`:
 `$newRustFunction("shell.rs", "TestingAPIs.shellLex"|"TestingAPIs.shellParse"|"TestingAPIs.disabledOnThisPlatform", n)` (identifier
 `shell.rs` registered as `runtime/shell/shell.rs` in generate-js2native.ts but the impl lives in `runtime/shell/shell_body.rs` `mod
 testing_apis` (`shell_lex`, `disabled_on_this_platform`) — there is no `shell.rs` file).

## Parser crate `bun_shell_parser` (src/shell_parser/)
- `parse.rs` (~4300 lines): `pub mod ast` (`Script`, `Expr`, `Pipeline`, `Cmd`, `Atom`, assignments, redirects, if/cond-expr, subshells)
 `Parser<'bump>` (bump arena), `Lexer<'bump, const ENCODING: StringEncoding>` (ascii / wtf8 / utf16 sources `SrcAscii`/`SrcUnicode`
 `ShellCharIter`), `Token`/`TokenTag`, `LexResult`, `LexError`, `ParseError`, `SubshellKind`, `IfClauseTok`, `SmolList`. JS values
 interpolated into the template are passed as `JSValueRaw` placeholders (no string injection).
- `braces.rs`: brace expansion (`{a,b}`, `$.braces`) with its own `ast::Atom`. `json_fmt.rs`, `error.rs`.

## Interpreter (src/runtime/shell/)
- `mod.rs` doc: lexer/parser/AST + tree-walking **state-machine** interpreter using a NodeId arena: `Interpreter` owns `nodes: Vec<Node>`;
 each state stores `parent: NodeId(u32)`; completion via `interp.child_done(parent_id, child_id, exit)`; no self-referential `&mut` graphs.
- `interpreter.rs` (~3100 lines): `Interpreter`, `NodeId`, `Node`, `StateKind`, `InterpreterFlags`, `CleanupState`, `ShellExecEnv` (cwd/env
 per subshell; `ShellExecEnvKind`, `Bufio`), `ShellArgs`, `CowFd`, `OutputTask<P: OutputTaskVTable>`, `ShellTask` (work-pool tasks)
 `create_shell_interpreter`.
- `states/`: Script, Stmt, Binary (`&&`/`||`), Pipeline, Cmd, Assigns, Expansion (variables, command substitution, globbing), Subshell, If
 CondExpr (`[[ ]]`), Async (`&`), Base.
- `Builtin.rs` + `builtin/`: basename, cat, cd, cp, dirname, echo, exit, export, false, ls, mkdir, mv, pwd, rm, seq, touch, true, which, yes
 (cross-platform, no coreutils needed). Builtin IO kinds Stdout/Stderr/Ignore etc.
- IO: `IO.rs`, `IOReader.rs`, `IOWriter.rs` (shared async writers), `Yield.rs` (trampolining), `subproc.rs` (`ShellIO`, `CmdHandle` ->
 external commands via spawn), `EnvMap.rs`, `EnvStr.rs`, `RefCountedStr.rs`, `dispatch_tasks.rs`, `shell_body.rs`, `util.rs`.
- Tests: `test/js/bun/shell/` (bunshell*.test.ts, brace.test.ts...).

## Process spawning
- `Bun.spawn` / `Bun.spawnSync` -> `BunObject_callback_spawn[Sync]` -> `src/runtime/api/bun/subprocess.rs` ("Subprocess object returned by
 Bun.spawn; also Bun.spawnSync") + `js_bun_spawn_bindings.rs` (option parsing: cmd/argv0, cwd, env, stdio/stdin/stdout/stderr, ipc +
 serialization, onExit, timeout + killSignal, maxBuffer, signal (AbortSignal), detached, windowsHide, terminal). Class `Subprocess` &
 `ResourceUsage` in `api/BunObject.classes.ts`.
- `api/bun/spawn/stdio.rs` `enum Stdio { Inherit, Capture, Ignore, Fd, Dup2, Path, Blob, Memfd (linux), Pipe... }`; `subprocess/{Readable
 Writable, SubprocessPipeReader, ResourceUsage}.rs`. stdin writer uses FileSink; stdout ReadableStream via native sources.
- Crate `bun_spawn` (`src/spawn/`): owns `Process` (`process.rs`, refcounted `ProcessHandle`), `Status`/`Exited`, `PollerPosix` (Linux:
 pidfd watched via EPOLLIN, then `wait4(WNOHANG)`; macOS kqueue), `PollerWindows` (libuv `uv_process_t`), `WaiterThread` fallback
 `WindowsSpawnOptions/Result`, `sync::spawn`, `ctrl_c.rs`, `static_pipe_writer.rs`. Extracted so `bun_install`/`bun_jsc`/`bun_patch` can
 spawn without depending on `bun_runtime`.
- Crate `bun_spawn_sys` (`src/spawn_sys/`): raw OS layer, no event loop — `posix_spawn.rs` (libc posix_spawn wrappers, `posix_spawn_bun`
 repr(C) request), `spawn_process.rs` (`spawn_process_posix`, `PosixSpawnOptions`, `Dup2`, `PosixSpawnResult`, Windows `uv_getrusage`).
- Rust code wanting a quick child process for CLI: `bun_core::util::spawn_sync_inherit`; full control: `bun_spawn_sys` (per src/CLAUDE.md
 instead of `std::process::Command`).
- `Bun.Terminal` (`api/bun/Terminal.rs`, class `Terminal.classes.ts`): PTY master/slave pair; usable as `terminal` option of spawn.
- node:child_process is JS on top of Bun.spawn (`bun-runtime-node-compat`); IPC in `runtime/ipc.rs` / `ipc_host.rs`.
- Tests: `test/js/bun/spawn/`, `test/js/node/child_process/`.

Related: `bun-runtime-bun-apis`, `bun-runtime-cli-commands`.
