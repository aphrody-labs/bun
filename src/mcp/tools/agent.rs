//! `git_ingest` and `deps_*`: the tools of `bun_agent_tools` (src/agent_tools), whose schemas are
//! generated from its `tools.json`.

use std::sync::atomic::AtomicBool;

use serde_json::Value;

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

fn run(name: &str, ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    static NEVER: AtomicBool = AtomicBool::new(false);
    let call = bun_agent_tools::Context {
        cwd: &ctx.cwd,
        cancel: &NEVER,
    };
    match bun_agent_tools::call(&call, name, &Value::Object(args.0.clone())) {
        Ok(text) => Ok(Output::text(text)),
        Err(bun_agent_tools::ToolError::Invalid(message)) => Err(ToolError::InvalidArgs(message)),
        Err(err) => Err(ToolError::Failed(err.to_string())),
    }
}

macro_rules! tools {
    ($($schema:ident),* $(,)?) => {
        pub(crate) const TOOLS: &[Tool] = &[$(Tool {
            name: bun_agent_tools::$schema.name,
            title: bun_agent_tools::$schema.title,
            description: bun_agent_tools::$schema.description,
            input_schema: bun_agent_tools::$schema.input_schema,
            annotations: Annotations::READ_ONLY,
            call: |ctx, args| run(bun_agent_tools::$schema.name, ctx, args),
        }),*];
    };
}

tools!(GIT_INGEST, DEPS_LIST, DEPS_INFO, DEPS_TREE, DEPS_READ, DEPS_SEARCH, DEPS_DOCS);

#[cfg(test)]
mod tests {
    #[test]
    fn exposes_every_agent_tool() {
        let names: Vec<&str> = super::TOOLS.iter().map(|t| t.name).collect();
        let schemas: Vec<&str> = bun_agent_tools::SCHEMAS.iter().map(|s| s.name).collect();
        assert_eq!(names, schemas);
    }
}
