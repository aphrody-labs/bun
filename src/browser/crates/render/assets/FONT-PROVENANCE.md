# Bundled font provenance

## Noto Color Emoji

- File: `noto-color-emoji.ttf`
- Upstream: `googlefonts/noto-emoji`
- Version: 2.051 (Unicode 17.0)
- Commit: `8998f5dd683424a73e2314a8c1f1e359c19e8742`
- SHA-256: `72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b`
- License: SIL Open Font License 1.1, included in `LICENSE-NOTO-COLOR-EMOJI.txt`

## DejaVu Sans and Liberation

These existing font bytes moved unchanged from
`packages/bun-obscura/crates/obscura-render/assets` to this directory in the
browser fusion. Their embedded TrueType `name` records (IDs 0, 5, 13 and 14)
identify their copyright, versions and licenses. The table below records the
bytes audited on 2026-10-11; it does not claim that these binaries were rebuilt
from upstream source.

### DejaVu Sans

- Copyright: Bitstream, Inc. (2003) and Tavmjong Bah (2006); DejaVu changes
  are in the public domain, as stated in the embedded font metadata.
- Licenses: Bitstream Vera and Arev terms, copied in [LICENSE-DEJAVU.txt](LICENSE-DEJAVU.txt).
- Official source: [DejaVu 2.37](https://github.com/dejavu-fonts/dejavu-fonts/tree/0eda8a319c08835009849583cd090bb5b141ce25)
  and [DejaVu 2.35](https://github.com/dejavu-fonts/dejavu-fonts/tree/e055422f2643c8dc4718fb2269daeb3f707ccc4b).
- Notice source: the complete, unmodified 2.37 upstream `LICENSE`. This also
  retains upstream notices for other families; no TeX Gyre DJV Math font is
  included in this directory.
- Notice SHA-256: `7a083b136e64d064794c3419751e5c7dd10d2f64c108fe5ba161eae5e5958a93`.

### Liberation 1.07.4

- Copyright: Red Hat, Inc. (2007); LIBERATION is a Red Hat trademark.
- License: GNU GPL version 2 with the Liberation font exceptions. The bundled
  version is 1.07.4, rather than the separately licensed Liberation 2.x family.
- Complete upstream notices: [LICENSE-LIBERATION-1.07.4.txt](LICENSE-LIBERATION-1.07.4.txt)
  and [COPYING-LIBERATION-1.07.4.txt](COPYING-LIBERATION-1.07.4.txt).
- Matching official source release commit:
  [dbeb786b4ede1eaec2ec5cb8d3b75d21641e2a35](https://github.com/liberationfonts/liberation-1.7-fonts/tree/dbeb786b4ede1eaec2ec5cb8d3b75d21641e2a35).
  Its `src/` directory retains the editable font sources. Release packaging
  must retain these notices and fulfill the source distribution terms for
  these font files.
- `License.txt` SHA-256: `c40dd6adebad817defd68c7edad151d9c13d2ac3b4e1790ce2b727b024438b6d`.
- `COPYING` SHA-256: `ab15fd526bd8dd18a9e77ebc139656bf4d33e97fc7238cd11bf60e2b9b8666c6`.

### Unchanged font inventory

| File                             | Embedded version | SHA-256                                                          |
| -------------------------------- | ---------------- | ---------------------------------------------------------------- |
| dejavu-sans-bold.ttf             | 2.37             | 5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895 |
| dejavu-sans-boldoblique.ttf      | 2.35             | 6edf0283160186af451cbee71e7b845f2e4cabf264bb992ce668c83c25465e6f |
| dejavu-sans-oblique.ttf          | 2.35             | ccdf74b350f11fd3dd5774de50e5e6346a1a5da1f5b7d5fb83590665e97a5213 |
| dejavu-sans.ttf                  | 2.37             | 690243adfefe0ce154b547db6205794bd30ac4277275179517a90994f4980648 |
| liberation-mono-bold.ttf         | 1.07.4           | 410af69b6297b7cf6d20dd004004bd1bdb46460a60f9fef69b04169f4ff09660 |
| liberation-mono-boldoblique.ttf  | 1.07.4           | a2ab7fe6f5bd7c2bc59ca7f5f4212f165dc174cbbab366cab171df4e73939aa2 |
| liberation-mono-oblique.ttf      | 1.07.4           | 1b09e2a1d70adf339048943b21037462c56108411817bf6988c86cb88289fc34 |
| liberation-mono.ttf              | 1.07.4           | babd36837e644f08e6ba09b69feb770fbeba9e4611a619e5471fb8dbc132d42c |
| liberation-sans-bold.ttf         | 1.07.4           | c2d334cafbd28522007cc16970db8db4a75256123594a43fe07f89cfceb5bacc |
| liberation-sans-boldoblique.ttf  | 1.07.4           | 2e5f6a48571d50f277598c533dea4f659abce53335fb475aa2bc45bd2527f1d0 |
| liberation-sans-oblique.ttf      | 1.07.4           | f71f02009bd7320571db05b7459c7db92a1f5f68ac619009a2f637e18c7a93f9 |
| liberation-sans.ttf              | 1.07.4           | 36efda825bcd7d1de846204c3adad51ced9d9b5cb7df571fb33edc21207e324a |
| liberation-serif-bold.ttf        | 1.07.4           | cfbe3d2edd46ae844b7eb95012f9274776801873e27b2230bbf751645f011888 |
| liberation-serif-boldoblique.ttf | 1.07.4           | 23d013c7c9708b09be7517ddc3bff8322c5dfa16c629a68f6be2a860e2693698 |
| liberation-serif-oblique.ttf     | 1.07.4           | 2d826fdde37518f7393052764703fc8ec120ef1e19ba49b50fcc6b6186b8aa78 |
| liberation-serif.ttf             | 1.07.4           | 8d6951ea5fc4a9656df4802227292c7943186364929f00b97629e70daf228439 |
