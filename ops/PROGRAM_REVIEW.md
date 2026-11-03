# CPMM technical review registry

This registry qualifies only PAPER/SHADOW pool evidence. It never grants mainnet/signing authority. Current source ships **no approved mainnet revision**. A successful chain read is not a technical review. No API or browser endpoint creates reviews; use the local administrative CLI with a DB credential explicitly permitted to administer the registry. Production role isolation remains a separate unfinished operations gate.

Review a reproducible executable/source build, supported raw layouts, token/config/vault semantics and declared limitations independently. Retain the actual review artifact and its SHA256. Create a JSON manifest with exact fields `genesis`, `program`, `codeHash` (ProgramData bytes after loader header), `evidenceHash` (review artifact file), `reviewer`, `reviewReference`. The CLI does not discover or fill these values. A discovered executable digest alone is not an acceptable review artifact.

Record only an actual completed technical review:

```
DATABASE_URL=<local-admin-db> pnpm exec tsx scripts/program-review.ts record /absolute/review.json /absolute/review-evidence.md
```

Revoke a review:

```
DATABASE_URL=<local-admin-db> pnpm exec tsx scripts/program-review.ts revoke <review-uuid> 'specific technical reason'
```

Manifest fields are strictly validated and evidence bytes must match the declared digest. Review and revocation records reject UPDATE/DELETE; each administration change emits an audit/outbox event. The shared paper-commit advisory lock serializes revocation and virtual fills. Revocation is idempotent. Resolve requires exact mainnet genesis, declared CPMM program and current executable hash. Pending proposals must recheck the exact review ID/hash inside the atomic ledger transaction; revocation or missing review denies the fill. A replacement review must be explicit, never automatic after an upgrade.

The old `PAPER_CPMM_PROGRAM_HASH` environment approval no longer authorizes the runtime. Public read-only sampling without a DB registry also returns UNKNOWN. Regression tests use explicit fixture review records only on disposable databases; those are not real mainnet review evidence.
