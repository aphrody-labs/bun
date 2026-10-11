// SPDX-License-Identifier: Apache-2.0
//! Fixture with inner documentation and consumer crate references.

pub(crate) fn consumer_value() -> u32 {
    crate::CONSUMER_CONTEXT
}
