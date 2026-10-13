# update-bindings

Use the selected Aphrody CEF source headers to run `bindgen` on the C API for
`cef-dll-sys`, then regenerate safe and resource bindings in `cef`. Set
`CEF_PATH_<os>_<arch>` to the owner header directory and run `update-bindings
--bindgen --target <rust-target>`. No binary archive is downloaded.

Bindings use the distribution's `CEF_API_VERSION_LAST` explicitly. Source
generation and the later native library API hash qualification are separate;
the Bun wrapper records both in target-specific receipts.
