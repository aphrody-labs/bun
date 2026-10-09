use crate::shell::builtin::{Builtin, BuiltinState, IoKind, Kind};
use crate::shell::interpreter::{Interpreter, NodeId};
use crate::shell::io_writer::{ChildPtr, WriterTag};
use crate::shell::yield_::Yield;

#[derive(Default)]
pub(crate) struct Basename {
    state: State,
    buf: Vec<u8>,
}

#[derive(Default)]
enum State {
    #[default]
    Idle,
    Err,
    Done,
}

impl Basename {
    pub(crate) fn start(interp: &Interpreter, cmd: NodeId) -> Yield {
        let buf = {
            let bltn = Builtin::of(interp, cmd);
            let args: Vec<&[u8]> = (0..bltn.args_slice().len())
                .map(|i| bltn.arg_bytes(i))
                .collect();
            let Some((suffix, names)) = parse_args(&args) else {
                return Self::fail(interp, cmd, Kind::Basename.usage_string());
            };
            let mut buf = Vec::new();
            for name in names {
                buf.extend_from_slice(strip_suffix(
                    bun_paths::resolve_path::basename(name),
                    suffix,
                ));
                buf.push(b'\n');
            }
            buf
        };

        Self::state_mut(interp, cmd).state = State::Done;
        if let Some(safeguard) = Builtin::of(interp, cmd).stdout.needs_io() {
            Self::state_mut(interp, cmd).buf = buf;
            let owned = Self::state_mut(interp, cmd).buf.clone();
            let child = ChildPtr::new(cmd, WriterTag::Builtin);
            return Builtin::of_mut(interp, cmd)
                .stdout
                .enqueue(child, &owned, safeguard);
        }
        let _ = Builtin::write_no_io(interp, cmd, IoKind::Stdout, &buf);
        Builtin::done(interp, cmd, 0)
    }

    fn fail(interp: &Interpreter, cmd: NodeId, msg: &[u8]) -> Yield {
        Self::state_mut(interp, cmd).state = State::Err;
        Builtin::write_failing_error(interp, cmd, msg, 1)
    }

    pub(crate) fn on_io_writer_chunk(
        interp: &Interpreter,
        cmd: NodeId,
        _: usize,
        err: Option<bun_sys::SystemError>,
    ) -> Yield {
        if let Some(_err) = err {
            Self::state_mut(interp, cmd).state = State::Err;
            return Builtin::done(interp, cmd, 1);
        }
        match Self::state_mut(interp, cmd).state {
            State::Done => Builtin::done(interp, cmd, 0),
            State::Err => Builtin::done(interp, cmd, 1),
            State::Idle => unreachable!("Basename.onIOWriterChunk: idle"),
        }
    }
}

/// BSD/POSIX operands: `basename string [suffix]` and `basename [-a] [-s suffix] string ...`.
fn parse_args<'a>(args: &[&'a [u8]]) -> Option<(&'a [u8], Vec<&'a [u8]>)> {
    let mut all = false;
    let mut suffix: Option<&'a [u8]> = None;
    let mut i = 0;
    while let Some(&arg) = args.get(i) {
        match arg {
            b"--" => {
                i += 1;
                break;
            }
            b"-a" => all = true,
            b"-s" => {
                i += 1;
                suffix = Some(args.get(i).copied()?);
                all = true;
            }
            _ if arg.len() > 2 && arg.starts_with(b"-s") => {
                suffix = Some(&arg[2..]);
                all = true;
            }
            _ if arg.len() > 1 && arg[0] == b'-' => return None,
            _ => break,
        }
        i += 1;
    }
    match &args[i..] {
        [] => None,
        [name, sfx] if !all => Some((*sfx, vec![*name])),
        names => Some((suffix.unwrap_or(b""), names.to_vec())),
    }
}

/// POSIX: the suffix is removed only when it is not the whole name.
fn strip_suffix<'a>(name: &'a [u8], suffix: &[u8]) -> &'a [u8] {
    if !suffix.is_empty() && name.len() > suffix.len() && name.ends_with(suffix) {
        &name[..name.len() - suffix.len()]
    } else {
        name
    }
}
