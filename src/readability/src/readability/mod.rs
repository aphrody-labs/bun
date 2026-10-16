// Copyright (c) 2021 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at https://mozilla.org/MPL/2.0/.

// Absorbed upstream API surface: not every item has a Bun caller.
#![allow(dead_code, unreachable_pub)]
pub mod dom;
pub mod error;
pub mod extractor;
mod nlp;
pub(crate) use nlp::first_sentence_boundary;
pub mod scorer;
pub mod statistics;
mod util;
