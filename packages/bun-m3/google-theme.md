# Public search presentation

`src/google-public-theme.css` presents the canonical Aphrody search page with a
centered heading, rounded search field, neutral actions and readable result
links. Aphrody identity, Google attribution, authentication boundaries and
capability messages remain supplied by the existing product UI.

The site entry injects the stylesheet at `/_app-ui/google-public-theme.css`.
Its presentation rules are scoped to
`article[aria-labelledby="aphrody-home-title"]`, except the existing
`.material-symbol` font treatment needed by application navigation. Typography
and shape use the canonical `--aphrody-font-brand`, `--aphrody-font-plain` and
`--md-sys-shape-corner-*` tokens. No separate theme or hex palette is introduced.

The public search article selects `color-scheme: light` and native system
`Canvas`, `CanvasText` and `LinkText` colors. Link blue is the browser/OS system
choice, not an exact Google theme. Other application pages retain their current
theme. Focus indicators, wrapping results and forced-color overrides remain
available; no product text or controls are hidden.

Material Symbols uses the existing artifact asset
`/_app-ui/fonts/material-symbols-outlined.woff2`, preserved by the canonical
public-assets fallback configuration. The stylesheet enables ligatures for the
existing icon names. It adds no font copy or remote dependency.

Validation requires CSS parsing/bundling, formatting, the served stylesheet and
font responses, and real browser screenshots at desktop and mobile widths.
Source validation alone does not establish deployed appearance or search
backend availability.

On 2026-10-11, the rebuilt local site passed Chrome 154 desktop (1365×900)
and mobile (390×844) qualification across 20 page visits: successful HTTP
responses, no script exceptions or horizontal overflow, and loaded Material
Symbols. Both home screenshots were inspected. A CDP platform-font probe
confirmed Segoe UI for body text; the canonical brand/plain tokens were present.
The explicit system-ui/sans-serif fallback guards missing tokens and does not
claim a demonstrated font defect. A subsequent disposable Chrome qualification
using the canonical HTTPS origin passed 22 records across the same 20 page
visits, with no script exceptions and actual custom Roboto Flex text rendering
at both widths. This verifies the existing remote font assets under their
canonical-origin CORS policy; production deployment remains a separate gate.
