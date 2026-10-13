use rio_backend::ansi::native_ui::{Direction, Frame, Kind};
use rio_backend::sugarloaf::{text::DrawOpts, Sugarloaf};
use std::collections::HashMap;
use std::sync::Arc;
use taffy::prelude::*;

#[derive(Default)]
pub struct NativeUi {
    pub panes: HashMap<usize, Pane>,
}

pub struct Pane {
    pub frame: Arc<Frame>,
    pub bounds: [f32; 4],
    pub nodes: Vec<(u32, [f32; 4])>,
}

pub fn layout(
    frame: &Frame,
    size: [f32; 2],
    mut measure: impl FnMut(&str, f32) -> f32,
) -> Option<Vec<[f32; 4]>> {
    if frame.nodes.is_empty() || !frame.validate() {
        return None;
    }
    let mut tree: TaffyTree<()> = TaffyTree::new();
    let mut ids = HashMap::new();
    let mut nodes = Vec::with_capacity(frame.nodes.len());
    for (index, node) in frame.nodes.iter().enumerate() {
        let s = node.style;
        let font_size = s.font_size.unwrap_or(18.0);
        let mut style = Style {
            flex_direction: match s.direction {
                Some(Direction::Row) => FlexDirection::Row,
                _ => FlexDirection::Column,
            },
            flex_grow: s.flex_grow.unwrap_or(0.0),
            flex_shrink: 1.0,
            size: Size {
                width: s.width.map(Dimension::length).unwrap_or(Dimension::AUTO),
                height: s.height.map(Dimension::length).unwrap_or(Dimension::AUTO),
            },
            padding: Rect::length(s.padding.unwrap_or(0.0)),
            gap: Size::length(s.gap.unwrap_or(0.0)),
            ..Style::default()
        };
        if index == 0 {
            style.size = Size {
                width: Dimension::length(size[0]),
                height: Dimension::length(size[1]),
            };
        } else if node.kind == Kind::Text {
            if s.width.is_none() {
                style.size.width = Dimension::length(
                    node.text
                        .split('\n')
                        .map(|line| measure(line, font_size))
                        .fold(0.0, f32::max),
                );
            }
            if s.height.is_none() {
                style.size.height = Dimension::length(
                    font_size * 1.2 * node.text.split('\n').count() as f32,
                );
            }
        }
        let id = tree.new_leaf(style).ok()?;
        if let Some(parent) = node.parent {
            tree.add_child(*ids.get(&parent)?, id).ok()?;
        }
        ids.insert(node.id, id);
        nodes.push(id);
    }
    tree.compute_layout(
        nodes[0],
        Size {
            width: AvailableSpace::Definite(size[0]),
            height: AvailableSpace::Definite(size[1]),
        },
    )
    .ok()?;
    let mut output: Vec<[f32; 4]> = Vec::with_capacity(nodes.len());
    let mut indices = HashMap::new();
    for (index, id) in nodes.iter().enumerate() {
        let l = tree.layout(*id).ok()?;
        let parent = frame.nodes[index]
            .parent
            .and_then(|id| indices.get(&id))
            .map(|i: &usize| output[*i])
            .unwrap_or([0.0; 4]);
        output.push([
            parent[0] + l.location.x,
            parent[1] + l.location.y,
            l.size.width,
            l.size.height,
        ]);
        indices.insert(frame.nodes[index].id, index);
    }
    Some(output)
}

pub fn intersect(rect: [f32; 4], clip: [f32; 4]) -> [f32; 4] {
    let left = rect[0].max(clip[0]);
    let top = rect[1].max(clip[1]);
    [
        left,
        top,
        ((rect[0] + rect[2]).min(clip[0] + clip[2]) - left).max(0.0),
        ((rect[1] + rect[3]).min(clip[1] + clip[3]) - top).max(0.0),
    ]
}

impl NativeUi {
    pub fn draw(
        &mut self,
        route: usize,
        frame: Arc<Frame>,
        bounds: [f32; 4],
        sugarloaf: &mut Sugarloaf,
    ) {
        let Some(rects) = layout(&frame, [bounds[2], bounds[3]], |text, font_size| {
            sugarloaf.text_mut().measure(
                text,
                &DrawOpts {
                    font_size,
                    ..DrawOpts::default()
                },
            )
        }) else {
            return;
        };
        let mut hits = Vec::with_capacity(rects.len());
        for (node, rect) in frame.nodes.iter().zip(rects) {
            let absolute = [bounds[0] + rect[0], bounds[1] + rect[1], rect[2], rect[3]];
            let clipped = intersect(absolute, bounds);
            if clipped[2] == 0.0 || clipped[3] == 0.0 {
                continue;
            }
            hits.push((node.id, clipped));
            if let Some(color) = node.style.background {
                sugarloaf.rounded_rect(
                    None,
                    clipped[0],
                    clipped[1],
                    clipped[2],
                    clipped[3],
                    color,
                    0.0,
                    node.style.border_radius.unwrap_or(0.0),
                    4,
                );
            }
            if node.kind == Kind::Text {
                let color = node
                    .style
                    .color
                    .unwrap_or([1.0; 4])
                    .map(|v| (v * 255.0).round() as u8);
                let font_size = node.style.font_size.unwrap_or(18.0);
                for (line, text) in node.text.split('\n').enumerate() {
                    let y = absolute[1] + line as f32 * font_size * 1.2;
                    if y >= clipped[1] + clipped[3] {
                        break;
                    }
                    sugarloaf.text_mut().draw_clipped(
                        absolute[0],
                        y,
                        text,
                        &DrawOpts {
                            font_size,
                            color,
                            ..DrawOpts::default()
                        },
                        clipped,
                    );
                }
            }
        }
        self.panes.insert(
            route,
            Pane {
                frame,
                bounds,
                nodes: hits,
            },
        );
    }

    pub fn hit(&self, x: f32, y: f32) -> Option<(usize, &Pane, u32)> {
        for (route, pane) in &self.panes {
            for (id, r) in pane.nodes.iter().rev() {
                if x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3] {
                    return Some((*route, pane, *id));
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn flex_layout_and_clip_are_deterministic() {
        let frame: Frame = serde_json::from_str(r#"{"version":1,"sequence":1,"nodes":[{"id":1,"kind":"view","style":{"direction":"row","padding":10,"gap":5}},{"id":2,"parent":1,"kind":"view","style":{"width":40,"height":20}},{"id":3,"parent":1,"kind":"text","text":"abc"}]}"#).unwrap();
        let rects = layout(&frame, [200.0, 100.0], |_, _| 30.0).unwrap();
        assert_eq!(rects[1], [10.0, 10.0, 40.0, 20.0]);
        assert_eq!(rects[2][0], 55.0);
        assert_eq!(
            intersect([90.0, 90.0, 30.0, 30.0], [0.0, 0.0, 100.0, 100.0]),
            [90.0, 90.0, 10.0, 10.0]
        );
    }
}
