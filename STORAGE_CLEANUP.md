# Storage cleanup — 3 November 2026

Project allocation measured with `du -sk`: approximately 16.92 GB before cleanup, 8.60 GB after, a reduction of 8.32 GB (decimal units; this is folder allocation, not a filesystem free-space guarantee). Removed 72 items, including 12 inactive completed QA restore databases, obsolete Next builds, two disposable frozen/reproduction install trees, old duplicate encrypted QA backups, generated coverage/dist, OS metadata, and the reproducible 1 GB audit export ZIP.

Preserved all application source, tests, migrations, requirements, original local Git history and tracked audit evidence. Owner observation and SHADOW databases and their mode/signer/updated_at fields were checked before/after and remain unchanged. Primary r0/browser/execution QA databases, installed dependencies, authentication/configuration, latest verified encrypted backup and its private decrypt material, and default/current-owner/supervisor-QA builds remain local. No financial activation or owner HALT change occurred.

GitHub contains a separate curated source history; local audit history was not pushed. Source publication and actual fresh-checkout/install/check plus full224 unit/PostgreSQL evidence are documented in IMPLEMENTATION_STATUS.md. Raw per-path/per-database deletion records and protected-state comparison remain local in `.tmp/storage-cleanup-result.json` and `.tmp/cleanup-baseline.json`; private runtime data is not published.

The large audit ZIP can be recreated with `python3 scripts/audit-export.py`; previously saved archive checksums describe the former package, not a file still present after cleanup. All original tracked audit artifacts remain available locally. See ops/STORAGE_POLICY.md before future cleanup; never delete `.tmp` wholesale.
