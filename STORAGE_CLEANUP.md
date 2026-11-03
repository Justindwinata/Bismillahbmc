# Additional cleanup — 3 November 2026

After explicit additional owner authorization, removed 2741 entries and reduced project allocation by another 5.26 GB, from 8.60 GB to 3.33 GB (`du -sk`, decimal units). Completed isolated QA databases sentinel_r0, sentinel_d1_test_browser and sentinel_execution_test were dropped/recreated empty; fixtures and additive migrations rebuild them. Their generated test data is not owner portfolio data. Owner/SHADOW databases and mode/signer/updated_at were compared before/after and remain unchanged.

Removed obsolete working-tree browser screenshots/traces (available in original local Git history), installed node_modules, all inactive Next build caches, generated exports and leftover temporary visual/reference copies. Retained the latest worker-isolation browser evidence, compact historical logs/JSON, complete source/spec/tests/migrations, original local Git history, owner/SHADOW data, authentication/configuration and latest verified encrypted backup with its private decrypt material. Raw future audit media is ignored by default to prevent history growth; explicitly curate evidence when necessary.

Before building or running, execute `pnpm install --frozen-lockfile`; rebuild using ops/DEVELOPMENT.md. No application code or financial policy was changed by this deletion. No new browser/runtime PASS is claimed after removing generated environments. Local detailed inventory is `.tmp/storage-cleanup-extra.json`. Earlier cleanup records below are historical and their retained primary-QA-data/build claims are superseded by this section.

# Storage cleanup — 3 November 2026

Project allocation measured with `du -sk`: approximately 16.92 GB before cleanup, 8.60 GB after, a reduction of 8.32 GB (decimal units; this is folder allocation, not a filesystem free-space guarantee). Removed 72 items, including 12 inactive completed QA restore databases, obsolete Next builds, two disposable frozen/reproduction install trees, old duplicate encrypted QA backups, generated coverage/dist, OS metadata, and the reproducible 1 GB audit export ZIP.

Preserved all application source, tests, migrations, requirements, original local Git history and tracked audit evidence. Owner observation and SHADOW databases and their mode/signer/updated_at fields were checked before/after and remain unchanged. Primary r0/browser/execution QA databases, installed dependencies, authentication/configuration, latest verified encrypted backup and its private decrypt material, and default/current-owner/supervisor-QA builds remain local. No financial activation or owner HALT change occurred.

GitHub contains a separate curated source history; local audit history was not pushed. Source publication and actual fresh-checkout/install/check plus full224 unit/PostgreSQL evidence are documented in IMPLEMENTATION_STATUS.md. Raw per-path/per-database deletion records and protected-state comparison remain local in `.tmp/storage-cleanup-result.json` and `.tmp/cleanup-baseline.json`; private runtime data is not published.

The large audit ZIP can be recreated with `python3 scripts/audit-export.py`; previously saved archive checksums describe the former package, not a file still present after cleanup. All original tracked audit artifacts remain available locally. See ops/STORAGE_POLICY.md before future cleanup; never delete `.tmp` wholesale.
