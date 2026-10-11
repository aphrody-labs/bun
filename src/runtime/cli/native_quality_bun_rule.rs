use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

const RULE: &str = "bun/no-duplicate-conditional-property-access";

pub(crate) fn suppressed(source: &str, comments: &Value, diagnostic: &Value) -> bool {
    let at = diagnostic["labels"][0]["start"].as_u64().unwrap_or(0) as usize;
    let line = |at: usize| {
        source
            .encode_utf16()
            .take(at)
            .filter(|unit| *unit == 10)
            .count()
    };
    let target_line = line(at);
    let mut disabled = false;
    for comment in comments.as_array().into_iter().flatten() {
        let text = comment["value"].as_str().unwrap_or("").trim();
        let end = comment["end"].as_u64().unwrap_or(0) as usize;
        for (command, mode) in [
            ("oxlint-disable-next-line", 0),
            ("oxlint-disable-line", 1),
            ("oxlint-disable", 2),
            ("oxlint-enable", 3),
        ] {
            let Some(rest) = text.strip_prefix(command) else {
                continue;
            };
            if rest
                .chars()
                .next()
                .is_some_and(|character| !character.is_whitespace())
            {
                continue;
            }
            let names = bun_core::strings::index_of(rest.as_bytes(), b" -- ")
                .map_or(rest, |index| &rest[..index])
                .trim();
            if !names.is_empty()
                && !names
                    .split_whitespace()
                    .flat_map(|part| bun_core::strings::split(part.as_bytes(), b","))
                    .any(|name| name == RULE.as_bytes())
            {
                continue;
            }
            match mode {
                0 if line(end) + 1 == target_line => return true,
                1 if line(end) == target_line => return true,
                2 if end <= at => disabled = true,
                3 if end <= at => disabled = false,
                _ => {}
            }
            break;
        }
    }
    disabled
}

pub(crate) fn compiler_directive(ast: &Value, diagnostic: &Value) -> bool {
    if diagnostic["code"] != "eslint(no-unused-expressions)" {
        return false;
    }
    let Some(at) = diagnostic["labels"][0]["start"].as_u64() else {
        return false;
    };
    let Some(body) = ast["body"].as_array() else {
        return false;
    };
    body.iter()
        .zip(body.iter().skip(1))
        .any(|(statement, next)| {
            kind(statement) == "ExpressionStatement"
                && kind(&statement["expression"]) == "Identifier"
                && matches!(
                    statement["expression"]["name"].as_str(),
                    Some("$getter" | "$constructor" | "$linkTimeConstant")
                )
                && statement["start"].as_u64().is_some_and(|start| start <= at)
                && statement["end"].as_u64().is_some_and(|end| at < end)
                && kind(next) == "ExportNamedDeclaration"
                && kind(&next["declaration"]) == "FunctionDeclaration"
        })
}

