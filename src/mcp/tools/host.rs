//! `host_inventory` and `host_find`: the machines of the mesh and their free resources, from the
//! shared registry of `bun_host` (schemas live there).

use bun_host::tools;
use serde_json::Value;

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

fn call(f: fn(&Value) -> Result<String, String>, args: &Args<'_>) -> Result<Output, ToolError> {
    f(&Value::Object(args.0.clone())).map(Output::text).map_err(ToolError::Failed)
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: tools::INVENTORY_NAME,
        title: tools::INVENTORY_TITLE,
        description: tools::INVENTORY_DESCRIPTION,
        input_schema: tools::INVENTORY_SCHEMA,
        annotations: Annotations::READ_ONLY,
        call: |_ctx: &Context, args| call(tools::inventory, args),
    },
    Tool {
        name: tools::FIND_NAME,
        title: tools::FIND_TITLE,
        description: tools::FIND_DESCRIPTION,
        input_schema: tools::FIND_SCHEMA,
        annotations: Annotations::READ_ONLY,
        call: |_ctx: &Context, args| call(tools::find, args),
    },
];

#[cfg(test)]
mod tests {
    #[test]
    fn schemas_are_json_objects() {
        for tool in super::TOOLS {
            let schema: serde_json::Value = serde_json::from_str(tool.input_schema).unwrap();
            assert_eq!(schema["type"], "object", "{}", tool.name);
        }
    }
}
