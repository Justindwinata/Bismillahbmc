# Current decision — preserve healthy services during worker recovery

Observed worker dependency failure previously restarted API/web and disrupted owner browser login. Supervised direct Node service children now restart independently; bounded market reads reduce historical enrichment work. Market dependency retries persist sanitized audit/outbox, preserve failed-closed financial authority and do not update successful-cycle timestamp on failure. No cause beyond observed dependency failure is asserted for the old outage. Actual service-PID preservation is qualified by SIGKILL in isolated QA; local process availability is distinct from release readiness and 24/7 deployment qualification.

# Current decisions — signing boundary and process supervision

Owner/Governor test certificates use separate ephemeral authority keys and domain-separated canonical messages. They are HARNESS fixtures, not owner financial consent or production provisioning. The configured isolated child verifies certificates before key use, in addition to raw wire/static harness policy; signing journal verifies the returned Ed25519 identity independently. Persist certificates and conservative max-fee/token reservations; never turn a timeout into another signing request. Distinct request IDs for identical unsigned wire are rejected globally. Revocation/kill switch and commit-time freshness are separate vetoes; no automatic budget refund for unknown signed outcomes. Legacy model order signatures are hex; new protocol signatures encode the same64 bytes in base58. Both remain labelled HARNESS_NOT_CHAIN.

Supervisor profile ownership uses a PostgreSQL session advisory lock so hard process death releases ownership. Recover an old stack only when its persisted random nonce matches the actual dev-local command; never kill a bare PID from a file. One process group contains supervised descendants; keep independent legacy dev-local behavior for ordinary development. Report PROCESS_RUNNING_NOT_READINESS explicitly. No environment/default/UI toggle can convert this local nonfinancial supervisor or protocol into a live signer. Production integration and OS-level deployment remain separate unqualified work.

# Historical decisions

# Current decisions — swap receipt observation and backup streaming

Receipt verification is distinct from authority and portfolio accounting. Immutable original preflight proof/time and unsigned bytes bind a historical signed transaction; a read-only worker reconciles finalized metadata/CPI/balances but cannot create an execution or credit a portfolio. REPLAY_TEST source never upgrades to chain settlement. Existing-account SPL/WSOL zero-rent scope remains explicit; required ATA/wrap/close/rent support and disabled production order/signer integration remain CODE.

Actual675MiB QA database growth exposed the old50MiB in-memory backup cap. Preserve failure evidence; use authenticated streaming V2 with V1 restore compatibility, exclusive encrypted output and pre-consumer authentication. Restore verification streams cursor batches in repeatable-read snapshots. Add a decision-id lineage index after an actual full-suite timeout demonstrated a sequential historical JSON scan; do not raise timeouts or relax trading freshness. Source/provenance manifests remain bound to executed code identity; no release gate is manually promoted.

# Historical decisions

# Engineering decisions — 2026-11-01

Status: engineering baseline for implementation; no financial authorization. Original ADR-001..012 in docs/17 remain authoritative. New entries use ADR-013 onward to avoid ambiguous IDs.

## ADR-013 — Roadmap precedence and safe configuration

Use docs/12 M0–M8 numbering; PRD section 15 has older milestone assignments. Product requirements still follow PRD; safety follows AGENTS and stricter constraints. The PAPER default in docs/14 is educational only: executable defaults are OBSERVE. `SIGNING_ENABLED` in one PRD scenario is a typo; canonical flag is `SIGNER_ENABLED`. Both live flags, LLM and telemetry are false, budgets zero; current bootstrap rejects any enlargement rather than accepting environment-only activation. Owner-reviewed policy changes are future work, never edits to silently unlock bootstrap.

## ADR-014 — Executable toolchain

Node 22.23.2, pnpm 12.6.0 (already installed), TypeScript 6.0.3, Fastify 5.12.7, Zod 4.6.7, pg 8.23.1, YAML 2.9.1, Vitest/coverage 5.0.5, ESLint 10.14.0, typescript-eslint 8.72.1, tsx 4.23.15, fast-check 4.10.2. Exact versions and transitive resolutions are in package.json/pnpm-lock.yaml. Node 22 is an available maintenance LTS alternative to the suggested Node 24; no host-wide upgrade. TS 7.0.2 was rejected after actual peer compatibility check (`typescript-eslint` requires <6.1). Node upgrade to 24 requires a separate tested lock/toolchain revision. Only esbuild's reviewed native-binary installer is allowed to run; no blanket lifecycle approval. Install includes a 24h minimum release age.

Next.js App Router 16.4.3 is the verified frontend selection, not yet an installed or tested web application. React and Playwright will be pinned together in the first browser increment. SDK boundary: direct typed read-only Solana JSON-RPC now; use @solana/kit for M4 decoding/signing after an isolated verifier spike (registry candidate 8.6.0). Do not import signing SDK into browser/agent modules. SDK acceptance and complete intent schemas remain open.

