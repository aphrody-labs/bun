/* Copyright (c) 2024 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

// Brave web-discovery document extractor, ported from scraper/cxx onto
// Bun's html5ever DOM and selector engine (bun_browser_dom).

use bun_browser_dom::{parse_html, DomTree, NodeId};

pub struct SelectAttributeRequest {
    /// Optional selector for an element within the selected element; empty
    /// reads from the selected element itself.
    pub sub_selector: String,
    /// Arbitrary ID used for storing the scraped result.
    pub key: String,
    /// Name of the attribute to scrape, or `textContent`.
    pub attribute: String,
}

pub struct SelectRequest {
    pub root_selector: String,
    pub attribute_requests: Vec<SelectAttributeRequest>,
}

pub struct AttributeResult {
    pub root_selector: String,
    /// Scraped values by key in request order; empty when the attribute is
    /// not available.
    pub attribute_pairs: Vec<(String, String)>,
}

const TEXT_CONTENT_ATTRIBUTE_NAME: &str = "textContent";

fn read_attribute(document: &DomTree, node: NodeId, attribute: &str) -> String {
    if attribute == TEXT_CONTENT_ATTRIBUTE_NAME {
        return document.text_content(node);
    }
    document
        .with_node(node, |n| n.get_attribute(attribute).map(str::to_owned))
        .flatten()
        .unwrap_or_default()
}

fn insert_pair(pairs: &mut Vec<(String, String)>, key: &str, value: String) {
    match pairs.iter_mut().find(|(existing, _)| existing == key) {
        Some(pair) => pair.1 = value,
        None => pairs.push((key.to_owned(), value)),
    }
}

fn extract_attributes_from_nodes(
    document: &DomTree,
    request: &SelectRequest,
    selection: Vec<NodeId>,
    results: &mut Vec<AttributeResult>,
) {
    for node in selection {
        let mut attribute_map: Vec<(String, String)> = Vec::new();
        for attribute_request in &request.attribute_requests {
            let node_to_query = if attribute_request.sub_selector.is_empty() {
                node
            } else {
                match document.query_selector_from(node, &attribute_request.sub_selector) {
                    Ok(Some(sub_node)) => sub_node,
                    Ok(None) => {
                        insert_pair(&mut attribute_map, &attribute_request.key, String::new());
                        continue;
                    }
                    Err(_) => continue,
                }
            };
            let value = read_attribute(document, node_to_query, &attribute_request.attribute);
            insert_pair(&mut attribute_map, &attribute_request.key, value);
        }
        results.push(AttributeResult {
            root_selector: request.root_selector.clone(),
            attribute_pairs: attribute_map,
        });
    }
}

/// Extracts DOM attributes for each request. Invalid selectors are skipped.
pub fn query_element_attributes(html: &str, requests: &[SelectRequest]) -> Vec<AttributeResult> {
    let document = parse_html(html);
    let mut results = Vec::new();
    for request in requests {
        if let Ok(selection) = document.query_selector_all(&request.root_selector) {
            extract_attributes_from_nodes(&document, request, selection, &mut results);
        }
    }
    results
}
