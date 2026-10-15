// SPDX-License-Identifier: Apache-2.0
//! Exercise the real offline projection without linking the optional browser engines.
#[path = "../crates/web-crawl/src/dragon_ball/catalogue_index.rs"]
mod catalogue_index;

#[test]
fn known_campaign_exports_include_the_new_shenron_catalogues() {
    assert!(catalogue_index::EXPORTS.contains(&"publications/manga-catalogue/index.json"));
    assert!(catalogue_index::EXPORTS.contains(&"catalog/assets/index.json"));
}
