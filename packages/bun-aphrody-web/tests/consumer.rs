// SPDX-License-Identifier: Apache-2.0
aphrody_web_source::module!("crates/shell/web/src/wire.rs", pub mod wire);

#[test]
fn actual_transferred_module_runs_in_a_consumer_crate() {
    assert_eq!(
        wire::resize_frame(0, 24),
        r#"{"cols":1,"rows":24,"type":"resize"}"#
    );
    assert_eq!(wire::data_frame(b"x"), r#"{"bytes":[120],"type":"data"}"#);
}
