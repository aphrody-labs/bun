# Installed fork-plugin verification — 2026-10-10

The embedded plugin installer dry-run for Claude and Codex reports up to date:
version 1.4.4+2fb86b44ed79, content hash
2fb86b44ed790069182d6cb9920cb9955b59b1305e81aa9829415cdbeec9ba08.

Generating the changed executable's embedded plugin into an owned temporary
directory and comparing each file against the installed marketplace confirms
all 313 files match by SHA-256, with zero missing or different files. Claude's
bun@aphrody-bun entry is enabled. Codex registers the local aphrody-bun
marketplace and enables the same plugin. Registration checks did not change authentication or other provider settings.

Doctor recognizes the changed binary as the Aphrody runtime. Its current=false
field compares the plugin's stable 1.4.4 version with Bun.version=1.4.4-debug;
this does not contradict the verified installed content. The installation
receipt records the earlier PATH binary 1.4.3-aphrody.4. Release runtime alignment
and live provider-session activation still need their own evidence. The installed
content and provider registrations required no rewrite or downgrade.

Receipts: tmp/plugin-align-plan.json, tmp/plugin-align-doctor.json,
tmp/plugin-align-runtime-version.json and tmp/plugin-align-content-check.json.