## ADR-015 — Processes, contracts and storage

`apps/api`: localhost-only Fastify versioned service API. `apps/worker`: independent polling loop, no browser dependency or wallet credentials. `apps/web`: reserved Next.js delivery boundary, no fabricated UI. `packages/domain`: strict runtime config, exact money, freshness, states, role catalog. `packages/connectors`: bounded read adapters, timeout, circuit breaker, no submission method. `packages/storage`: PostgreSQL transactions/migrations. Future strategy/risk/accounting/replay/signer packages remain separated by authority.

PostgreSQL 15.19 is locally available and used in tests; Compose selects the same major/minor. Docker daemon unavailable, so tests use an isolated disposable native cluster. No SQLite substitute. Production DB image digest and least-privilege roles must be frozen during deployment; current Compose is development-only.

M0 schema: system_state, source_snapshots, provider_health, audit_events, outbox_events, schema_migrations. Migrations are transactionally advisory-locked and hash-checked. Source dedupe + audit + outbox commit atomically. Append-only UPDATE/DELETE triggers are defenses against accidental runtime edits, not tamper-proof protection against a DB administrator/TRUNCATE. No live ledger or risk-budget claim yet. M2–M4 add all normalized entities specified in docs/09, with serializable account reservations, immutable policy revisions, owner activations, intents/attempts, receipts, lots and separate paper/live ledgers.

Canonical identity is chain+32-byte base58 mint; decimal money is integer string/BigInt. In-flight lifecycle preserves UNCERTAIN; no edge returns it to sign or submit. A boolean chain-proof parameter is a domain test boundary, not a production receipt verifier. M4 must require independently validated receipts and reconciliation.

## ADR-016 — Authority and signer boundary

All eleven agent contracts are those in docs/03: DESK session, Scout candidate, Filter assessment, Rug Check veto, Analyst evidence signal, Strategy proposal, Sizer bounded amount, Guard deterministic veto, Executor lifecycle, Logger durable audit, Equity reconciled inventory/PnL. Current code implements foundation contracts and observation persistence only; it does NOT implement eleven autonomous roles. Guard's bootstrap veto always denies execution.

Phantom primary connects by public provider/sign-message nonce challenge; connection grants no trade permission. A separate, low-balance trading wallet is manually provisioned by owner. Executor-to-signer uses private Unix socket/mTLS and independent policy enforcement; signer remains absent/disabled until M4 test harness. No private key generation, import, mainnet signing, transfer or paid API usage occurs in this increment.

Service auth in M0 uses >=32-byte owner-configured bearer token, timing-safe compare, no query credential, localhost binding, no-store, no raw signing routes. Browser Origin and cookie requests to protected routes are rejected. This is NOT browser authentication/Phantom login. M2/M3 must add nonce replay protection, owner sessions, reauthentication, HttpOnly/SameSite cookies, CSRF, rate limits, CSP, RBAC and authenticated SSE. Never expose M0 service token to a browser bundle. Readiness deliberately returns 503 while M1 is incomplete.

## ADR-017 — Provenance, providers and UI

LIVE_PROVIDER discovery leads do not imply chain verification, complete market data, security PASS or tradability. DEX profile receipt time is not source time: sourceAt/slot remain null. Hash is of the normalized stored snapshot (not the entire HTTP response). No liquidity, prices, balances, PnL or fills are invented. Chain observation uses full mainnet genesis identity and a finalized safe integer slot. Public endpoint availability is not production capacity evidence.

Dashboard direction follows refs: original charcoal terminal with subdued magenta, text status, overview/agent pipeline/copy feed/risk/positions/audit/setup pages; unknown financial values stay unknown. All agent activity comes from backend stage events. SSE will resume by durable sequence, never authorize trades. Exact user-facing implementation/Playwright is still NOT_RUN.

Jupiter path is `/swap/v2/order` plus `/execute`, distinct from `/build`. Only harmless no-taker quote feasibility was exercised. `transaction:null` is not an executable order. Before M4, recheck transaction schema, fee units (priceImpact vs priceImpactPct), supported token extensions, ALT and routing programs. No provider response is authority to sign. Full response is verified independently.

## ADR-018 — Release and external gates

Release stays NOT_LIVE_VERIFIED. G2 requires >=7-day observation target; G3 requires actual 24h shadow and independent security review/restore/chaos evidence. Short test runs cannot satisfy durations. G4/G5 require separate owner activation and actual chain proofs. Do not conflate successful M0 checks with these gates.

Initial dependency audit found one moderate dev-only minimatch advisory GHSA-g3hv-75wg-m249 (<11.0.1). After reviewing the advisory, Node engine requirements and CommonJS/ESM exports, override only minimatch@10.2.6 to 11.0.1 in pnpm-workspace.yaml. Full lint/typecheck/tests/build and frozen install passed with the patched resolution; subsequent pnpm audit --json reported zero advisories. Revisit this explicit transitive major override when upstream toolchain supports the patch natively. No untrusted user globs enter the development toolchain. An empty advisory database result does not replace independent security review.

