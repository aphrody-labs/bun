use std::io::Read;

pub(crate) const USAGE: &str = "usage: bun vpn <daemon|status|connect|disconnect|login --stdin>";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Command {
    Daemon,
    Status,
    Connect,
    Disconnect,
    Login,
}

pub(crate) fn command(args: &[String]) -> Result<Command, &'static str> {
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["daemon"] => Ok(Command::Daemon),
        ["status"] => Ok(Command::Status),
        ["connect"] => Ok(Command::Connect),
        ["disconnect"] => Ok(Command::Disconnect),
        ["login", "--stdin"] => Ok(Command::Login),
        _ => Err(USAGE),
    }
}

/// An account is a bounded stdin payload, never a command argument or diagnostic.
pub(crate) fn read_account(input: impl Read) -> Result<String, &'static str> {
    let mut bytes = Vec::with_capacity(65);
    input
        .take(65)
        .read_to_end(&mut bytes)
        .map_err(|_| "unable to read VPN account from stdin")?;
    let account = bytes.trim_ascii();
    if bytes.len() > 64 || account.len() != 16 || !account.iter().all(u8::is_ascii_digit) {
        return Err("VPN account stdin must contain exactly sixteen ASCII digits");
    }
    // ASCII validation above makes the conversion infallible.
    Ok(String::from_utf8_lossy(account).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn login_accepts_only_explicit_stdin_transport() {
        assert_eq!(command(&args(&["login", "--stdin"])), Ok(Command::Login));
        for values in [
            vec!["login"],
            vec!["login", "1234567890123456"],
            vec!["login", "--stdin", "1234567890123456"],
            vec!["status", "--stdin"],
            vec![],
        ] {
            assert_eq!(command(&args(&values)), Err(USAGE));
        }
        assert!(!USAGE.contains("1234567890123456"));
    }

    #[test]
    fn stdin_account_accepts_newline_and_rejects_extra_payloads_without_echo() {
        assert_eq!(
            read_account(&b"1234567890123456\n"[..]).unwrap(),
            "1234567890123456"
        );
        for invalid in [
            &b""[..],
            &b"123456789012345"[..],
            &b"12345678901234567"[..],
            &b"1234567890123456\n9999999999999999"[..],
            &b"123456789012345x"[..],
            &b"123456789012345\xff"[..],
        ] {
            let error = read_account(invalid).unwrap_err();
            assert!(!error.contains("123456789012345"));
        }
    }

    #[test]
    fn stdin_reader_never_consumes_more_than_65_bytes() {
        let mut cursor = std::io::Cursor::new(vec![b'1'; 1024]);
        assert!(read_account(&mut cursor).is_err());
        assert_eq!(cursor.position(), 65);
    }
}
