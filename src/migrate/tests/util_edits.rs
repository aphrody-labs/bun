// Copyright 2026 aphrody-code
// SPDX-License-Identifier: Apache-2.0

use bun_migrate::util::{Edit, apply_edits};

#[test]
fn empty_edits_returns_source() {
    assert_eq!(apply_edits("abc", vec![]), "abc");
}

#[test]
fn single_edit_at_start() {
    let edits = vec![Edit { index: 0, len: 3, replacement: "XYZ".into() }];
    assert_eq!(apply_edits("abcdef", edits), "XYZdef");
}

#[test]
fn single_edit_at_end() {
    let edits = vec![Edit { index: 3, len: 3, replacement: "XYZ".into() }];
    assert_eq!(apply_edits("abcdef", edits), "abcXYZ");
}

#[test]
fn multiple_non_overlapping_edits() {
    let edits = vec![
        Edit { index: 0, len: 1, replacement: "A".into() },
        Edit { index: 4, len: 1, replacement: "E".into() },
    ];
    assert_eq!(apply_edits("abcde", edits), "AbcdE");
}

#[test]
fn overlap_keeps_longer_at_same_index() {
    // index égal : la plus longue gagne.
    let edits = vec![
        Edit { index: 0, len: 3, replacement: "SHORT".into() },
        Edit { index: 0, len: 6, replacement: "LONG".into() },
    ];
    assert_eq!(apply_edits("abcdefghi", edits), "LONGghi");
}

#[test]
fn nested_overlap_keeps_outer() {
    // index 0 len 6 enveloppe index 2 len 2 — l'outer gagne.
    let edits = vec![
        Edit { index: 0, len: 6, replacement: "OUTER".into() },
        Edit { index: 2, len: 2, replacement: "in".into() },
    ];
    assert_eq!(apply_edits("abcdefghi", edits), "OUTERghi");
}

#[test]
fn adjacent_edits_both_applied() {
    // pas d'overlap si fin du premier == début du second.
    let edits = vec![
        Edit { index: 0, len: 2, replacement: "AA".into() },
        Edit { index: 2, len: 2, replacement: "BB".into() },
    ];
    assert_eq!(apply_edits("abcd", edits), "AABB");
}

#[test]
fn unicode_replacements_insertions_and_deletions_keep_original_offsets() {
    let source = "α café 猫 τέλος";
    let cafe = source.find("café").unwrap();
    let cat = source.find('猫').unwrap();
    let edits = vec![
        Edit { index: cat, len: "猫".len(), replacement: String::new() },
        Edit { index: 0, len: 0, replacement: "préfixe ".into() },
        Edit { index: cafe, len: "café".len(), replacement: "☕".into() },
        Edit { index: source.len(), len: 0, replacement: "!".into() },
    ];
    assert_eq!(apply_edits(source, edits), "préfixe α ☕  τέλος!");
}

#[test]
fn insertions_at_one_offset_keep_existing_priority() {
    let edits = vec![
        Edit { index: 1, len: 0, replacement: "first".into() },
        Edit { index: 1, len: 0, replacement: "second".into() },
    ];
    assert_eq!(apply_edits("ab", edits), "asecondfirstb");
}

#[test]
fn thousands_of_expanding_replacements_keep_the_source_order() {
    let count = 8000;
    let source = "fs\n".repeat(count);
    let edits = (0..count)
        .rev()
        .map(|index| Edit { index: index * 3, len: 2, replacement: "node:fs".into() })
        .collect();
    assert_eq!(apply_edits(&source, edits), "node:fs\n".repeat(count));
}
