use std::io::Read;

pub(crate) const USAGE: &str =
    "usage: bun vpn <daemon|status|connect|disconnect|login --stdin|login --from-env NAME>";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Command {
    Daemon,
    Status,
    Connect,
    Disconnect,
    Login,
    LoginEnv,
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
        ["login", "--from-env", name] if valid_env_name(name) => Ok(Command::LoginEnv),
        _ => Err(USAGE),
    }
}

fn valid_env_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
}

/// Reads the account from the named environment variable, never echoing its value.
pub(crate) fn account_from_env(name: &str) -> Result<String, &'static str> {
    let value = std::env::var_os(name).ok_or("VPN account environment variable is not set")?;
    read_account(value.as_encoded_bytes())
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
    fn login_from_env_takes_only_an_env_name() {
        assert_eq!(
            command(&args(&["login", "--from-env", "MULLVAD_ACCOUNT"])),
            Ok(Command::LoginEnv)
        );
        for values in [
            vec!["login", "--from-env"],
            vec!["login", "--from-env", "1234567890123456 "],
            vec!["login", "--from-env", "lower"],
            vec!["login", "--from-env", "A", "B"],
        ] {
            assert_eq!(command(&args(&values)), Err(USAGE));
        }
    }

    #[test]
    fn env_account_errors_never_echo_the_value() {
        unsafe { std::env::set_var("BUN_VPN_TEST_ACCOUNT_BAD", "12345678901234x6") };
        let error = account_from_env("BUN_VPN_TEST_ACCOUNT_BAD").unwrap_err();
        assert!(!error.contains("1234567890"));
        unsafe {
            std::env::set_var(
                "BUN_VPN_TEST_ACCOUNT_OK",
                "1234567890123456
",
            )
        };
        assert_eq!(
            account_from_env("BUN_VPN_TEST_ACCOUNT_OK").unwrap(),
            "1234567890123456"
        );
        assert!(account_from_env("BUN_VPN_TEST_ACCOUNT_UNSET").is_err());
    }

    #[test]
    fn stdin_reader_never_consumes_more_than_65_bytes() {
        let mut cursor = std::io::Cursor::new(vec![b'1'; 1024]);
        assert!(read_account(&mut cursor).is_err());
        assert_eq!(cursor.position(), 65);
    }
}
