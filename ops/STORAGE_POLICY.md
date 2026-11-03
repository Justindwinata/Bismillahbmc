# Local storage policy

Keep source, lockfile, tests, migrations, current requirements/runbooks and the readiness manifest/attestations under version control. Publish with `python3 ops/publish-source.py --push`; never push the historical local audit branch directly. The source publisher uses an isolated Git index and normal fast-forward push, preserving the working tree and remote history.

Do not upload `.env`, `.tmp`, local credentials, databases, wallet material, encrypted backups or generated builds. Do not delete `.tmp` wholesale: it contains the actual observation database, local authentication and backup decryption material. Keep the latest verified backup together with its private decrypt material. Never manually remove PostgreSQL data/WAL files.

Old generated `.next-*`, coverage, dist, temporary reproduction installs and duplicate audit exports are rebuildable after confirming no running process uses them. Completed isolated restore databases may be dropped only by exact name after checking zero active connections, retaining a verified recovery point and comparing protected owner state before/after. Primary QA and observation databases remain unless their owner explicitly authorizes a reset. Preserve audit evidence needed for provenance; screenshots/traces stay local instead of bloating public source history.

A fresh clone needs `pnpm install --frozen-lockfile`; generated build/coverage files are recreated by the documented checks. See DEVELOPMENT.md and BACKUP_RESTORE.md. Cleanup is nonfinancial and never resumes HALT or enables signing.
