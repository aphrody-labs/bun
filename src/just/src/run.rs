use super::*;

/// Main entry point into `just`. Parse arguments from `args` and run.
#[allow(clippy::missing_errors_doc)]
pub fn run(args: impl Iterator<Item = impl Into<OsString> + Clone>) -> Result<(), i32> {
  run_with_bun(args, None)
}

/// Run the embedded command with an instance-local Bun host and return its exit status.
pub fn run_from<I, T>(args: I, bun_executable: std::path::PathBuf) -> i32
where
  I: IntoIterator<Item = T>,
  T: Into<OsString> + Clone,
{
  let executable = match Utf8PathBuf::from_path_buf(bun_executable) {
    Ok(path) => path,
    Err(path) => {
      eprintln!("just: Bun executable path is not UTF-8: {}", path.display());
      return EXIT_FAILURE;
    }
  };
  match run_with_bun(args.into_iter(), Some(executable)) {
    Ok(()) => 0,
    Err(code) => code,
  }
}

fn run_with_bun(
  args: impl Iterator<Item = impl Into<OsString> + Clone>,
  executable: Option<Utf8PathBuf>,
) -> Result<(), i32> {
  #[cfg(windows)]
  nu_ansi_term::enable_ansi_support().ok();

  let arguments = Arguments::try_parse_from(args).map_err(|err| {
    err.print().ok();
    err.exit_code()
  })?;

  if arguments.bun_shell && executable.is_none() {
    eprintln!("error: --bun-shell requires the embedded runner: bun just --bun-shell");
    return Err(2);
  }

  let config = Config::from_arguments(arguments)
    .map(|mut config| {
      config.embedded_bun = executable;
      config
    })
    .map_err(Error::from);

  let (color, verbosity) = config
    .as_ref()
    .map(|config| (config.color, config.verbosity))
    .unwrap_or_default();

  let loader = Loader::new();

  config
    .and_then(|config| {
      SignalHandler::install(config.verbosity)?;
      config.subcommand.execute(&config, &loader)
    })
    .map_err(|error| {
      if !verbosity.quiet() && error.print_message() {
        eprintln!("{}", error.color_display(color.stderr()));
      }
      error.code().unwrap_or(EXIT_FAILURE)
    })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn standalone_rejects_bun_shell_without_a_bun_host() {
    assert_eq!(run(["just", "--bun-shell"].into_iter()), Err(2));
  }

  #[test]
  fn run_can_be_called_more_than_once() {
    let tmp = testing::tempdir();
    fs::write(tmp.path().join("justfile"), "foo:").unwrap();
    let search_directory = format!("{}/", tmp.path().to_str().unwrap());
    run(["just", &search_directory].iter()).unwrap();
    run(["just", &search_directory].iter()).unwrap();
  }

  #[test]
  fn embedded_help_version_and_usage_errors_return_without_exiting() {
    let executable = || std::path::PathBuf::from("bun.exe");
    assert_eq!(run_from(["bun just", "--version"], executable()), 0);
    assert_eq!(
      run_from(["bun just", "--not-a-just-option"], executable()),
      2
    );
    assert_eq!(run_from(["bun just", "--help"], executable()), 0);
  }
}
