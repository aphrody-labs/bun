# Chrome Web Store Listing — Aphrody Chrome

Last updated: 2026-10-11. Draft; not submitted or published.

Name: Aphrody Chrome. Short description: Open Aphrody search and save selected browser data privately with Bun.

Detailed description: Open Aphrody from your new tab, homepage or search box. Use the popup to search or open Google sign-in on Aphrody. If you choose, save a limited selection of recent bookmarks, browsing history, open tabs or closed sessions as a private archive on your computer. Chrome asks for access only when you click the corresponding export button. A separately installed Bun companion is needed for local export. Passwords and browser sign-ins remain managed by Chrome.

Category: Productivity. Purpose: Open Aphrody and transfer selected browser navigation data to its local companion. Language: French. Publisher: aphrody-dev. Contact: contact@aphrody.com. Homepage: https://aphrody.com. Distribution: not published.

| Permission      | Request  | Reason                                                                             |
| --------------- | -------- | ---------------------------------------------------------------------------------- |
| storage         | required | Store installation version and last export time locally, without exported content. |
| bookmarks       | optional | Save up to500 recent bookmarks after its export button is clicked.                 |
| history         | optional | Save up to200 history entries after its export button is clicked.                  |
| tabs            | optional | Save up to100 open tabs, or read URLs in closed sessions selected for export.      |
| sessions        | optional | Save up to25 recently closed sessions after its export button is clicked.          |
| nativeMessaging | optional | Deliver the selected export to the explicitly installed local Bun companion.       |

No host permissions, content scripts, advertising, analytics, password access or cookie access. The user-selected navigation data stays on-device. Normal visits/searches/sign-in on Aphrody follow the site's own privacy policy; the extension does not read their authentication tokens. Data is not sold, used for unrelated purposes or used for credit decisions.

PNG icons16/32/48/128/192/512 are generated from the owner's real M3 colors. Store screenshots and a live extension privacy-policy URL remain required before submission. Domain ownership for search overrides must be verified by the publishing developer account. Mixed settings overrides and optional export capabilities need store single-purpose review; do not treat this draft as approval. Google OAuth is site-owned, with no extension OAuth client or identity permission.

Version1.4.4, 2026-10-11: initial draft theme, navigation and private local export. No Chrome loading, native host registration or installation claim is implied by generated manifests. The separate theme has no JavaScript or permissions.
