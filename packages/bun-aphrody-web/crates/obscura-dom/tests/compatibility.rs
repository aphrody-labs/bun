// SPDX-License-Identifier: Apache-2.0
use obscura_dom::{parse_fragment, parse_html, DomTree, NodeId};

fn native_serialization(tree: &bun_browser_dom::DomTree, node: bun_browser_dom::NodeId) -> String {
    tree.outer_html(node)
}

#[test]
fn legacy_parse_select_and_serialize_share_native_types() {
    let html = "<main id=scope><p class=item>A &amp; B</p><p>ignored</p></main>";
    let legacy: DomTree = parse_html(html);
    let native = bun_browser_dom::parse_html(html);
    let selected: Vec<NodeId> = legacy.query_selector_all("#scope > .item").unwrap();
    let canonical = native.query_selector_all("#scope > .item").unwrap();
    assert_eq!(selected.len(), 1);
    assert_eq!(
        native_serialization(&legacy, selected[0]),
        "<p class=\"item\">A &amp; B</p>"
    );
    assert_eq!(
        legacy.outer_html(selected[0]),
        native.outer_html(canonical[0])
    );
    // Both package names denote the same concrete type, without conversion.
    let _: bun_browser_dom::DomTree = legacy;
}

#[test]
fn legacy_fragment_and_module_paths_reexport_native_api() {
    let fragment = parse_fragment("<b class=item>fragment</b>");
    let node = fragment.query_selector_all("b.item").unwrap()[0];
    assert_eq!(
        native_serialization(&fragment, node),
        "<b class=\"item\">fragment</b>"
    );
    let _: obscura_dom::selector::ObscuraSelector = bun_browser_dom::selector::BunBrowserSelector;
    let _: obscura_dom::selector::ObscuraSelectorParser =
        bun_browser_dom::selector::BunBrowserSelectorParser;
    let _ = obscura_dom::selector::parse_selector("b.item").unwrap();
    fn same_element_name<'a>(
        name: obscura_dom::tree_sink::ObscuraElemName<'a>,
    ) -> bun_browser_dom::tree_sink::BunBrowserElemName<'a> {
        name
    }
    let _ = same_element_name;
}
