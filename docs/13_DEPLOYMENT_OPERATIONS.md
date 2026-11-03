# 13 — Local Development, Self-Hosting, Observability, Recovery

## A. How operator will use it

Codex runs in VS Code/CLI to **build** application, not act as perpetual dashboard engine. For local development, developer starts PostgreSQL via Docker and web/API/worker via `pnpm` scripts generated in M0; dashboard at `http://localhost:3000`; backend independently ingests market and publishes via SSE. Browser can close, worker continues while computer is awake. For truly unattended 24/7 use always-on secured self-host or VPS with restricted network, persistent DB, internal signer, HTTPS reverse proxy and health/alerts. Do not bind development control API to public 0.0.0.0 without auth/TLS.

## B. Required reproducible developer commands (Codex creates scripts)

- `pnpm install --frozen-lockfile` after lockfile generated.
- `docker compose -f ops/compose.dev.yml up -d` for PostgreSQL.
- `pnpm db:migrate` and `pnpm db:seed:safe` with **PAPER-only illustrative** fixtures, not live wallet content.
- `pnpm dev` runs all relevant development services with visible status; `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`, `pnpm check` aggregate gates.
- `pnpm ops:health` shows RPC, provider, DB, signer LOCKED, policy caps and machine timestamp.

Actual commands are targets for implementation, not claims that scripts already exist. Pin exact pnpm version at M0 and configure Windows PowerShell setup plus Unix instructions. Docker Desktop/Node permissions may differ; provide alternate troubleshooting.

## C. Production hardening

- Strong session/login and recovery mechanism, CSRF and rate limit, no default admin password, TLS, restrictive CORS/CSP, secure cookies, process as nonroot, least privileges, firewall allowlist, secret manager, audit encryption, time sync, automatic updates only with gated rollback.
- Web/API outward-facing; worker and signer private; signer never exposed to Internet; DB network private; endpoint `send` cannot be called from browser.
- DB backups encrypted, scheduled and restore-tested; keep ledger provenance; snapshots cannot alter chain history. Secrets backups separate and protected; owner must understand hot-wallet restore and rotation.
- Deploy preview first with signer disabled, then owner-approved activation policy; restart always defaults signer LOCKED until safe checks and mandated activation are reconciled.
- Latency from VPS to RPC/DEX matters but never guaranteed. Logging of market feeds must have bounded retention; services quotas tracked.

## D. Alerting and metrics

Expose to owner: last RPC event and freshness, WS connection health, queue depth/age, provider 429, quote errors, signer rejection, pending UNCERTAIN, chain confirmation p50/p95, balance reconciliation mismatch, daily fee budget, remaining trading limit, process restarts, DB storage, risk breach, failed exits, release version. Alerts by owner-approved channel (email/Telegram/webhook optional); if alerts cannot deliver, high-risk unattended mode may need HALT.

## E. Operator incident runbooks

**RPC/DEX outage:** halt new buys, persist timestamps, retry read-only queries with backoff, reconcile account state after recovery, only resume if policy fresh.

**Transaction UNCERTAIN:** freeze duplicate intents, query signature/history and balances, classify settled/failed only with chain proof, alert user if prolonged. Do not resubmit a different transaction automatically.

**Wallet balance mismatch:** HALT, fetch all token accounts and transaction history, reconcile rent/fees/airdrop/manual transfers, do not write corrective ledger fiction without evidence.

**Potential key compromise:** immediately disable signer/new entry, alert owner to manually move remaining funds to fresh secure wallet where safe, rotate secrets, preserve logs and audit blast radius; never ask user to send phrase to support/AI.

**Rug/illiquid token:** halt fresh buys, label position exit blocked and possible complete loss, attempt bounded exits only under authorized policy; no guaranteed sell.

**DB corrupted or server lost:** restore backup to isolated environment, run read-only chain reconciliation before any new signing. Verify policy and owner mandate have not expired; default HALT.

## F. Beginner workflow (manual exchange interactions)

1. Select an exchange from current OJK official list, finish provider-mandated registration/KYC. Check SOL and **Solana network** deposits/withdrawals supported; fees and withdrawal minimum.
2. Acquire SOL with clearly affordable exposure and review provider spread/fees; never send crypto to a wallet that the owner has not verified.
3. Install Phantom from official source, secure recovery phrase offline without photographing/sharing it; practice tiny test transfer.
4. Connect Phantom to dashboard for read-only visibility. Dedicated trading wallet is separately provisioned securely; fund tiny amount only when code/gates ready.
5. For withdrawal, manually stop new trades, close positions if sellable, verify chain receipts and transfer to own Phantom/exchange deposit address with tiny test; sell SOL on compliant exchange and withdraw IDR. KYC/cashout is outside automated bot and is not guaranteed instantaneous.

See `14_BEGINNER_GUIDE.md` for concepts and checklists.

## Current encrypted backup implementation — 3 November 2026

`pnpm ops:backup` now streams PostgreSQL custom-format output through AES-256-GCM into a private exclusive temporary file, fsyncs and atomically publishes without overwriting a recovery point. FormatV2 is bounded at2GiB, ten-minute child timeout; memory does not grow with the full dump. `pnpm ops:restore` authenticates the entire pinned encrypted file before opening a restore consumer, accepts existing V1 archives, requires an empty explicit target and `CONFIRM_EMPTY_DATABASE_RESTORE=true`, then uses a single PostgreSQL transaction. No plaintext dump is written. Supply DATABASE_URL, BACKUP_FILE and BACKUP_PASSPHRASE_FILE locally; keep the passphrase file private and separate from exported source. Do not put it in chat or repository.

`verify-restore.ts` compares deterministic table digests in read-only repeatable-read transactions using bounded cursor batches, deliberately excludes revoked browser/wallet authentication records and verifies restored audit immutability. Current QA drill restores a66MiB encrypted archive; full hash comparison and negative authentication/overwrite tests are evidence, not a production RTO/RPO guarantee. Larger-than2GiB archives, ten-minute operational limits, production retention/alerting/topology and disaster recovery qualification remain explicit deployment scope.
