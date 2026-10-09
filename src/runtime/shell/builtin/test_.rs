//! POSIX `test` and `[`: string, integer and file predicates, evaluated in-process so scripts do not
//! depend on a `test`/`[` binary (absent on Windows outside Git Bash, absent from an empty PATH).
//! Exit status: 0 true, 1 false, 2 usage error.

use bun_core::ZBox;
use bun_sys::S;

use crate::shell::builtin::{Builtin, Kind};
use crate::shell::interpreter::{Interpreter, NodeId, shell_lstatat, shell_statat};
use crate::shell::yield_::Yield;

pub(crate) struct Test;

type EvalResult = Result<bool, Vec<u8>>;

impl Test {
    pub(crate) fn start(interp: &Interpreter, cmd: NodeId) -> Yield {
        let bltn = Builtin::of(interp, cmd);
        let kind = bltn.kind;
        let mut args: Vec<&[u8]> = (0..bltn.args_slice().len())
            .map(|i| bltn.arg_bytes(i))
            .collect();
        if kind == Kind::Bracket {
            if args.last().copied() != Some(b"]".as_slice()) {
                return Self::fail(interp, cmd, kind, b"missing `]'");
            }
            args.pop();
        }
        let cwd = Builtin::cwd(interp, cmd);
        let eval = Eval {
            args: &args,
            pos: 0,
            cwd,
        };
        match eval.run() {
            Ok(true) => Builtin::done(interp, cmd, 0),
            Ok(false) => Builtin::done(interp, cmd, 1),
            Err(msg) => Self::fail(interp, cmd, kind, &msg),
        }
    }

    fn fail(interp: &Interpreter, cmd: NodeId, kind: Kind, msg: &[u8]) -> Yield {
        let mut buf = Vec::with_capacity(msg.len() + 8);
        buf.extend_from_slice(kind.as_str().as_bytes());
        buf.extend_from_slice(b": ");
        buf.extend_from_slice(msg);
        buf.push(b'\n');
        Builtin::write_failing_error(interp, cmd, &buf, 2)
    }

    /// Only the usage-error message goes through the async writer.
    pub(crate) fn on_io_writer_chunk(
        interp: &Interpreter,
        cmd: NodeId,
        _: usize,
        _: Option<bun_sys::SystemError>,
    ) -> Yield {
        Builtin::done(interp, cmd, 2)
    }
}

struct Eval<'a> {
    args: &'a [&'a [u8]],
    pos: usize,
    cwd: bun_sys::Fd,
}

impl<'a> Eval<'a> {
    /// POSIX fixes the meaning of zero to four operands by their count; longer
    /// expressions go through the `!` / `-a` / `-o` / parentheses grammar.
    fn run(mut self) -> EvalResult {
        let args = self.args;
        match args.len() {
            0 => Ok(false),
            1 => Ok(!args[0].is_empty()),
            2 => self.two(0),
            3 => self.three(0),
            4 if args[0] == b"!" => self.three(1).map(|v| !v),
            4 if args[0] == b"(" && args[3] == b")" => self.two(1),
            _ => {
                let v = self.or()?;
                if self.pos < args.len() {
                    return Err(b"too many arguments".to_vec());
                }
                Ok(v)
            }
        }
    }

    fn two(&self, i: usize) -> EvalResult {
        let (op, operand) = (self.args[i], self.args[i + 1]);
        if op == b"!" {
            return Ok(operand.is_empty());
        }
        self.unary(op, operand)
    }

    fn three(&self, i: usize) -> EvalResult {
        let (lhs, op, rhs) = (self.args[i], self.args[i + 1], self.args[i + 2]);
        if is_binary(op) {
            return self.binary(lhs, op, rhs);
        }
        if lhs == b"!" {
            return self.two(i + 1).map(|v| !v);
        }
        if lhs == b"(" && rhs == b")" {
            return Ok(!op.is_empty());
        }
        Err(op_error(op, "binary operator expected"))
    }

    fn at(&self, s: &[u8]) -> bool {
        self.args.get(self.pos).copied() == Some(s)
    }

    fn or(&mut self) -> EvalResult {
        let mut v = self.and()?;
        while self.at(b"-o") {
            self.pos += 1;
            let rhs = self.and()?;
            v = v || rhs;
        }
        Ok(v)
    }

    fn and(&mut self) -> EvalResult {
        let mut v = self.not()?;
        while self.at(b"-a") {
            self.pos += 1;
            let rhs = self.not()?;
            v = v && rhs;
        }
        Ok(v)
    }

    fn not(&mut self) -> EvalResult {
        if self.at(b"!") {
            self.pos += 1;
            return self.not().map(|v| !v);
        }
        self.primary()
    }

