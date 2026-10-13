use crate::config::colors::{ColorArray, ColorWGPU, Colors};
use serde::{Deserialize, Serialize};
mod material;

#[derive(Debug, Clone, Copy)]
pub struct MaterialColors {
    pub surface: ColorArray,
    pub surface_container: ColorArray,
    pub surface_container_high: ColorArray,
    pub on_surface: ColorArray,
    pub on_surface_variant: ColorArray,
    pub primary: ColorArray,
    pub on_primary: ColorArray,
    pub primary_container: ColorArray,
    pub on_primary_container: ColorArray,
    pub outline: ColorArray,
    pub outline_variant: ColorArray,
}

fn rgb(hex: u32) -> ColorArray {
    [
        ((hex >> 16) & 255) as f32 / 255.0,
        ((hex >> 8) & 255) as f32 / 255.0,
        (hex & 255) as f32 / 255.0,
        1.0,
    ]
}

impl MaterialColors {
    pub fn for_background(background: ColorArray) -> Self {
        Self::new(
            background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722
                < 0.5,
        )
    }

    pub fn new(dark: bool) -> Self {
        material::colors(dark)
    }

    pub fn terminal(dark: bool) -> Colors {
        let roles = Self::new(dark);
        let mut colors = Colors {
            background: (
                roles.surface,
                ColorWGPU {
                    r: roles.surface[0] as f64,
                    g: roles.surface[1] as f64,
                    b: roles.surface[2] as f64,
                    a: 1.0,
                },
            ),
            foreground: roles.on_surface,
            cursor: roles.primary,
            vi_cursor: roles.primary,
            tabs: roles.surface_container,
            tabs_active: roles.primary_container,
            split: roles.outline,
            split_active: roles.primary,
            selection_background: roles.primary_container,
            selection_foreground: roles.on_primary_container,
            search_match_background: roles.primary_container,
            search_match_foreground: roles.on_primary_container,
            search_focused_match_background: roles.primary,
            search_focused_match_foreground: roles.on_primary,
            hint_background: roles.primary,
            hint_foreground: roles.on_primary,
            ..Colors::default()
        };
        let ansi = if dark {
            [
                0xb0aab5, 0xffb4ab, 0xa8d5a2, 0xf2d080, 0xb5c4ff, 0xe0b7e9, 0x9cd5dc,
                0xe6e0e9,
            ]
        } else {
            [
                0x1d1b20, 0x9c2525, 0x28632a, 0x725500, 0x344c99, 0x793b88, 0x00636e,
                0x49454f,
            ]
        }
        .map(rgb);
        [
            colors.black,
            colors.red,
            colors.green,
            colors.yellow,
            colors.blue,
            colors.magenta,
            colors.cyan,
            colors.white,
        ] = ansi;
        [
            colors.light_black,
            colors.light_red,
            colors.light_green,
            colors.light_yellow,
            colors.light_blue,
            colors.light_magenta,
            colors.light_cyan,
            colors.light_white,
        ] = ansi;
        colors
    }
}

pub fn default_native_theme() -> String {
    "m3".to_owned()
}

pub fn default_native_colors() -> Colors {
    MaterialColors::terminal(true)
}

#[derive(Default, Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AdaptiveColors {
    #[serde(default = "Option::default", skip_serializing)]
    pub dark: Option<Colors>,
    #[serde(default = "Option::default", skip_serializing)]
    pub light: Option<Colors>,
}

#[derive(Default, Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AdaptiveTheme {
    pub dark: String,
    pub light: String,
}

#[derive(Debug, Default, Clone, Deserialize, PartialEq)]
pub struct Theme {
    #[serde(default = "Colors::default")]
    pub colors: Colors,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppearanceTheme {
    Dark,
    Light,
}

impl AppearanceTheme {
    #[cfg(feature = "rio-window")]
    pub fn to_window_theme(self) -> rio_window::window::Theme {
        match self {
            AppearanceTheme::Dark => rio_window::window::Theme::Dark,
            AppearanceTheme::Light => rio_window::window::Theme::Light,
        }
    }

    #[cfg(feature = "rio-window")]
    pub fn from_window_theme(theme: rio_window::window::Theme) -> Self {
        match theme {
            rio_window::window::Theme::Light => AppearanceTheme::Light,
            rio_window::window::Theme::Dark => AppearanceTheme::Dark,
        }
    }

    pub fn toggled(self) -> Self {
        match self {
            AppearanceTheme::Dark => AppearanceTheme::Light,
            AppearanceTheme::Light => AppearanceTheme::Dark,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn luminance(color: ColorArray) -> f32 {
        let linear = color.map(|value| {
            if value <= 0.04045 {
                value / 12.92
            } else {
                ((value + 0.055) / 1.055).powf(2.4)
            }
        });
        linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    }

    fn contrast(foreground: ColorArray, background: ColorArray) -> f32 {
        let a = luminance(foreground);
        let b = luminance(background);
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }

    #[test]
    fn native_material_text_and_terminal_highlights_are_legible() {
        for dark in [false, true] {
            let roles = MaterialColors::new(dark);
            for background in [
                roles.surface,
                roles.surface_container,
                roles.surface_container_high,
            ] {
                assert!(contrast(roles.on_surface, background) >= 7.0);
                assert!(contrast(roles.on_surface_variant, background) >= 4.5);
                assert!(contrast(roles.outline, background) >= 3.0);
            }
            let colors = MaterialColors::terminal(dark);
            for (foreground, background) in [
                (colors.selection_foreground, colors.selection_background),
                (
                    colors.search_match_foreground,
                    colors.search_match_background,
                ),
                (
                    colors.search_focused_match_foreground,
                    colors.search_focused_match_background,
                ),
                (colors.hint_foreground, colors.hint_background),
            ] {
                assert!(contrast(foreground, background) >= 4.5);
            }
            for foreground in [
                colors.red,
                colors.green,
                colors.blue,
                colors.yellow,
                colors.magenta,
                colors.cyan,
            ] {
                assert!(contrast(foreground, colors.background.0) >= 4.5);
            }
        }
    }
}
