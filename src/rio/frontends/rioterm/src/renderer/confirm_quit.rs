// Copyright (c) 2023-present, Raphael Amorim.
//
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

use rio_backend::config::theme::MaterialColors;
use rio_backend::sugarloaf::text::DrawOpts;
use rio_backend::sugarloaf::Sugarloaf;

const HEADING: &str = "want to quit?";
const CONFIRM: &str = "yes (y)";
const DISMISS: &str = "no (n)";

#[derive(Default)]
pub struct ConfirmQuit {
    active: bool,
}

impl ConfirmQuit {
    #[inline]
    pub fn is_active(&self) -> bool {
        self.active
    }

    #[inline]
    pub fn set_active(&mut self, active: bool) {
        self.active = active;
    }

    /// `dimensions` is `(window_width, window_height, scale_factor)`,
    /// matching the other overlays' `render` signature.
    pub fn render(
        &self,
        sugarloaf: &mut Sugarloaf,
        dimensions: (f32, f32, f32),
        background: [f32; 4],
    ) {
        if !self.active {
            return;
        }

        let (width, height, scale) = dimensions;
        let win_w = width / scale;
        let win_h = height / scale;

        let colors = MaterialColors::for_background(background);
        let text_color = colors.on_surface.map(|c| (c * 255.0) as u8);
        let choices = format!("{}  /  {}", CONFIRM, DISMISS);
        let heading_opts = DrawOpts {
            font_size: 18.0,
            color: text_color,
            ..DrawOpts::default()
        };
        let padding_x = 16.0;
        let padding_y = 12.0;
        let heading_width = sugarloaf.text_mut().measure(HEADING, &heading_opts);
        let choices_width = sugarloaf.text_mut().measure(&choices, &heading_opts);
        let box_w = (heading_width.max(choices_width) + padding_x * 2.0)
            .min((win_w - 16.0).max(0.0));
        let box_h = 96.0_f32.min(win_h);
        let box_x = (win_w - box_w) / 2.0;
        let box_y = (win_h - box_h) / 2.0;

        sugarloaf.rounded_rect(
            None,
            box_x,
            box_y,
            box_w,
            box_h,
            colors.surface_container,
            0.0,
            16.0,
            20,
        );

        let text_x = box_x + padding_x;
        let text_y = box_y + padding_y + 2.0;

        let ui = sugarloaf.text_mut();
        ui.draw(text_x, text_y, HEADING, &heading_opts);
        ui.draw(text_x, text_y + 48.0, &choices, &heading_opts);
    }
}
