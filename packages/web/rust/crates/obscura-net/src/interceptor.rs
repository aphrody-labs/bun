use std::collections::HashMap;

use crate::client::{RequestInfo, Response};

pub enum InterceptAction {
    Continue,
    Block,
    Fulfill(Response),
    ModifyHeaders(HashMap<String, String>),
}

#[async_trait::async_trait]
pub trait RequestInterceptor {
    async fn intercept(&self, request: &RequestInfo) -> InterceptAction;
}

/// Explicit crawl host scope, evaluated by the HTTP owner before every redirect hop.
/// Installing this on a dedicated client keeps it separate from browser authentication.
pub struct DomainAllowlistInterceptor {
    domains: Vec<String>,
}

impl DomainAllowlistInterceptor {
    pub fn new(domains: &[String]) -> Result<Self, &'static str> {
        if domains.is_empty() {
            return Err("crawl transport requires an explicit domain scope");
        }
        let domains = domains
            .iter()
            .map(|domain| domain.to_ascii_lowercase())
            .collect::<Vec<_>>();
        for domain in &domains {
            let parsed = url::Url::parse(&format!("https://{domain}/"))
                .map_err(|_| "crawl scope contains an invalid hostname")?;
            if parsed.host_str() != Some(domain.as_str())
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.port().is_some()
                || parsed.path() != "/"
                || parsed.query().is_some()
                || parsed.fragment().is_some()
            {
                return Err("crawl scope requires hostnames without ports or credentials");
            }
        }
        Ok(Self { domains })
    }

    #[must_use]
    pub fn allows(&self, url: &url::Url) -> bool {
        matches!(url.scheme(), "http" | "https")
            && url.username().is_empty()
            && url.password().is_none()
            && url.host_str().is_some_and(|host| {
                self.domains
                    .iter()
                    .any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
            })
    }
}

#[async_trait::async_trait]
impl RequestInterceptor for DomainAllowlistInterceptor {
    async fn intercept(&self, request: &RequestInfo) -> InterceptAction {
        if self.allows(&request.url) {
            InterceptAction::Continue
        } else {
            InterceptAction::Block
        }
    }
}

#[cfg(test)]
mod tests {
    use super::DomainAllowlistInterceptor;

    #[test]
    fn domain_scope_rejects_lookalikes_credentials_and_non_network_urls() {
        let policy = DomainAllowlistInterceptor::new(&["example.test".into()]).unwrap();
        for allowed in ["https://example.test/", "https://docs.example.test/"] {
            assert!(policy.allows(&url::Url::parse(allowed).unwrap()));
        }
        for denied in [
            "https://example.test.evil.test/",
            "https://user:password@example.test/",
            "file:///tmp/example.test",
        ] {
            assert!(!policy.allows(&url::Url::parse(denied).unwrap()));
        }
        assert!(DomainAllowlistInterceptor::new(&[]).is_err());
        assert!(DomainAllowlistInterceptor::new(&["example.test/path".into()]).is_err());
    }
}