    fn primary(&mut self) -> EvalResult {
        let Some(&first) = self.args.get(self.pos) else {
            return Err(b"argument expected".to_vec());
        };
        if first == b"(" {
            self.pos += 1;
            let v = self.or()?;
            if !self.at(b")") {
                return Err(b"missing `)'".to_vec());
            }
            self.pos += 1;
            return Ok(v);
        }
        let rest = self.args.len() - self.pos;
        if rest >= 3 {
            let op = self.args[self.pos + 1];
            if is_binary(op) && !matches!(op, b"-a" | b"-o") {
                let v = self.binary(first, op, self.args[self.pos + 2])?;
                self.pos += 3;
                return Ok(v);
            }
        }
        if rest >= 2 && is_unary(first) {
            let v = self.unary(first, self.args[self.pos + 1])?;
            self.pos += 2;
            return Ok(v);
        }
        self.pos += 1;
        Ok(!first.is_empty())
    }

    fn unary(&self, op: &[u8], operand: &[u8]) -> EvalResult {
        if !is_unary(op) {
            return Err(op_error(op, "unary operator expected"));
        }
        match op {
            b"-n" => return Ok(!operand.is_empty()),
            b"-z" => return Ok(operand.is_empty()),
            b"-L" | b"-h" => {
                return Ok(self
                    .stat(operand, true)
                    .is_some_and(|st| S::ISLNK(st.st_mode as _)));
            }
            _ => {}
        }
        let Some(st) = self.stat(operand, false) else {
            return Ok(false);
        };
        let mode = st.st_mode as u32;
        Ok(match op {
            b"-e" | b"-r" => true,
            b"-f" => S::ISREG(st.st_mode as _),
            b"-d" => S::ISDIR(st.st_mode as _),
            b"-c" => S::ISCHR(st.st_mode as _),
            b"-p" => S::ISFIFO(st.st_mode as _),
            b"-S" => S::ISSOCK(st.st_mode as _),
            b"-b" => mode & S::IFMT == S::IFBLK,
            b"-s" => (st.st_size as i64) > 0,
            b"-w" => mode & 0o222 != 0,
            // Windows has no execute bit: a directory or an executable extension counts.
            b"-x" => {
                if cfg!(windows) {
                    S::ISDIR(st.st_mode as _) || has_exec_ext(operand)
                } else {
                    mode & 0o111 != 0
                }
            }
            _ => false,
        })
    }

    fn binary(&self, lhs: &[u8], op: &[u8], rhs: &[u8]) -> EvalResult {
        Ok(match op {
            b"=" | b"==" => lhs == rhs,
            b"!=" => lhs != rhs,
            b"<" => lhs < rhs,
            b">" => lhs > rhs,
            b"-a" => !lhs.is_empty() && !rhs.is_empty(),
            b"-o" => !lhs.is_empty() || !rhs.is_empty(),
            b"-eq" | b"-ne" | b"-lt" | b"-le" | b"-gt" | b"-ge" => {
                let (x, y) = (int(lhs)?, int(rhs)?);
                match op {
                    b"-eq" => x == y,
                    b"-ne" => x != y,
                    b"-lt" => x < y,
                    b"-le" => x <= y,
                    b"-gt" => x > y,
                    _ => x >= y,
                }
            }
            _ => return Err(op_error(op, "binary operator expected")),
        })
    }

    fn stat(&self, path: &[u8], nofollow: bool) -> Option<bun_sys::Stat> {
        if path.is_empty() {
            return None;
        }
        let z = ZBox::from_bytes(path);
        let res = if nofollow {
            shell_lstatat(self.cwd, z.as_zstr())
        } else {
            shell_statat(self.cwd, z.as_zstr())
        };
        res.ok()
    }
}

fn is_unary(op: &[u8]) -> bool {
    matches!(
        op,
        b"-n"
            | b"-z"
            | b"-e"
            | b"-f"
            | b"-d"
            | b"-s"
            | b"-r"
            | b"-w"
            | b"-x"
            | b"-b"
            | b"-c"
            | b"-p"
            | b"-S"
            | b"-L"
            | b"-h"
    )
}

fn is_binary(op: &[u8]) -> bool {
    matches!(
        op,
        b"=" | b"=="
            | b"!="
            | b"<"
            | b">"
            | b"-a"
            | b"-o"
            | b"-eq"
            | b"-ne"
            | b"-lt"
            | b"-le"
            | b"-gt"
            | b"-ge"
    )
}

fn int(s: &[u8]) -> Result<i64, Vec<u8>> {
    core::str::from_utf8(s.trim_ascii())
        .ok()
        .and_then(|t| t.parse::<i64>().ok())
        .ok_or_else(|| op_error(s, "integer expression expected"))
}

fn has_exec_ext(path: &[u8]) -> bool {
    const EXEC_EXTS: [&[u8]; 4] = [b".exe", b".com", b".bat", b".cmd"];
    let Some(dot) = bun_core::strings::last_index_of_char(path, b'.') else {
        return false;
    };
    let ext = &path[dot..];
    EXEC_EXTS.iter().any(|e| ext.eq_ignore_ascii_case(e))
}

fn op_error(word: &[u8], msg: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(word.len() + msg.len() + 2);
    out.extend_from_slice(word);
    out.extend_from_slice(b": ");
    out.extend_from_slice(msg.as_bytes());
    out
}