## ADR-019 — R1 authenticated browser slice and event order

R0 checkpoint 5e853258366c15f637e0150a8bb840947662ad3d preserves all prior valid work. R1 installs Next 16.4.3, React/DOM 19.3.1, corresponding types 19.3.0 and Playwright 1.64.1. Existing API/worker/storage extended, not replaced. Next-generated apps/web/AGENTS.md is retained; relevant installed routing/client-component docs consulted.

Browser uses same-origin Next proxy to localhost Fastify. Owner password has no default; local helper generates random development-only credentials in ignored permission-0600 .tmp/local-auth.json. Password uses salted scrypt; session cookies HttpOnly/SameSite=Strict (Secure for HTTPS), tokens hashed in PostgreSQL, expiry 2h, mutation requires exact origin+CSRF. Login throttles failed attempts; successful authentication clears that failed-attempt budget. No service token enters client bundle. Phantom binding remains R4. CSP intentionally does not add unsafe-eval for dev convenience; final browser proof uses optimized build. Production CSP nonces, stronger owner reauth and deployment hardening remain open.

All outbox-writing transactions take the same advisory lock before ID allocation. This prevents a committed cursor skipping a lower ID from a delayed transaction. Snapshot uses repeatable-read with cursor; SSE resumes from Last-Event-ID or validated cursor, batches 100, bounded connections/15s leases and rechecks durable session. Client explicitly reconnects after offline/online and retains its last monotonic cursor. This fixed actual failing reconnect tests rather than weakening assertions. Health changes publish durable events; STOP is now idempotent. Migration runner verifies and applies all sorted forward SQL files.

R1 UI is honest OBSERVE: live profile and pair observations, chain slot, provider receipt age, audit details, six routes, locked signer, wallet not connected and equity unknown. Eleven unexecuted roles are explicitly NOT_RUN. Pair market metrics remain LIVE_PROVIDER estimates with source timestamp unknown; receipt age is not chain finality. No wallet/signer or PnL fiction.

Local launcher starts independent API/worker/Next child process groups, forwards shutdown and has optimized-web option. Earlier pnpm-only termination left child orphans; task-owned orphan processes were identified by cwd/source and stopped, then group shutdown fixed. Playwright traces start after password entry and are sanitized for ephemeral session/CSRF/service values before checkpoint/export. A clean audit reports zero advisories for the installed lock at this checkpoint.

## ADR-020 — Bounded wallet observation and WS

R2 adds two owner-selected public-address watch slots, finalized receipt backfill with signature/slot/genesis checks, atomic dedupe+cursor, owner/token-account identity and exact base-unit deltas. Native SOL rent and unsupported routes stay UNKNOWN; only recognized Jupiter program plus two opposite owner SPL deltas becomes SWAP_CANDIDATE, always copyEligible=false / SKIP. This is observational evidence, not an authorized mirror order or profit calculation. No address is invented/added to the live watchlist by the developer.

First history is explicitly a bounded 20-receipt window. An existing cursor with >=20 new signatures freezes advance as BACKFILL_GAP_REQUIRES_REVIEW; complete pagination/indexer recovery remains open. WS subscriptions use one address per finalized logs filter, bounded reconnect/watchdog; slotSubscribe yields processed notifications only and cannot replace independently finalized HTTP slots. Real public WS smoke succeeded. Worker monitors independently of browser. Initial WS advisory state and nullable source timestamps remain transparent. No claimed zero-latency mirror capability.

Pair projection now chooses greatest reported liquidity per mint instead of arbitrary last returned pair. Time-lag quantiles use only actual wallet receipt blockTime/receivedAt when available, no artificial samples. Full wallet quality/fee/rent attribution/reorg/provider-fallback qualification remains incomplete; no live wallet trade proof until owner configures a public address and actual receipts are observed.

## ADR-021 — Executable observation council and isolated PAPER accounting library

R3 baseline executes eleven independent typed functions in worker order and atomically stores the complete stage trace, immutable decision, policy/input/output hashes and outbox. Live input is bounded to five market mints per cycle (not an exhaustive low-latency token scanner). Receipt freshness changes affect dedupe identity. Browser agent cards now reflect actual saved stages and allow full decision drilldown; there is no fabricated chat/LLM. Unavailable on-chain mint/holder evidence is explicit UNKNOWN; default Guard/Sizer/Executor veto/zero/SKIP. Market filter and strategy deliberately cannot authorize entries without owner-tested criteria. This is a working observation baseline, NOT completed trading strategy/security/sizing implementation.

