//! Agent profile: which client launched the server, and the response budget that suits it.

use crate::util::env;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Agent {
    Claude,
    Codex,
    Agy,
    Generic,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Profile {
    pub(crate) agent: Agent,
    /// Token budget of one response; `--max-tokens` / `BUN_MCP_MAX_TOKENS` override it.
    pub(crate) max_tokens: usize,
    pinned_budget: bool,
}

impl Agent {
    fn parse(name: &str) -> Option<Self> {
        let name = name.to_ascii_lowercase();
        if name.contains("claude") {
            Some(Self::Claude)
        } else if name.contains("codex") {
            Some(Self::Codex)
        } else if name.contains("agy") || name.contains("antigravity") || name.contains("gemini") {
            Some(Self::Agy)
        } else if name == "generic" {
            Some(Self::Generic)
        } else {
            None
        }
    }

    /// Claude Code warns above 10k tokens per tool result; Codex and Gemini clients truncate
    /// near the same size. Staying below keeps a result whole in the agent's context.
    fn default_tokens(self) -> usize {
        match self {
            Self::Claude | Self::Agy => 8000,
            Self::Codex | Self::Generic => 6000,
        }
    }

    fn from_env() -> Self {
        if env("CLAUDECODE").is_some() || env("CLAUDE_CODE_ENTRYPOINT").is_some() {
            Self::Claude
        } else if [
            "CODEX_HOME",
            "CODEX_SANDBOX",
            "CODEX_THREAD_ID",
            "CODEX_MANAGED_BY_NPM",
            "CODEX_CI",
        ]
        .iter()
        .any(|k| env(k).is_some())
        {
            Self::Codex
        } else if ["GEMINI_CLI", "ANTIGRAVITY_CLI", "AGY", "ANTIGRAVITY"]
            .iter()
            .any(|k| env(k).is_some())
        {
            Self::Agy
        } else {
            Self::Generic
        }
    }
}

impl Profile {
    pub(crate) fn detect(forced: Option<&str>, max_tokens: Option<usize>) -> Self {
        let agent = forced
            .and_then(Agent::parse)
            .or_else(|| env("BUN_MCP_PROFILE").as_deref().and_then(Agent::parse))
            .unwrap_or_else(Agent::from_env);
        let pinned = max_tokens.or_else(|| env("BUN_MCP_MAX_TOKENS").and_then(|v| v.parse().ok()));
        Self {
            agent,
            max_tokens: pinned
                .unwrap_or_else(|| agent.default_tokens())
                .clamp(256, 50_000),
            pinned_budget: pinned.is_some(),
        }
    }

    /// Refines the profile from `initialize`'s `clientInfo.name` when the environment was silent.
    pub(crate) fn refine(&mut self, client_name: &str) {
        if self.agent != Agent::Generic {
            return;
        }
        if let Some(agent) = Agent::parse(client_name) {
            self.agent = agent;
            if !self.pinned_budget {
                self.max_tokens = agent.default_tokens();
            }
        }
    }

    pub(crate) fn name(&self) -> &'static str {
        match self.agent {
            Agent::Claude => "claude",
            Agent::Codex => "codex",
            Agent::Agy => "agy",
            Agent::Generic => "generic",
        }
    }
}
