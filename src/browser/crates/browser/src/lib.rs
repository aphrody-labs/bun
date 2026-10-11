pub mod context;
mod fork_virtual_url;
mod idle_deadline;
pub mod lifecycle;
pub mod page;
#[cfg(feature = "render")]
pub mod pdf;
pub mod profiles;

pub use context::BrowserContext;
pub use lifecycle::{LifecycleState, WaitUntil};
// Re-exported so the embeddable `bun_browser` crate (which depends on bun_browser_browser,
// not bun_browser_js) can surface the interception channel types.
pub use bun_browser_js::HTML_TO_MARKDOWN_JS;
pub use bun_browser_js::ops::{InterceptResolution, InterceptedRequest};
#[cfg(feature = "render")]
pub use bun_browser_js::{
    AnimationSample, AnimationSampleMode, AnimationSampleTime, CaptureError, CaptureRegion,
    validate_capture_region,
};
pub use page::{url_matches_cdp_pattern, NetworkEvent, Page, PageError};
#[cfg(feature = "render")]
pub use pdf::{RasterPdfError, RasterPdfOptions, RasterPdfPageRange};
