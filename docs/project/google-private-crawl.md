# Google public discovery in the native private index

`scripts/aphrody/google-crawl.ts` merges the migrated Google source catalogs;
it delegates crawling, frontier persistence, extraction and indexing to native
`aphrody web crawl-index` and `aphrody home index`. It creates no competing
crawler, parser or database.

The atlas contains 366 observed hosts, including external sites and account
services. Its SHA-256 is
`72989c4fcb78e6d61f4b6b13fabf2b5b358fa0775f3475192b69260379301878`.
The 254-entry domain catalog has SHA-256
`356dfb248ec122d6f7fc9090e4182f92d1d2a52e91b78e0ec9ad3fa2caff7ce2`.
Their normalized union contains 602 hosts. Source presence establishes
provenance, not Google ownership or permission to access private services.
Changed source hashes require another review before execution.

The plan selects 25 exact public documentation, developer, research and blog
hosts present in those sources. Its first-run budget is 25 attempted pages,
25 HTTPS root seeds and depth zero. The maximum accepted page-attempt budget is
5,000 per run. Native robots requests, retries and redirects can create additional
network requests; the page budget does not describe total wire traffic.
Accounts, mail, user documents, BXC conversations, private datasets, saved
passwords and existing cookies are excluded. No automatic sign-in occurs.

Run the planner through the repository owner build command:

```powershell
bun bd run scripts/aphrody/google-crawl.ts --label google-public
```

After reviewing the plan, the existing VPS checkout can run the same script with
`--index-catalog --root ABSOLUTE_NEW_PRIVATE_JOB_DIRECTORY` to index only the
catalog metadata. The job parent must already exist as an owner-only ordinary
directory. Creation is exclusive; existing jobs and other profiles are preserved.
The catalog document is mode 0600, directories mode 0700. The existing native home
profile is `aphrody`; remote artifacts stay in that protected state.

`--apply` additionally invokes the native crawl-index command. It currently
refuses collection because the installed owner does not advertise
`crawl-redirect-allowlist-before-network`. The runner's existing final-URL
domain check occurs after native HTTP redirects and does not prove a per-hop
network boundary. Qualification must install a real native guard before every
redirect request, including robots fetches, and advertise the capability only
after fixture verification. A flag or fabricated receipt is insufficient.

Apply uses a fresh native anonymous transport and removes standard proxy and
private-network override environment variables from its child. This is a direct
egress plan, not proof of a US exit location. An authenticated proxy, full-site
mirror, browser-cookie synchronization and complete Google discovery remain
separate qualifications. The initial implementation has made no live crawl or
private dataset transfer.
