use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const PREFIX: &[u8] = b"RioUI;";
pub const MAX_DECODED_BYTES: usize = 65536;
pub const MAX_ENCODED_BYTES: usize = MAX_DECODED_BYTES.div_ceil(3) * 4;
pub const MAX_NODES: usize = 512;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub version: u8,
    pub sequence: u64,
    #[serde(default)]
    pub focus: bool,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub id: u32,
    #[serde(default)]
    pub parent: Option<u32>,
    pub kind: Kind,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub style: Style,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    View,
    Text,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Style {
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub flex_grow: Option<f32>,
    pub direction: Option<Direction>,
    pub padding: Option<f32>,
    pub gap: Option<f32>,
    pub background: Option<[f32; 4]>,
    pub color: Option<[f32; 4]>,
    pub font_size: Option<f32>,
    pub border_radius: Option<f32>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Row,
    Column,
}

impl Frame {
    pub fn validate(&self) -> bool {
        if self.version != 1 || self.nodes.len() > MAX_NODES {
            return false;
        }
        let mut parents = HashMap::with_capacity(self.nodes.len());
        for (index, node) in self.nodes.iter().enumerate() {
            if parents.contains_key(&node.id)
                || node.text.len() > 16384
                || (node.kind == Kind::View && !node.text.is_empty())
            {
                return false;
            }
            let depth = match node.parent {
                None if index == 0 => 0,
                Some(id) => match parents.get(&id) {
                    Some((depth, Kind::View)) if *depth < 32 => depth + 1,
                    _ => return false,
                },
                _ => return false,
            };
            let s = &node.style;
            for number in [
                s.width,
                s.height,
                s.flex_grow,
                s.padding,
                s.gap,
                s.border_radius,
            ]
            .into_iter()
            .flatten()
            {
                if !number.is_finite() || !(0.0..=16384.0).contains(&number) {
                    return false;
                }
            }
            if s.font_size
                .is_some_and(|size| !size.is_finite() || !(1.0..=256.0).contains(&size))
            {
                return false;
            }
            for color in [s.background, s.color].into_iter().flatten() {
                if color
                    .iter()
                    .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                {
                    return false;
                }
            }
            parents.insert(node.id, (depth, node.kind));
        }
        true
    }
}

pub fn parse(body: &[u8]) -> Option<Frame> {
    let encoded = body.strip_prefix(PREFIX)?;
    if encoded.len() > MAX_ENCODED_BYTES {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    if bytes.len() > MAX_DECODED_BYTES {
        return None;
    }
    let frame: Frame = serde_json::from_slice(&bytes).ok()?;
    frame.validate().then_some(frame)
}

pub fn reply(value: &impl Serialize) -> Option<Vec<u8>> {
    let bytes = serde_json::to_vec(value).ok()?;
    if bytes.len() > 4096 {
        return None;
    }
    Some(
        format!(
            "\x1b_RioUIEvent;{}\x1b\\",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
        .into_bytes(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn frame(json: &str) -> Option<Frame> {
        parse(
            format!(
                "RioUI;{}",
                base64::engine::general_purpose::STANDARD.encode(json)
            )
            .as_bytes(),
        )
    }
    #[test]
    fn accepts_tree_and_clear() {
        assert!(frame(r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"view"},{"id":2,"parent":1,"kind":"text","text":"Hello"}]}"#).is_some());
        assert!(frame(r#"{"version":1,"sequence":2,"nodes":[]}"#).is_some());
    }
    #[test]
    fn rejects_invalid_graph_and_styles() {
        for json in [
            r#"{"version":2,"sequence":1,"nodes":[]}"#,
            r#"{"version":1,"sequence":1,"nodes":[{"id":1,"parent":1,"kind":"view"}]}"#,
            r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"view"},{"id":1,"parent":1,"kind":"text"}]}"#,
            r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"text"},{"id":2,"parent":1,"kind":"view"}]}"#,
            r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"view","style":{"width":-1}}]}"#,
            r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"view","style":{"color":[2,0,0,1]}}]}"#,
        ] {
            assert!(frame(json).is_none(), "{json}");
        }
        assert!(parse(&[b'a'; MAX_ENCODED_BYTES + 10]).is_none());
        assert!(parse(b"RioUI;bad!base64").is_none());
    }
    #[test]
    fn bounds_nodes_and_depth() {
        let mut tree = Frame {
            version: 1,
            sequence: 0,
            focus: false,
            nodes: vec![],
        };
        for id in 0..34 {
            tree.nodes.push(Node {
                id,
                parent: id.checked_sub(1),
                kind: Kind::View,
                text: String::new(),
                style: Style::default(),
            });
        }
        assert!(!tree.validate());
        tree.nodes.truncate(33);
        assert!(tree.validate());
        tree.nodes.resize(MAX_NODES + 1, tree.nodes[0].clone());
        assert!(!tree.validate());
    }
}
