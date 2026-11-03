# Current supervised local workflow — 3 November 2026

`pnpm dev:supervised` starts direct managed Node web/API/worker children with independent service recovery (worker failure preserves healthy API/web); it never resumes HALT or enables signing. Configure DATABASE_URL and optional public RPC endpoints locally exactly as below. For production-mode local preview, build first with the same API_PORT/NEXT_DIST_DIR, then set LOCAL_WEB_BUILD=1. A supervisor needs PostgreSQL; it waits/retries when the database is unavailable. Its session lock prevents a second identical profile; database identity binding denies a same-profile takeover from a different database, and private status under `.tmp/supervisor[-profile].status.json` distinguishes process state from readiness. Send SIGTERM to the validated supervisor PID to stop the whole managed stack; do not remove PID locks or kill unrelated processes. On hard parent death, restart the same command: matching tagged old-stack recovery is automatic. Windows uses the existing dev:local flow; this supervisor is POSIX only. OS boot installation, VPS hardening and duration qualification are not supplied by this command.

HARNESS signer diagnostics in Trades show durable token/fee/order reservations, certificate provenance, UNKNOWN/SIGNED identity and revocation. These are not live wallet balances or blockchain fills. Production code still rejects MAINNET signing. The `scripts/swap-fixture-worker.ts cycle` qualification path uses only the explicitly disposable TEST_DATABASE_URL, never the owner DB. UI/worker source identity is bound to the executed evidence; see latest IMPLEMENTATION_STATUS.md.

# Current receipt/audit workflow — 3 November 2026

Use the clean-checkout steps below with Node22.23.2/pnpm12.6.0/PostgreSQL15.19. Numbered migrations through031 are additive. Owner runtime remains HALTED if it was halted; no test or startup command resumes it. `/trades` distinguishes HARNESS orders, independently verified preflight proof and read-only finalized receipt observations. Empty successful evidence responses display NO_EVIDENCE. MAINNET signing/submission is disabled.

For a separate QA database, apply migrations via `DATABASE_URL=<QA URL> pnpm db:migrate`. Run `TEST_DATABASE_URL=<sentinel_r0 URL> TEST_EXECUTION_DATABASE_URL=<sentinel_execution_test URL> pnpm test:coverage:integration`; these URLs must never identify the owner database. Build QA with `NEXT_DIST_DIR=.next-qa API_PORT=4100 pnpm build`, then launch with `DATABASE_URL=<sentinel_d1_test_browser URL> LOCAL_RUNTIME_NAME=accounting-e2e LOCAL_WEB_PORT=3100 API_PORT=4100 NEXT_DIST_DIR=.next-qa LOCAL_WEB_BUILD=1 pnpm dev:local`. The browser command below uses the same disposable URL, localhost3100 and ignored QA credentials.

Receipt fixtures in tests/support are explicitly REPLAY_TEST, with ephemeral test-only signatures and invalid-on-chain blockhash. Public CP captures in tests/fixtures are genuine unrelated receipts tested offline for rejection; neither proves an application mainnet swap. Existing `scripts/swap-fixture-worker.ts cycle` uses the dedicated TEST_DATABASE_URL browser QA database and HARNESS_NOT_CHAIN; it persists eleven roles → order/attempt → BUY/protective SELL → FIFO/equity for audit. Do not call it against owner data.

# Current local product workflow — 2 November 2026

The historical foundation notes below are retained for audit; current code includes web/auth/PAPER/wallet-proof slices, not a qualified live trading release. From a clean checkout install pinned dependencies with `pnpm install --frozen-lockfile`, configure a local PostgreSQL DATABASE_URL and optional public SOLANA_RPC_HTTP_URL / SOLANA_RPC_WS_URL, leave all live/signer flags false, then run `pnpm dev:local`. It applies numbered migrations and starts separate web/API/worker processes. Owner credentials remain in ignored `.tmp/local-auth.json`; never paste them into chat or Git. Default addresses: localhost3000 / loopback4000. Production supervision/TLS and full qualification remain incomplete.

For production-mode local preview, run `pnpm build`, then `LOCAL_WEB_BUILD=1 pnpm dev:local` with the same local configuration. These are local software operations, not live activation. Global HALT persists; only an explicit authenticated owner action resumes OBSERVE. Tests must never clear the owner's HALT.

Run browser tests on a separate DB named `sentinel_d1_test*`, separate ports and separate credentials/PID:

```sh
NEXT_DIST_DIR=.next-accounting API_PORT=4100 pnpm build
# Terminal 1; supply only the disposable DB URL and public read-only endpoints locally:
LOCAL_RUNTIME_NAME=accounting-e2e LOCAL_WEB_PORT=3100 API_PORT=4100 NEXT_DIST_DIR=.next-accounting LOCAL_WEB_BUILD=1 pnpm dev:local
# Terminal 2; TEST_DATABASE_URL must identify the same disposable database:
LOCAL_AUTH_PATH=.tmp/local-auth-accounting-e2e.json PLAYWRIGHT_BASE_URL=http://localhost:3100 EVIDENCE_DIR=evidence/local-browser PLAYWRIGHT_REPORT=evidence/local-browser/results.json pnpm test:e2e
```