PAPER ledger is an independently tested exact FIFO library, separate from live chain data: partial lots retain rounding remainder, capital flows do not become profit, fees/rent are distinct, invalid/unfillable/duplicate-conflicting fills rejected, unpriced inventory stays UNKNOWN. No runtime PAPER/SHADOW session/persistent ledger/exit engine is claimed yet. A REPLAY fixture can exercise fills but cannot enter a LIVE ledger. LLM remains disabled.

Coverage now includes per-package reporting with >=95% branch/line/function/statement gates for domain, engine baseline and paper library. Latest combined unit+DB run: 44 tests, domain branches 97.56%, engine 96.07%, paper 97.22%; overall measured source branches 81.05%/lines 90.06%. This is not 95% coverage of the whole application. Browser execution is reported separately (12 tests).

The R2 checkpoint contains initial unintegrated engine/accounting drafts; they were not runtime-wired nor represented as completed R3 at that point. R3 checkpoint adds actual worker integration and executed tests. Later frozen-install check caught absent importer entries for these new workspaces; declared exact package-local dependencies and workspace links, regenerated lockfile, verified frozen install both in-place and in a clean manifest-only directory with 233 cached packages. pnpm 12 lockfile has two YAML documents (boot + application); scanners must read both (https://pnpm.io/lockfile). Earlier frozen passes do not substitute for this final workspace validation.


## ADR-022 — Research authority and durable nonfinancial sessions

PAPER/SHADOW accept only a strict versioned virtual policy. The unchanged real bootstrap policy remains OBSERVE, zero live exposure and signing disabled. Deterministic Guard independently rechecks security, freshness and size; forged upstream PASS cannot grant authority. Authority NON_FINANCIAL_ONLY cannot submit transactions. Missing provider source time is never invented: bounded receipt age requires independently finalized same-mint chain evidence. Regression UI accepts named committed REPLAY scenarios only; it cannot forge LIVE evidence through request JSON. Durable virtual balances/account state override caller fields. Global advisory transaction lock serializes HALT with journal decisions, immutable request keys provide idempotency, and append-only journal reconstructs FIFO state on restart. Full production reservations/signing lifecycle remains separate future work.

## ADR-023 — Conservative on-chain screening and bounded observation

Finalized SPL mint and token account reads validate program, authorities, amounts, ownership and context slots. Largest-20 holders cannot prove complete distribution unless their exact sum equals mint supply; partial samples stay UNKNOWN. Unsupported Token-2022/extensions stay denied. This is intentionally incomplete security qualification, not a universal rug score. Official method contracts checked: https://solana.com/docs/rpc/http/getaccountinfo , https://solana.com/docs/rpc/http/gettokenlargestaccounts , https://solana.com/docs/rpc/http/getmultipleaccounts . getTokenLargestAccounts supports commitment only; minContextSlot is used on getMultipleAccounts and slots are independently compared. Latest market candidates are sorted after per-mint deduplication; worker considers five newest with stable fairness for ties. Wallet pagination is bounded to five pages and never advances an existing cursor without finding its watermark. CPI detection is observational only, not copy authorization.


## ADR-024 — Ledger projections preserve provenance

Positions/trades/analytics select a durable research session rather than blending simulated activity with chain balances. Realized-PnL chart coordinates use integer scaling; labels and financial values preserve exact lamports. Open inventory has no invented mark or unrealized equity. Date filters apply to chart/trade observations, cumulative session totals remain explicitly cumulative. Existing authenticated API supplies the same persisted evidence for rules and ledger pages.


## ADR-025 — Phantom proves identity, never unattended execution authority

Existing owner-password session remains the ownership bootstrap. A wallet cannot self-enroll as application owner: it must sign a server-created challenge within an already authenticated CSRF-protected session. Exact message is stored server-side, origin/domain, mainnet network, random nonce, request ID and two-minute expiry are fixed; successful or failed verification consumes the challenge. Node built-in Ed25519/SPKI verification avoids an extra runtime crypto dependency. Binding grants READ_ONLY_IDENTITY and expires with/deletes alongside the browser session. Disconnect consumes outstanding challenges and audits revocation. Only native finalized balance is exposed; public-provider failure is unknown, never zero. Test keys are ephemeral fixture identities in memory, never owner or trading keys.

Official contracts checked: https://docs.phantom.com/solana/establishing-a-connection and https://docs.phantom.com/solana/signing-a-message . Message signing is fee-free ownership proof; this does not sign a transaction. Balance method https://solana.com/docs/rpc/http/getbalance . Real production Phantom/mobile coverage and full token portfolio reconciliation remain open.


## ADR-026 — Authenticated recovery never restores old login authority

Backup CLI uses bounded pg_dump custom output, AES-256-GCM with random salt/nonce, PBKDF2-SHA256 600,000 rounds and a private local passphrase file. Secret connection data goes in child environment only; output never includes command credentials or tool stderr. Encrypted output uses synced private temporary file and atomic non-overwriting link. Restore requires an explicitly selected empty database and rejects unauthenticated archive before PostgreSQL access. All restored sessions and wallet challenges/bindings are revoked so an old backup cannot resurrect revoked login cookies. Restore adds an audit event; consistency drill compares all business tables while explicitly accounting for auth revocation and this recovery event. Memory limit 50 MiB and local PostgreSQL15 validation are current limits. Production custody/remote TLS/offsite drill remain open. Crypto contracts checked against https://nodejs.org/docs/latest-v22.x/api/crypto.html and PBKDF2 work-factor guidance https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html . This is not an independent cryptographic review.


## ADR-027 — Diagnostic completion is distinct from trading readiness

Setup and integrations query actual system/session/wallet/research/readiness endpoints. HTTP503 RELEASE_NOT_QUALIFIED deliberately remains until full software/security/operational gates are met. CHECKED means diagnostics ran, never permission to trade. Browser never accepts production secrets or enlarges risk. Jupiter current official OpenAPI was reviewed at https://raw.githubusercontent.com/jup-ag/docs/main/openapi-spec/swap/v2/swap.yaml : taker omission yields quote-only/no transaction; /execute is a signed-transaction submission, not independent finality proof. Its transactionVersion ceiling can include v1 and needs qualified SDK/verifier support. No Jupiter signing/execution implementation is claimed in this increment.


## ADR-028 — Autonomous virtual execution is a durable fenced worker workflow

Immutable research sessions attach to owner-created automations. Per-mint jobs, expiring lease tokens, one active lease per virtual account, bounded queues and atomic reservation record prevent concurrent account execution. Global transaction lock rechecks HALT/current ledger, rejects superseded/expired tokens and commits virtual fill/journal/eleven events/post-accounting equity/outbox/job release together. Crash before commit cannot produce a fill; after commit cannot produce a second acknowledgment/fill. Production worker only accepts LIVE_PROVIDER scope; REPLAY_TEST process is restricted to loopback disposable database names and cannot use Replay API for automation. Quote-only no-taker/no-transaction adapter binds identities, amount, slippage floor and RFQ expiry. Missing or stale evidence is SKIP. No real signing capability is introduced.

## ADR-029 — Provider failover and PAPER cost/valuation truth

DEX outage prompted a genuine independent Jupiter Tokens V2 feed, not fabricated profile rows. Token metadata preserves source time and provider identity, missing venue/volume/liquidity stays unknown and never becomes chain security. Primary sources: https://raw.githubusercontent.com/jup-ag/docs/main/tokens/token-information.mdx and https://raw.githubusercontent.com/jup-ag/docs/main/openapi-spec/swap/v2/swap.yaml . Takerless zero fee/payer fields do not establish free execution. PAPER model samples finalized fee-for-message, recent priority units and SPL rent minimum; two signatures/max compute/sample upper priority/one rent charge are explicit conservative simulation assumptions. All charges enter FIFO cost/proceeds, with raw breakdown persisted. No rent refund is presumed. Estimated liquidation equity needs fresh quantity-matched exit quotes; otherwise unknown. Full pool/LP qualification and separate capital/refund commands are not claimed complete.


## ADR-030 — Parsed unsupported extensions and one-sided concentration evidence

Recognizing Token-2022 in read-only RPC does not grant trading support. Persist program/decimals/extension names and raw states, but deny unsupported transfer semantics including metadata-only mints until program/transaction qualification. Official matrix reviewed: https://solana.com/docs/tokens/extensions . A partial holder sample cannot establish complete distribution, but an owner already above a concentration cap is a valid lower-bound veto. Evaluate that proven violation before the completeness UNKNOWN check; never grant PASS from incomplete data.


## ADR-031 — Performance reports cannot substitute for validation

Use complete ordered session journals; win denominator counts all fully closed outcomes, partial exits aggregate until inventory closes. Fee/rent-adjusted realized deltas and FIFO cost remain exact BigInt/rational strings. Wilson95% uses binomial sample uncertainty, never a guaranteed win rate. Drawdown net of capital flows is only observed known-equity lower bound when gaps exist. REPLAY/forward scope mixing and future information reject the report. Temporal embargo retains all excluded rows explicitly. UI/API state STRATEGY_NOT_VALIDATED until actual point-in-time out-of-sample/forward evidence exists. Quote-to-chain-fill deviation is null without verified chain fills, never zero.


## ADR-032 — Virtual input cap and all-in risk cap are distinct

maxPositionLamports caps swap input notional; aggregate exposure uses FIFO cost including all modeled network/priority/rent charges. Reserve those charges from the remaining exposure before sizing. Exclude pending reservations from cash as well as exposure. Daily loss entry gate conservatively adds known realized daily losses, current cost exposure, pending reservation and proposed input+charges; it cannot treat an unpriced position as no risk. Exit quote/gas checks remain required. These only tighten virtual research policy; actual trading caps/signing remain zero/disabled.

## CP1 / CP2 — bounded pool proof and independent protective exit

Raydium CPMM WSOL/legacy-SPL is the first declared pool security scope; raw program-owned state, same-slot vault/mint/config/programdata, positive principal reserves, account controls/backing and non-redeemable LP supply must be verified. LP supply deficit includes initial unminted lock and is explicitly not a verified locker/burn event claim. Upgradeable executable requires reviewed SHA256 pin; never promote an observed hash automatically. Unsupported venues/fees/extensions remain closed. Official source URLs, digests and upstream license copies are retained in evidence/CP1.

Entry eligibility and exitability differ: holder concentration, mint authority, reduced entry liquidity or redeemable-LP entry veto can trigger liquidation of existing virtual inventory only when fresh independent transfer+pool+full-size direct quote proof exists. Frozen tokens, unknown program revisions, absent reserves, stale/wrong route or HALT deny execution. Failed exits preserve inventory and emit durable audit/outbox alerts. PAPER reservations are actual lease-backed amounts, enforced at commit under existing advisory lock; independent virtual sessions are not production shared-wallet budget proof.

Real CPMM program evidence exceeded the default1MB transport bound (~1.062MB). A pool-specific2MB streamed bound and schema limit replaces this CODE defect; general transport remains1MB, >2MB is still rejected. Regression tests exercise both bounds. Real evidence now reaches revision review and correctly stays UNKNOWN. No financial policy enlarged; no signing added.

## CP2 — nonpositive net exit proceeds

A quote with output <= modeled fees is EXIT_UNAVAILABLE_NET_PROCEEDS. It cannot be used as an executable paper liquidation mark or passed to the ledger as a profitable/feasible fill. Retain inventory and UNKNOWN valuation until a fresh usable quote exists. No change to mainnet authority or risk caps.

## Lockdown P0-A: technical review is durable, revocable, and separate from financial authority

Raw environment hash no longer authorizes runtime pool eligibility. Exact mainnet/CPMM/code hash review records and append-only revocations use PostgreSQL and audit/outbox; the shared ledger advisory lock orders revocation against virtual commit. Worker resolution failure or missing review stays UNKNOWN. CLI validates external review-artifact digest; it never discovers or auto-approves a code hash. This is local technical administration only, with production DB role isolation still an unfinished operations gate. See ops/PROGRAM_REVIEW.md. Official references verified: https://solana.com/docs/core/programs/program-deployment and https://github.com/raydium-io/raydium-docs-v1/blob/main/reference/program-addresses.mdx . No actual independent executable review or financial authorization is claimed.

## Lockdown P0-B: validity belongs at the durable transaction boundary

Checking freshness only in the JS Governor leaves a gap during DB latency. A DEFERRABLE INITIALLY DEFERRED constraint on new research_journal rows checks quote TTL/expiry, chain/pool/transfer receipt TTL, BUY market/source TTL and captured original lease deadline at COMMIT. Protective SELL still permits deteriorated entry metadata, while preserving transfer/pool/quote requirements. Lease release also checks current token/deadline and row count. Historical rows stay untouched; uncertain/expired attempts roll back all paper accounting and may retry only with fresh evidence, never a blind duplicate fill.

## Integrated accounting: ordered virtual events, linked refunds, exact partial FIFO

A separate immutable paper_ledger_events sequence orders historical/new fills with DEPOSIT/WITHDRAW/RENT_RESERVE/RENT_REFUND under existing ledger lock. Existing journal snapshots are untouched. Capital is never trading profit; refundable reserved rent remains an asset in paper equity. Refunds reference a specific reservation and cannot exceed its remaining amount. Virtual commands are idempotent and authenticated/CSRF-protected. Partial policy sizes round down, minimum one base unit for dust; exact FIFO basis retains rounding remainder in remaining lots. Residual equity is UNKNOWN without a full matching quote, never inferred by scaling a partial quote. Quote modelV1 estimated rent remains conservatively expensed and is not silently reclassified as on-chain refundable rent. Browser retries reuse the same request ID until an explicit new virtual event; no real transfers or signer added.

To preserve owner HALT/environment during testing, local runtime profiles have isolated ports/auth/PID and restricted build dirs; default owner ports/config remain unchanged. Generated test build output is excluded from source lint/Git; source lint remains enforced. Actual failed validations/fixture assumptions/restore invocation and fixed reruns remain in evidence.

## Observation facts and exact lineage are separate from trading authority

Provider health separates transport, response validity, persisted-data freshness and WS subscription acknowledgements. Slot notification health requires exact acknowledged subscription IDs; ACK alone cannot freshen data. Heartbeat is process liveness, not component progress or strategy success. Immutable samples retain actual provider facts/mode/times to support future duration qualification without inventing continuous uptime. No new-entry leases under owner HALT; monitoring held positions can continue, and owner ENABLED state is not silently rewritten. Full decision lineage references the original request lease/receipts and virtual ledger event; no chain signature is synthesized. Qualification evaluates mandatory evidence gates, never provider badges; missing gates fail closed and software proof never grants financial authorization.

## Verified-session public SOL/SPL inventory

PortfolioReader checks mainnet genesis, finalized slot windows, both token programs, token-account owner/program, independently fetched mint decimals/supply, duplicate/cap limits and a second stable membership/quantity bracket. Exact integer holdings include frozen public balances; Token-2022 confidential/restricted value, liabilities, cost basis, equity and P&L remain UNKNOWN. A moving/incomplete/slow inventory is UNAVAILABLE, never zero. Native and portfolio API routes recheck session wallet proof after RPC to reject disconnect/account-switch races. The dashboard bounds holdings to25 rows and aborts stale requests. This is read-only inventory, not trade authorization or atomic bank snapshot. No signing/funding/owner HALT change.

Source: packages/connectors/src/portfolio.ts; apps/api/src/wallet-routes.ts; apps/web/app/wallet-panel.tsx. Actual tests: tests/portfolio.test.ts, PostgreSQL tests/database.test.ts; evidence/integrated-portfolio/commands.json and integration-qualified.txt. Combined119 tests pass; portfolio95% per-file thresholds pass. Initial fixed-address test contamination failure retained, corrected with unique test public address. Actual-device Phantom and full accounting valuation remain open.

## Finalized receipt recovery and SOL/WSOL effect checkpoint

Smart-wallet backfill now requires the primary transaction signature, matching finalized slot/block time/error status, ordered signature windows and complete decoded receipt metadata. Duplicate account balances are quarantined. Stored provenance includes receipt SHA256, signature, commitment, genesis and observed time. PostgreSQL watermark CAS is mandatory; concurrent stale windows, removed watchlists and conflicting immutable receipt hashes reject atomically. Worker retains specific failure reasons. No copy authorization is inferred from token deltas or Jupiter presence.

wallet-effects.ts records exact SOL delta, identified fee payer, owner token-account lamport/quantity changes, WSOL quantity and unclassified backing/reserve residual. Controlled account effects are not spendability, refundable rent, swap attribution, valuation or P&L; those remain unqualified. Missing/unsafe mappings remain UNKNOWN. Copy feed exposes persisted payload details with bounded wrapping and keyboard access. Actual regression evidence: evidence/integrated-wallet-recovery/release-commands.json;129 unit/PostgreSQL tests pass, including200 generated wrap/close conservation samples, concurrent cursor/restart, altered receipt rollback, signature/slot/time/error mutations. Native effects and portfolio have95% per-file gates; legacy wallet decoder branch coverage is still83.18%, so this is not full decoder qualification. Prior failing fixture assumptions are retained in logs.

Remaining CODE: independent CPI/multi-hop/native-rent semantic attribution and copy eligibility; independent transaction/ALT verifier, isolated signer harness, durable live-order uncertainty/receipt reconciliation; point-in-time/OOS evaluation and production operations. OWNER: actual Phantom device and approved public watch addresses/program review. ENVIRONMENT: native validator absent, Docker daemon unavailable. TIME: actual continuous7d observation/24h shadow not qualified. Mainnet/funding/signing remain NOT_AUTHORIZED. Release stays IN_PROGRESS / NOT_LIVE_VERIFIED.

## Execution qualification vertical slice — 2 November2026

Implemented independent legacy/v0 wire parsing, writable/signer/program/account/instruction validation, hash-bound binary ALT state, canonical shortvec/size limits, exact SOL transfer and SPL transfer-checked semantics, freshness/fee/spend limits. Isolated subprocess generates only ephemeral test keys; fixed HARNESS blockhash and immutable native-transfer mandate prevent mainnet signing. No owner keys, signing env provisioning or external submission were used.

Migrations016–017 add HARNESS-only accounts, reservations, immutable intent/attempt/events/receipts/ledger, guarded state transitions and deferred quote/lease/HALT commit fence. Worker persists signed identity and attempt before submit; ambiguous results retain reservation and only reconcile, without signing/resubmitting. Persistent bank model (not blockchain) independently updates model balances and produces HARNESS_NOT_CHAIN receipts. Failed instruction charges only observed model fee. Order API is authenticated read-only; Trades exposes eleven-role REPLAY trace→harness order→attempt→receipt→ledger. CLI is restricted to explicit disposable DB names; actual process exit88 after submit is recovered by a fresh process.

Executed evidence: execution-v1/commands-rerun.json and commands-formatted.json;36 desktop/mobile Playwright cases (browser-command.json), including actual process crash/recovery, no second broadcast, veto/no-order and lineage. Verifier95% per-file gate met. Concurrency, idempotency, wrong receipt/owner/fee, immutable payload, quote/lease commit expiry and HALT recovery tested in a separate execution database. Initial fixture timing/mutation/parse/coverage failures retained and corrected; no threshold reduced. Native validator absent; Docker daemon unavailable. Owner DB HALTED/signerfalse remains unchanged; local project PG cluster was restarted, not reinitialized.

Gate scopes: independent transfer verifier and native signer HARNESS TESTED; durable native-transfer lifecycle HARNESS TESTED; Jupiter swap instruction/min-output/slippage/compute-budget/ATA semantics NOT_IMPLEMENTED; real-chain receipt adapter, production signer mandate and mainnet order lifecycle NOT_QUALIFIED. A model receipt is not chain settlement. Readiness remains RELEASE_NOT_QUALIFIED and full release NOT_LIVE_VERIFIED. Next safe code: actual read-only ALT proof resolution, then whole-session analytics series and remaining swap/copy semantics.

## Independent read-only RPC context, whole-session analytics and scoped release evidence

Added loadMainnetVerificationContext: independently fetched finalized genesis/blockhash/fee/native payer/ALT and legacy SPL mint/account proofs; native reserve, source balance across repeated instructions, stale/missing/wrong proof checks remain fail-closed. Read-only actual mainnet observation confirms fixed harness blockhash invalid at slot464520934 (execution-rpc/provider-negative.json); no transaction signing/submission. Native/SPL transfer scope only; Jupiter swap semantics remain CODE incomplete.

Fixed50-row analytics truncation: full-session minimal P&L series is independent of paged ledger rows, with explicit full dataset/page/date-range totals. UTC filtering happens server-side across the session; invalid/reversed ranges reject. Charts retain UNKNOWN equity and exact integer realized values. UI aborts/ignores old filter/session responses; polling overlap guarded. PostgreSQL proves off-page BUY/SELL still contribute to57-point history and all-session N=1 fixture metrics; timezone test is independent of DB session timezone. All fixture profits remain REPLAY, not forward evidence.

Diagnostics now verify hash-bound source and successful command artifacts before displaying PARTIAL/BLOCKED scopes and explicit missing work. The manifest loader denies PASS and cannot override runtime safety facts; missing/stale/tampered/failed evidence is not promoted. qualified-checks.ts records source identities before/after actual frozen install, check and integration; build-gate-manifest refuses source drift. Commands: evidence/attested-core-final/commands.json (all0,162 combined tests); release-evidence/browser-command.json (all38 desktop/mobile cases passed). Older failed/superseded logs retained. Full readiness remains503 RELEASE_NOT_QUALIFIED.

Actual LIVE_PROVIDER SHADOW collection started on a separate database, with no keys/submissions/fills and source identity in immutable worker samples. Initial source window is development observation only (shadow-observation/actual-window.json), not24h/seven-day qualification. Owner observation DB remains HALTED. A CODE limit was found:10000 decisions/session requires bounded shadow rollover/retention before long-run shadow qualification. This is listed separately from actual TIME gates, not hidden behind an owner blocker.

### Transfer reconciliation and continuous research history
Finalized transfer observations must bind original signed bytes/context, exact account deltas and fee, separately from submission and simulation. Supported native/SPL/WSOL transfers do not imply Jupiter swap qualification. Mainnet state creation/signing stays absent. Missing receipt never becomes zero or a fill. SHADOW evidence may continue past the research entry cap because it cannot fill; PAPER may only bypass the entry count cap for a durable owned protective SELL, with all safety gates retained. Chart sampling is explicitly first/last/min/max and never an input to full-session performance statistics. Cursor batches retain chronology and partial-exit state; malformed history prevents metric publication.

### RouteV2 single-CP qualification boundary (3 November2026)
Support one explicit Jupiter RouteV2 exact-input Raydium CP layout with preexisting legacy SPL/WSOL accounts. Independently decode wire/accounts/ALT and39-byte route data; reject other routes/setup/cleanup/tips/authority changes. Do not extrapolate observed public build bytes or model execution into reviewed mainnet behavior. Existing transfer scope remains unchanged. Native/mainnet signer authorization remains absent. Guard rechecks at atomic reservation, policy quote TTL caps signing freshness, and uncertain identity never becomes a new blind attempt. Reuse PaperLedger internally but persist/display swap records strictly as HARNESS_NOT_CHAIN, including failed fee-only entries. Coalesced dashboard reads and authoritative HALT response prevent stale UI overwrites.

### Reviewed binary preflight and transport containment
Program review is per explicit program/revision and verification-only, never signer authorization. Verify raw finalized SPL/WSOL/pool and ProgramData bytes independently of Jupiter build JSON; do not auto-approve real executable hashes. Keep quota-limited preflight observations separate from orders/receipts. Normalize the documented V2 compute-price-only response under pinned policy; use ceil minimum output and omit only proven-existing idempotent setup. Runtime source identity and artifact attestations must agree; metadata cannot grant release PASS. Retire WebSocket state/detach handlers before invoking a potentially reentrant/throwing transport close.
