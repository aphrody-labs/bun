//! Page-side input synthesis for engines without a native injection API (WebKitGTK 6 has
//! none public). Events are dispatched on the element under the point / the focused element,
//! with the default actions Bun.WebView relies on: focus on mousedown, click / dblclick /
//! contextmenu, text insertion through `execCommand("insertText")` (fires `beforeinput` and
//! `input`), Enter submits the form, Backspace/Delete edit, Tab moves focus, wheel scrolls.
//! Each function returns a JavaScript expression for [`crate::Backend::evaluate`].

use crate::{KeyEvent, KeyKind, MouseEvent, MouseKind};

const HELPER: &str = include_str!("input.js");

fn call(fn_name: &str, args: &serde_json::Value) -> String {
    format!("({HELPER})().{fn_name}({args})")
}

pub fn mouse_script(ev: &MouseEvent) -> String {
    let kind = match ev.kind {
        MouseKind::Pressed => "down",
        MouseKind::Released => "up",
        MouseKind::Moved => "move",
        MouseKind::Wheel => "wheel",
    };
    call(
        "mouse",
        &serde_json::json!({
            "kind": kind, "x": ev.x, "y": ev.y, "button": ev.button, "clickCount": ev.click_count,
            "modifiers": ev.modifiers, "deltaX": ev.delta_x, "deltaY": ev.delta_y,
        }),
    )
}

pub fn key_script(ev: &KeyEvent) -> String {
    let kind = match ev.kind {
        KeyKind::Down => "down",
        KeyKind::RawDown => "rawdown",
        KeyKind::Up => "up",
        KeyKind::Char => "char",
    };
    call(
        "key",
        &serde_json::json!({
            "kind": kind, "key": ev.key, "code": ev.code, "text": ev.text, "keyCode": ev.key_code, "modifiers": ev.modifiers,
        }),
    )
}

pub fn insert_text_script(text: &str) -> String {
    call("insertText", &serde_json::Value::String(text.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripts_are_single_expressions() {
        let s = insert_text_script("a\"b\n");
        assert!(s.starts_with("((") && s.ends_with("(\"a\\\"b\\n\")"));
        let m = mouse_script(&MouseEvent {
            kind: MouseKind::Pressed,
            x: 1.0,
            y: 2.0,
            button: "left".into(),
            click_count: 1,
            modifiers: 0,
            delta_x: 0.0,
            delta_y: 0.0,
        });
        assert!(m.contains(".mouse({"));
    }
}