Set DATABASE_URL for Terminal1 and TEST_DATABASE_URL for Terminal2 to the disposable DB explicitly. Runtime profile names are bounded local labels, API binds loopback, and custom build directories are restricted to `.next-*` under the web app. Next regenerates type-reference files during builds; review generated diffs rather than discarding unrelated user edits. Canonical source excludes test build references. Sanitize traces using `python3 scripts/sanitize-traces.py evidence/local-browser` before export. Never run destructive integration tests on the owner observation database. `pnpm test:coverage:integration` also requires a separate TEST_DATABASE_URL.

## Historical M0 foundation notes

# Local safe backend foundation

Requires Node 22.23.2, pnpm 12.6.0 and PostgreSQL 15.19 (native or Docker). No dashboard or signer is shipped in this increment. API localhost:4000; worker runs independently. Do not open service token to public access.

macOS/Linux: install dependencies with `pnpm install --frozen-lockfile`. Copy `.env.example` to `.env`, keep flags unchanged, configure DATABASE_URL locally and an independent >=32-byte service token. Never put any wallet private key or seed in `.env`. Configure SOLANA_RPC_HTTP_URL for chain observation; without it worker explicitly records NOT_CONFIGURED. No LLM/Jupiter key is required for the included safe smoke test.

PowerShell: `Copy-Item .env.example .env`, configure the same local non-wallet settings using a trusted local editor, then `pnpm install --frozen-lockfile`. For Compose, set `$env:POSTGRES_PASSWORD` locally and run `docker compose -f ops/compose.dev.yml up -d`. Unix uses a local exported POSTGRES_PASSWORD. Set DATABASE_URL to match; the placeholder is not a usable password. Do not paste credentials to chat or command logs.

Run `pnpm db:migrate`, then `pnpm dev` from root. Alternatively run `pnpm --filter @sentinel/api dev` and `pnpm --filter @sentinel/worker dev` in separate terminals. `pnpm observe:once` performs one persisted provider cycle; `pnpm smoke:readonly` performs bounded public discovery and finalized-slot reads without DB writes. No swap is submitted.

`pnpm ops:health` reports DB state/providers; liveness GET /api/v1/health/live is public but says nothing about readiness. Readiness intentionally returns 503/M1_INCOMPLETE. All other API routes require an Authorization bearer service credential; browser origins/cookies are rejected. POST /api/v1/system/halt persists HALTED and audit. It prevents future authority and does not guarantee exits or recall broadcast transactions. There is intentionally no resume/live activation route yet. A halted disposable test DB stays halted until recreated; do not bypass this by editing production rows.

`pnpm check` runs lint, typecheck, unit/component/socket tests + domain coverage, compile, safe config and heuristic secret scan. It does not claim DB integration or browser coverage. Run `pnpm test:integration` only with TEST_DATABASE_URL pointing at a separate disposable PostgreSQL DB; migration and test audit records are retained there. Test DB URL must never be a production ledger. Evidence recorder: `python3 scripts/evidence.py evidence/M0 <label> pnpm <command>` saves output and exact exit status without environment values.

Stop API/worker with Ctrl+C (SIGTERM supported), then `docker compose -f ops/compose.dev.yml stop` if using Docker. Worker DB loss exits safely; current scaffold has no service supervisor yet. Encrypted backup/restore, deployment HTTPS, production secrets/roles, browser auth and financial recovery remain M3–M7 work and are NOT validated by these instructions. Production is NOT_LIVE_VERIFIED; do not fund a wallet for this scaffold.

## Current R1–R3 OBSERVE web runtime

The earlier M0-only notes above are historical. A working browser is now available. Next.js 16.4.3/React 19.3.1 frontend uses same-origin /api/v1 proxy; existing Fastify on 127.0.0.1:4000 and independent worker share PostgreSQL. Never put SERVICE_AUTH_TOKEN in browser JavaScript.

After configuring DATABASE_URL locally, run `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm build`, then `pnpm dev:local`. Optional `LOCAL_WEB_BUILD=1` starts the optimized web build; otherwise Next dev is used. SOLANA_RPC_HTTP_URL and SOLANA_RPC_WS_URL select approved read providers; public mainnet endpoints worked for small tests, not a production SLA. All live/signing flags stay false; copy execution remains SKIP. Windows uses `$env:LOCAL_WEB_BUILD='1'`; Unix `export LOCAL_WEB_BUILD=1` before launcher.

