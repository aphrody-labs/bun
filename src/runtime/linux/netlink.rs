//! netlink: request/response exchanges with kernel subsystems (rtnetlink,
//! generic netlink, sock_diag, audit, ...), `AF_NETLINK` sockets.
//!
//! The JS layer encodes and decodes messages (`netlink` in `linux.ts`); this
//! file sends one request and collects every reply datagram until the dump
//! ends, the kernel acknowledges, or a non-multipart answer arrives.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const NLMSG_HDRLEN: usize = 16;
#[cfg(target_os = "linux")]
const NLMSG_ERROR: u16 = 2;
#[cfg(target_os = "linux")]
const NLMSG_DONE: u16 = 3;
#[cfg(target_os = "linux")]
const NLM_F_MULTI: u16 = 2;
/// Upper bound on one exchange, so a runaway dump cannot exhaust memory.
#[cfg(target_os = "linux")]
const MAX_REPLY: usize = 64 << 20;

#[cfg(target_os = "linux")]
struct Socket(libc::c_int);

#[cfg(target_os = "linux")]
impl Drop for Socket {
    fn drop(&mut self) {
        // SAFETY: the socket is owned and closed once.
        unsafe { libc::close(self.0) };
    }
}

#[cfg(target_os = "linux")]
fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_ne_bytes([bytes[offset], bytes[offset + 1]])
}

#[cfg(target_os = "linux")]
fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_ne_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

/// What the replies so far say about the exchange.
#[cfg(target_os = "linux")]
enum Progress {
    More,
    Done,
    Failed(i32),
}

/// Walk the messages of one datagram.
#[cfg(target_os = "linux")]
fn scan(datagram: &[u8]) -> Progress {
    let mut offset = 0;
    let mut multipart = false;
    while offset + NLMSG_HDRLEN <= datagram.len() {
        let len = read_u32(datagram, offset) as usize;
        if len < NLMSG_HDRLEN || offset + len > datagram.len() {
            return Progress::Done;
        }
        let kind = read_u16(datagram, offset + 4);
        let flags = read_u16(datagram, offset + 6);
        if kind == NLMSG_DONE {
            return Progress::Done;
        }
        if kind == NLMSG_ERROR {
            if len < NLMSG_HDRLEN + 4 {
                return Progress::Done;
            }
            let code = read_u32(datagram, offset + NLMSG_HDRLEN) as i32;
            return if code == 0 {
                Progress::Done
            } else {
                Progress::Failed(-code)
            };
        }
        multipart |= flags & NLM_F_MULTI != 0;
        offset += (len + 3) & !3;
    }
    if multipart {
        Progress::More
    } else {
        Progress::Done
    }
}

/// `netlinkRequest(protocol, message)` sends `message` (one or more complete
/// `nlmsghdr` messages) to the kernel and returns every reply datagram,
/// concatenated, as a `Uint8Array`. A negative `NLMSG_ERROR` throws with its errno.
#[bun_jsc::host_fn]
pub(crate) fn js_netlink_request(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let protocol = super::int_arg(frame, 0) as libc::c_int;
        let Some(message) = frame.argument(1).as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "message must be an ArrayBufferView of netlink messages"
            )));
        };
        let message = message.slice();
        if message.len() < NLMSG_HDRLEN {
            return Err(global.throw_invalid_arguments(format_args!(
                "message must hold at least one {NLMSG_HDRLEN}-byte nlmsghdr"
            )));
        }

        // SAFETY: plain integer arguments.
        let raw = unsafe {
            libc::socket(
                libc::AF_NETLINK,
                libc::SOCK_RAW | libc::SOCK_CLOEXEC,
                protocol,
            )
        };
        let socket =
            Socket(super::check(global, raw as libc::c_long, "socket", None)? as libc::c_int);

        // SAFETY: all-zero is a valid `sockaddr_nl`; the kernel is port 0.
        let mut kernel: libc::sockaddr_nl = unsafe { core::mem::zeroed() };
        kernel.nl_family = libc::AF_NETLINK as libc::sa_family_t;
        let addr_len = core::mem::size_of::<libc::sockaddr_nl>() as libc::socklen_t;

        // SAFETY: `message` is valid for its length and `kernel` is a `sockaddr_nl`.
        let sent = unsafe {
            libc::sendto(
                socket.0,
                message.as_ptr().cast(),
                message.len(),
                0,
                core::ptr::addr_of!(kernel).cast(),
                addr_len,
            )
        };
        super::check(global, sent as libc::c_long, "sendto", None)?;

        let mut replies = Vec::new();
        let mut buf = vec![0u8; 32 << 10];
        loop {
            // SAFETY: `buf` is valid for `buf.len()` bytes; `socket` is open.
            let n = unsafe { libc::recv(socket.0, buf.as_mut_ptr().cast(), buf.len(), 0) };
            if n < 0 {
                let errno = bun_sys::last_errno();
                if errno == libc::EINTR {
                    continue;
                }
                return Err(super::errno_error(global, errno, "recv", None));
            }
            let datagram = &buf[..n as usize];
            let progress = scan(datagram);
            if let Progress::Failed(errno) = progress {
                return Err(super::errno_error(global, errno, "netlink", None));
            }
            if replies.len() + datagram.len() > MAX_REPLY {
                return Err(super::errno_error(global, libc::E2BIG, "netlink", None));
            }
            replies.extend_from_slice(datagram);
            if n == 0 || matches!(progress, Progress::Done) {
                break;
            }
        }
        bun_jsc::ArrayBuffer::create_uint8_array(global, &replies)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
