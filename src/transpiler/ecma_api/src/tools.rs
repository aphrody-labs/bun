//! Default-option adapters over Bun's internal quality owner.

use oxc_span::SourceType;

use crate::Error;

/// Formats JavaScript or TypeScript with Oxc's defaults, without project config discovery.
pub fn format(source: &str, filename: &str) -> Result<String, Error> {
    SourceType::from_path(filename).map_err(|error| Error::input(error.to_string()))?;
    bun_quality::format(source, filename, &Default::default())
}

/// Lints JavaScript or TypeScript with Oxc's default rule set, returning message strings.
pub fn lint(source: &str, filename: &str) -> Result<Vec<String>, Error> {
    SourceType::from_path(filename).map_err(|error| Error::input(error.to_string()))?;
    let report = bun_quality::lint(source, filename, &Default::default())?;
    Ok(report
        .diagnostics
        .into_iter()
        .map(|diagnostic| {
            diagnostic["message"]
                .as_str()
                .unwrap_or_default()
                .to_owned()
        })
        .collect())
}