The helper generates a random local password, its salted scrypt hash and internal service token in `.tmp/local-auth.json` (permission 0600, ignored). Read your password locally in a trusted editor to log in at http://localhost:3000; do not paste this file or credentials into chat/evidence. There is no default password. This helper is for local development, not production secret provisioning. Manual `pnpm dev` still requires owner hash and service token configured securely; dedicated process startup is also available.

Current routes: `/`, `/discover`, `/agents`, `/risk`, `/wallets`, `/audit`, `/smart-wallets`, `/copy-feed`. Public watchlist takes up to two valid Solana addresses, never a seed/key. No address is preselected. Copy feed shows only finalized receipts when available, with UNKNOWN/native-rent limitations and SKIP. Eleven agent modules execute bounded observation evaluations, persist stages and vetoes, and expose full trace. Mint/security/sizing unknowns remain explicit. Persistent PAPER/SHADOW research sessions now work in /rules; /positions, /trades and /analytics project the same durable virtual ledger. They use explicit REPLAY scenarios, not an autonomous provider-driven paper service. /wallets supports authenticated nonce ownership proof through Phantom and finalized native-SOL balance; it never requests a transaction or exposes a signing key. /setup and /settings/integrations now expose read-only diagnostics; production configuration and real execution remain open.

Run `pnpm check` for strict backend+web typecheck, ESLint, money/engine/paper coverage gates >=95%, and both builds. For PostgreSQL integration and package coverage, set TEST_DATABASE_URL to a separate disposable DB, then `pnpm test:integration` and `pnpm test:coverage:integration`. `pnpm test:e2e` expects this locally running DB/API/worker/web stack and reads the ignored local test auth file; tests exercise real provider data. It triggers durable STOP: HALTED persists and observation continues. Never reset that state to start financial execution. e2e targets desktop/mobile, real session/CSRF, offline recovery, all agent trace stages, watchlist rejection and closed-tab worker continuation.

For a new phase set EVIDENCE_DIR and PLAYWRIGHT_REPORT to phase-specific paths. After browser tests run `python3 scripts/sanitize-traces.py <EVIDENCE_DIR>` before sharing or committing traces. It redacts local password/service/session/CSRF values and verifies the zip contents. Raw traces may contain session headers until this step. Then `python3 scripts/audit-export.py` creates a local sanitized source/evidence ZIP and hash manifest under ignored AUDIT_EXPORT; it refuses known local credentials. No public upload occurs.

Ctrl+C/SIGTERM on local launcher forwards to task process groups on macOS/Linux. Runtime is ordinary OS processes, independent of Codex/browser; computer sleep still stops reliable observation. Always-on supervisor, HTTPS, encrypted backup/restore and owner alerts are not qualified yet. Financial execution and G4/G5 remain blocked.

Encrypted backup and empty-target recovery commands, session-revocation behavior and verified disposable drill: see ops/BACKUP_RESTORE.md. Production backup key custody, offsite storage and recovery targets remain unqualified.

Autonomous PAPER/SHADOW setup, lease and provenance semantics, live read-only proof and test-only process-restart harness: ops/AUTONOMOUS_PAPER.md. /paper is distinct from manual regression /rules.

Current diagnostics distinguish worker heartbeat from component progress and provider transport/response/data/subscription dimensions. Software acceptance gates are shown on Setup/Integrations; missing evidence never becomes PASS. `worker_observation_samples` is append-only data for later continuity analysis, not a completed soak report. The observer may be healthy while global HALT blocks new PAPER entries. Owner HALT/ENABLED settings are preserved; resume only on a disposable test runtime unless the owner explicitly instructs otherwise. Decision audit includes exact source receipts and ledger lineage; PAPER has no chain signature.

## Execution qualification harness (nonfinancial)

`TEST_EXECUTION_DATABASE_URL` must point to a distinct disposable database whose name contains `execution_test`; run it alongside the separate `TEST_DATABASE_URL` when executing `pnpm test:coverage:integration`. Without that explicit URL, execution database tests are SKIPPED, not PASS. For the browser fixture runtime use its `sentinel_d1_test_browser` database and profile3100/4100. `TEST_DATABASE_URL=.../sentinel_d1_test_browser pnpm exec tsx scripts/execution-fixture-worker.ts run` executes a labelled native-transfer bank model only when that test runtime is OBSERVE. `crash` terminates the worker with exit88 after model submission; `recover <order-id>` queries the durable model receipt using the existing signature, never creates another submission. Do not resume the owner database to run fixtures.

Trades → Execution qualification exposes the read-only order/attempt/receipt/ledger and eleven-role fixture trace. There is no browser order-creation or signing route. Model keys are ephemeral subprocess memory, never imported from the owner. Harness uses a fixed non-mainnet blockhash and separate database tables. Jupiter swap instruction support, production signing mandates and chain settlement are not qualified by these tests.