fn kind(node: &Value) -> &str {
    node["type"].as_str().unwrap_or("")
}
fn boundary(node: &Value) -> bool {
    matches!(
        kind(node),
        "FunctionDeclaration"
            | "FunctionExpression"
            | "ArrowFunctionExpression"
            | "ClassDeclaration"
            | "ClassExpression"
    )
}
fn key(node: &Value) -> Option<String> {
    if kind(node) != "MemberExpression"
        || node["computed"].as_bool().unwrap_or(false)
        || node["optional"].as_bool().unwrap_or(false)
        || kind(&node["property"]) != "Identifier"
    {
        return None;
    }
    let base = match kind(&node["object"]) {
        "Identifier" => node["object"]["name"].as_str()?.to_owned(),
        "ThisExpression" => "this".to_owned(),
        "MemberExpression" => key(&node["object"])?,
        _ => return None,
    };
    Some(format!("{base}.{}", node["property"]["name"].as_str()?))
}
fn write_target(parent: &Value, field: &str) -> bool {
    (kind(parent) == "AssignmentExpression" && field == "left")
        || (kind(parent) == "UpdateExpression" && field == "argument")
        || (kind(parent) == "UnaryExpression"
            && parent["operator"] == "delete"
            && field == "argument")
}
fn callee(parent: &Value, field: &str) -> bool {
    (matches!(kind(parent), "CallExpression" | "NewExpression") && field == "callee")
        || (kind(parent) == "TaggedTemplateExpression" && field == "tag")
}
fn children(node: &Value, visit: &mut impl FnMut(&Value, &str)) {
    if let Some(object) = node.as_object() {
        for (field, value) in object {
            if matches!(
                field.as_str(),
                "parent" | "type" | "loc" | "range" | "start" | "end"
            ) {
                continue;
            }
            if let Some(values) = value.as_array() {
                for value in values {
                    if value.is_object() {
                        visit(value, field);
                    }
                }
            } else if value["type"].is_string() {
                visit(value, field);
            }
        }
    }
}
fn test_members(
    node: &Value,
    parent: &Value,
    field: &str,
    out: &mut BTreeMap<String, Value>,
    cached: &mut BTreeSet<String>,
) {
    if boundary(node) {
        return;
    }
    if !callee(parent, field) && !write_target(parent, field) {
        if let Some(key) = key(node) {
            if kind(parent) == "AssignmentExpression"
                && parent["operator"] == "="
                && field == "right"
            {
                cached.insert(key);
            } else {
                out.entry(key).or_insert_with(|| node.clone());
            }
            return;
        }
    }
    children(node, &mut |child, field| {
        test_members(child, node, field, out, cached)
    });
}
fn flags(node: &Value, parent: &Value, field: &str, target: &str) -> u8 {
    if boundary(node) {
        return 0;
    }
    let mut result = if key(node).as_deref() == Some(target) {
        if write_target(parent, field) {
            2
        } else if callee(parent, field) {
            4
        } else {
            1
        }
    } else {
        0
    };
    children(node, &mut |child, field| {
        result |= flags(child, node, field, target)
    });
    result
}
pub(crate) fn diagnostics(ast: &Value, severity: &str) -> Vec<Value> {
    fn visit(node: &Value, severity: &str, out: &mut Vec<Value>) {
        if kind(node) == "IfStatement" {
            let (mut members, mut cached) = (BTreeMap::new(), BTreeSet::new());
            test_members(&node["test"], node, "test", &mut members, &mut cached);
            for (key, member) in members {
                if cached.contains(&key)
                    || flags(&node["consequent"], node, "consequent", &key) != 1
                {
                    continue;
                }
                let dot = key
                    .as_bytes()
                    .iter()
                    .rposition(|byte| *byte == b'.')
                    .unwrap();
                let (base, prop) = (&key[..dot], &key[dot + 1..]);
                out.push(json!({"code": "bun/no-duplicate-conditional-property-access", "severity": severity, "message": format!("`{key}` is read in the `if` condition and again in the body. Read it into a local first (e.g. `const {{ {prop} }} = {base}`) so the property is only accessed once."), "labels": [{"start": member["start"], "end": member["end"], "primary": true}], "fixable": false}));
            }
        }
        children(node, &mut |child, _| visit(child, severity, out));
    }
    let mut out = Vec::new();
    visit(ast, severity, &mut out);
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn faithful_getter_exclusions() {
        for (source, expected) in [
            ("if (obj.x) use(obj.x);", 1),
            ("if (obj.x) obj.x++;", 0),
            ("if (obj.x) obj.x();", 0),
            ("if (local = obj.x) use(obj.x);", 0),
            ("if (obj.x) (() => obj.x)();", 0),
            ("if (obj.x) use(obj.x, obj.x);", 1),
        ] {
            let parsed = aphrody_oxc_bridge::parse(source, "a.ts").unwrap();
            assert_eq!(
                super::diagnostics(&parsed, "error").len(),
                expected,
                "{source}"
            );
        }
    }
}
