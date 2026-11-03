# Latest mapping — worker isolation and query boundedness

Source `2471404dbb451a50183f57af58c3aca75ad17efcadff84d779bac3665b142865`; full224 tests PASS at evidence/worker-isolation-final-rerun/commands.json. Release not qualified.

| Requirement | Source | Executed test/evidence | Gap |
|---|---|---|---|
| Worker crash preserves dashboard/API | scripts/dev-local.ts, qualify-supervisor.ts | actual worker/leader/master SIGKILL; worker-isolation-final-faults/supervisor-result.json | OS boot/VPS/security qualification open |
| Retry honest dependency failure | worker/main.ts; storage/index.ts workerFault | database.test.ts audit/outbox and reason sanitization; full224 | Provider availability not guaranteed |
| Bounded latest candidates | storage/index.ts; migration031 | deterministic ties/order/limit test; owner read-only EXPLAIN before/after | Production load/retention open |
| Fresh proof selection and halted entry | worker/agent-cycle.ts; storage/paper-scheduler.ts | future-latest rejection plus full integration/regression | Qualified real-provider positive cycle not observed |
| Owner safety/source/browser | deployed tested build; owner-before/after.json; owner-readiness.json | unchanged HALT timestamp;503 source MATCH; loaded desktop/mobile navigation | Real Phantom/financial gates remain open |

Historical mappings follow; latest supported evidence above controls.

# Current authoritative mapping — signing policy and supervised recovery

Tested source `976dfd442939dea130f878227be6c83309e041073b360daaf67c00fb18f09328`. Full221 unit/PostgreSQL + full46 browser at signer-current-checks/commands.json and signer-current/playwright-results.json; release NOT_QUALIFIED.

| Requirement | Implementation | Executed evidence | Remaining gap |
|---|---|---|---|
| Mandate/Guard/signing authority boundary | execution/signing-policy.ts, policy-signer.ts, configured signer-child/harness-signer | signing-policy.test.ts; distinct-authority/certificate/route/expiry mutations; child denies missing permit | HARNESS only; real production service/provider/activation CODE |
| Durable signing identity and budgets | storage/signing.ts;026–030 | execution-database tests: independent order/fee/mint caps, concurrency, duplicate wire/request, lookup-only timeout recovery, lease/permit expiry, HALT/revoke and deferred COMMIT fence | MAINNET account/global risk/ledger integration not implemented |
| Eleven roles to signing/order/receipt/FIFO/equity | existing swap-fixture-worker/ExecutionStore + signing journal | full46 BUY/protective SELL/crash recovery; signer-policy/integrated-trace.json; both viewports signer evidence | HARNESS_NOT_CHAIN; no live settlement claim |
| Owner revoke/diagnostics/audit | API swap-preflight routes + execution-panel | authenticated API401/403/400/404 and idempotent revoke while halted; persisted signed audit/outbox; browser JSON evidence | Production grant provisioning and live governance still closed |
| Independent operation/restart | supervisor.ts, dev-local.ts supervised groups | actual QA SIGKILL worker/leader/supervisor, duplicate profile, tagged cleanup and preserved HALT; supervisor-database-bound result and cross-database denial | OS boot manager/VPS/security/load/duration qualification open |
| Recovery of current schema | existing authenticated streaming backup/restore and bounded digest verifier | signer-policy/backup-current-commands.json and backup-current-3.txt, all row hashes + auth revocation/audit mutation | Production RTO/RPO/retention/hardening open |

# Historical mappings

# Current authoritative requirement mapping — receipt/recovery checkpoint

Tested source `320fb5c8fe0c3a786430ac944baf92cba07f6f151aa2f676b7fe1d1a59e2423f` → final attested full212 at `evidence/receipt-release-checks/commands.json` → full46 browser at `evidence/receipt-release/playwright-results.json`. Prior results below remain historical. Release NOT_QUALIFIED.

| Requirement | Source | Executed proof | Remaining scope |
|---|---|---|---|
| Independent single-CP receipt / original signed identity | execution/swap-chain-receipt.ts, original swap verifier/context | signature/byte/CPI/native/token/fee mutations, caller/RPC race, failed/pending/missing; public captured unrelated receipts rejected | Historical supported Jupiter proof qualification; no ledger authority |
| Durable observation/API/worker/audit/UI | storage/swap-preflight.ts, worker/swap-receipt-cycle.ts, API, execution-panel;023–024 | PostgreSQL immutable proof, eight-way dedupe, crash/lease/restart/backoff; desktop/mobile NO_EVIDENCE and provenance detail | Production signed order/authorization lifecycle still CODE |
| Eleven roles → swap → protective exit → FIFO/equity | reused engine/swap-order/execution/accounting | full212 + full46 HARNESS BUY/SELL/crash88; receipt-operations/qa-integrated-swap-trace.json reads persisted rows | HARNESS_NOT_CHAIN; not authorized blockchain settlement |
| Capital/fees/reservations/partial exits/portfolio/filter | existing accounting/research/portfolio/ledger UI | full212 and full46 regression including account disconnect, dates/polling/late response and whole-session pagination | Actual Phantom/production portfolio reconciliation open |
| Bounded recovery data / encrypted archive | backup-stream.ts, backup.ts, verify-restore.ts | >50MiB stream/tamper/password/V1/empty/overwrite tests;69,627,235-byte actual archive;37 table MATCH, auth revocation/audit rejection | Production RTO/RPO, retention/topology/alerts and size/time limits qualification open |
| Correlation lookup at scale | migration025 journal decision index | actual failed suite retained, index EXPLAIN, two targeted reruns, final212 full PASS | Broader production load qualification open |
| Actual reference-video behaviors | 04_VIDEO_PARITY_MATRIX.md plus existing terminal sources | original MOV SHA/durations/sample inspection manifest; full46 screenshot/trace; owner8 read-only checks | Evidence-backed wallet graph/copy eligibility, production trading and qualified strategy open |
| Owner/time boundary | unchanged locked runtime + separate shadow worker | owner readiness503/source MATCH/HALT timestamp preserved; real continuity report with gaps | Actual owner/device/financial gates and continuous duration not run/passed |

# Historical mapping

# Current requirement mapping — finalized swap receipt slice

Tested source `e635f97169108a394ca8020226cbfab6686580d37970a6b24d760c4070cddc36`. Current release NOT_QUALIFIED. Historical contradictory states below are archival.

| Requirement | Implementation | Executed test/evidence | Status/gap |
|---|---|---|---|
| Independent swap receipt, no submit-as-fill | execution/swap-chain-receipt.ts | swap-chain-receipt.test.ts; full209 at receipt-qualified/commands.json | Supported zero-rent existing-account scope; REPLAY positive, unrelated public receipt rejected; historical supported route qualification open |
| Durable receipt/restart/concurrency | storage/swap-preflight.ts, worker/swap-receipt-cycle.ts, migrations023–024 | database tests: concurrent dedupe, immutable proofs, crash after persistence, lease recovery, pending backoff, fee-only failed receipt | Read-only PASS for executed cases; production signed order lifecycle still CODE |
| API/audit/UI evidence | api/swap-preflight.ts, worker/main.ts, web/execution-panel.tsx | authenticated API/database; full46 desktop/mobile including NO_EVIDENCE and receipt provenance screenshot/trace | No ledger mutation or financial authority; modes separated |
| Existing integrated roles/order/FIFO | existing swap-order/execution-cycle/execution/accounting | full46 HARNESS BUY/protective SELL/crash88/recovery and full209 regression | HARNESS_NOT_CHAIN, not mainnet |
| Public blockchain provenance | tests/fixtures/public-cp-receipts | receipt-swap/public-capture-manifest.json, public-rpc-observation.txt | Genuine read-only captures; unsupported/direct route not promoted to product settlement |

# Historical mapping

# Current mobile evidence regression mapping

Evidence readability → globals.css bounded research grid/pre + execution-panel focus labels → actual element/section/scroll bounds, keyboard focus and screenshots on desktop/mobile → evidence/evidence-mobile-qualified/commands.json (202 combined) and evidence/evidence-mobile/browser-execution.json (full44/44). Body-width assertion alone previously missed clipped child overflow; old screenshot retained. No release gate promoted. Core mapping below still applies.

# Current requirement map — supported swap proof checkpoint

Current tested source `6fa456e6de9955c18785fecda358834ea01fbe60a87c8bc0bf23108990850e0f`; release NOT_QUALIFIED.

Build/independent verifier → swap-builder.ts + swap-verifier.ts: ceil minimum, exact V2 route and policy compute, existing-account setup omission only → swap-execution.test.ts, mutation/ALT/provider-shape cases → swap-proof-final/commands.json (202 combined). HARNESS swap receipt/FIFO/eleven-role trace remains tested at4e55dc9; actual finalized swap receipt/signing lifecycle still CODE.

On-chain proof/review → swap-context.ts + program-reviews.ts + migration021 → swap-context/database tests: raw code/account mutation, stale/missing/revoked proofs, per-program review isolation → swap-proof/integration-*.txt and final attested checks. Positive mock RPC explicitly REPLAY_TEST; no actual executable approval or signer authority.

API/DB/audit/UI → api/swap-preflight.ts + storage/swap-preflight.ts + migration022 + execution-panel → auth/quota/immutable evidence/no-order DB test; actual RPC VETO on both viewports → swap-proof/browser-final,44/44 full suite. Capability label now accurately includes swap harness/preflight, never mainnet execution.

Operational safety → websocket.ts retire-before-close/send/shutdown → wallet.test.ts reentry and socket.test.ts actual local Node handshake failure → swap-proof/ws-reentry-tests.txt, runtime-websocket-failure.txt, final202-test execution. No soak claim from these short tests.

Release provenance → qualification-evidence.ts + API runtime source identity + SetupPanel → forged identity rejected; both viewport source MATCH assertions → swap-proof/playwright-final-execution.json; owner-readiness.json remains503. Backup migration021–022 and filled records → backup-commands.json / backup-3.txt; owner-state preservation → owner-after.json. Remaining CODE/OWNER/ENVIRONMENT/TIME detailed in current IMPLEMENTATION_STATUS.md.

# Historical mappings (superseded where conflicting)

# Current critical-path mapping — 3 November 2026

Current tested source identity7e6bbcc686b4f65c3a43d57af8ed7f9fc42f61f16e6f2846dc5d879b2b3421b7; release NOT_QUALIFIED. This mapping supersedes contradictory historical rows below.

Swap build/verification → execution/swap-builder.ts + swap-verifier.ts + existing bounded wire/ALT parser → swap-execution.test.ts (including every-byte mutation and real ALT resolution) → swap-final-source/commands.json,190 tests PASS. Scope HARNESS exact-input one CP route; actual unsigned public build provenance separate. Mainnet review/proof/receipt scope CODE blocked.

Eleven roles/Guard/order → worker/swap-order.ts + storage/execution.ts + migrations019–020 → execution-database.test.ts concurrency/reservation/veto/quote-bound tests and swap-fixture-worker → swap-integrated/worker-cycle-final.json, command metadata. Both BUY/SELL have11 persisted events and correlation to order/attempt/receipt/ledger. Rule engine, no LLM claim.

Signer/uncertain/recovery/accounting → signer-child, harness-signer, swap-model, swap-receipt, PaperLedger FIFO/fee expense → database cases and actual crash exit88/recovery in Playwright → playwright-qualified-execution.json42/42; failed receipt never becomes fill, poisoned receipt retains reservation. HARNESS namespace, not chain finality.

Dashboard/STOP/filter/health → dashboard.tsx coalesced refresh and confirmed HALT, existing ledger/session-series → desktop/mobile delayed-response STOP and native keyboard/filter tests → browser-qualified screenshots/traces. Native date clearing not reproduced with correct physical-input method; unsupported speculative code reverted. Initial failures retained.

Backup/restore → backup.ts + verify-restore.ts → actual filled execution DB clone33-table comparison, auth revocation and audit immutability → swap-integrated/backup-commands.json and backup-3.txt. Owner read-only8 combinations preserve HALT exactly. Production operations/duration/device gates remain open.

# Historical mappings (superseded where conflicting)

# Requirement traceability — 1 November 2026

Source checkpoints: 9842899 (research), 544a609 (ledger), 282f74c (Phantom), 345d425 (recovery); latest setup SHA is recorded in Git history and the post-commit export manifest. Release IN_PROGRESS / NOT_LIVE_VERIFIED.

| Requirement | Status | Source / actual tests / evidence | Remaining acceptance |
|---|---|---|---|
| R0 preserve and reproduce | tested | evidence/R4/R3.1/baseline*, git history | Preserve future increments |
| R3.1 positive bounded proposals | tested | engine/index.ts, research.ts; research-engine.test.ts, database.test.ts; final-quality.txt, qualified-integration.txt | Broader full-system qualification |
| R3.1 newest candidates | tested | worker/agent-cycle.ts, storage/index.ts; database.test.ts | Upstream provider discovery completeness |
| R3.2 chain security | partially_implemented | connectors/security.ts; security-reader.test.ts; evidence/R4/R3.2 | Token-2022, pool proof, complete holders |
| R3.3 wallet/copy | partially_implemented | connectors/wallet.ts, worker/wallet-monitor.ts; wallet.test.ts | Native SOL/rent, capacity, actual swap proof, copy eligibility |
| R3.4 persistent PAPER/SHADOW | partially_implemented | storage/research.ts; migrations005–006; research-panel.tsx; database.test.ts, e2e/observe.spec.ts | Provider quote loop, capital flows, reservations, full recovery |
| R4 research UI | tested | /rules; evidence/R4/R3.1/browser-rerun | Complete remaining product screens |
| R4 Phantom identity | partially_implemented | wallet-routes.ts, wallet-proof.ts, wallet-panel.tsx, migration008; wallet-proof.test.ts/database.test.ts/e2e; evidence/R4/phantom | Actual owner extension/mobile qualification, valuation/cost-basis/equity reconciliation (public SOL/SPL inventory now implemented; see integrated portfolio evidence) |
| R4 dedicated trading wallet | not_started | Signing disabled, manual funding boundary retained | Isolated signer provisioning only after owner authorization |
| R4 positions/trades/analytics | partially_implemented | ledger-panel.tsx; e2e/observe.spec.ts; evidence/R4/ledger-pages | Real wallet portfolio, equity valuation, full operational controls |
| R4 settings/setup | partially_implemented | setup-panel.tsx; e2e/observe.spec.ts; evidence/R4/setup | Production configuration, credentials provisioning and qualification |
| R5 execution/signer | not_started | Signing disabled, no arbitrary signing API | Independent verifier, isolated harness, durable order recovery |
| R6 backup/restore | partially_implemented | backup.ts, backup-crypto.ts, verify-restore.ts; backup.test.ts; evidence/R4/backup | Production custody/remote TLS/offsite restore/RTO-RPO |
| R6 operations/security/soak | partially_implemented | Existing local launcher, health, migrations | Roles, monitoring, alerts, fault injection, actual soak |
| R7 micro-live/capped-auto | owner_approval_required | No funds or key access | Separate mandate after all prior gates |


## Strict D1 continuation

D1 automatic worker: paper-cycle.ts, paper-live.ts, storage/paper-scheduler.ts and research.ts, connectors/jupiter-paper.ts, migrations009–010, /paper. PostgreSQL control run71 tests; Playwright20 tests, including actual worker process restart; evidence/D1. Status TESTED_LOCAL core slice / full gate IN_PROGRESS. Positive lifecycle is REPLAY_TEST only; actual real-provider receipt legitimately SKIPs. New work and typed CODE/PROVIDER/OWNER/TIME blockers are in DELIVERY_SCORECARD.md. Release remains IN_PROGRESS / NOT_LIVE_VERIFIED. Next source checkpoint is recorded in Git/export to avoid a self-referential SHA.


Latest continuation checkpoints: a916c57 automatic D1,5c04757 Token-2022 diagnostics,0b7e88c research reporting, followed by all-in risk patch in Git. D3 source performance.ts/performance-panel.tsx/research-report.ts and API /performance tested, but strategy remains NOT_VALIDATED with actual forward N=0 and no out-of-sample data. Coverage and blocker types in DELIVERY_SCORECARD.md. Final test baseline79 combined/22 browser; no release completion claim.

## CP1 / CP2 current delta

| Requirement | Source / executed evidence | Status |
|---|---|---|
| On-chain pool/LP/vault qualification | connectors/pool-security.ts; pool-security.test.ts; evidence/CP1/real-pool-observation.json; upstream layouts/licenses | Supported CPMM slice tested; unreviewed mutable program UNKNOWN; broader scope incomplete |
| Conservative holder bound | connectors/security.ts; security-reader.test.ts | Partial sample may PASS only when all unseen supply assigned to worst owner still fits cap; otherwise UNKNOWN |
| Entry vs protective exit | engine/index.ts; entry-exit.test.ts; database.test.ts; browser protective-exit screenshots/traces | Tested fixture BUY/restart/SELL with visible RUG veto and independent Guard; no real fill proof |
| Durable reservations/fees/recovery | storage/research.ts, paper-scheduler.ts; worker/paper-cycle.ts; database.test.ts | Commit reservation tampering rejects; duplicate/recovery tested; broader capital/partial exits incomplete |
| Actual provider observation | worker/paper-live.ts; observe-pool-security.ts; paper-observation-report.ts; evidence/CP1 | No safe entry observed; no real-provider positive cycle/continuous soak claim |

CP2 fee-aware exit: engine `exitReadiness`, regression `entry-exit.test.ts` covers proceeds below/equal fees; actual PostgreSQL/API/browser fixture worker tests unavailable exit followed by independent protective SELL. Evidence/CP2 records commands,91 combined tests, quality checks and desktop/mobile traces. Broader CP2 provider-positive gate remains NOT_OBSERVED.

Lockdown P0-A: immutable program review/revocation registry (migration011, storage/program-reviews.ts), source resolution in paper-live.ts, commit-time revocation fence in research.ts, admin program-review.ts and runbook ops/PROGRAM_REVIEW.md. Pool/database tests include unknown/mutated/revoked binary, registry outage, conflicting lock, SQL failure rollback, idempotent revoke and no persisted fill for revoked proposal. Evidence/lockdown-p0a; actual supported revision qualification remains NOT_RUN, mainnet locked.

P0-B transaction boundary: migration012 + research.ts captured lease deadline/deferred freshness validation; database.test.ts slow journal/release fault injection covers seven expiry boundaries, rollback, fresh recovery and duplicate replay.96 combined tests and22 browser cases passed; exact commands/UTC/exit codes and initial typecheck failure retained in evidence/lockdown-p0b. Capital-flow/partial exits/provider-positive trading and full release qualification remain unfinished.

Integrated A: capital.ts/paper.ts, storage/research.ts, migration013, API capital route, capital-panel and automatic-paper/research-panel -> capital/FIFO/exit-size/entry-exit/database tests -> evidence/integrated-accounting (immutable ordered replay, exact rounding, concurrent withdrawal/refund, reserved-cash rejection, SQL rollback, restart/restore and auth/CSRF).
Integrated F: bounded historyPage API and UI cursor controls, stale request generations, unfiltered market freshness and NO_SEARCH_RESULTS -> API55-decision paging/full metrics and Playwright desktop/mobile delayed actual responses/capital/partial worker restarts -> same evidence/browser. Real-provider observations/quotes remain separate from REPLAY_TEST positive fills. Broader B–G qualification remains open.

Integrated B/C/F/G observation slice: domain/health.ts+qualification.ts, storage/index.ts+paper-scheduler.ts, main worker and websocket connector, migrations014–015, dashboard/setup/full trace -> health/qualification/wallet/database tests +30 actual desktop/mobile browser cases -> evidence/integrated-health. Real100-pool/2-candidate sample records review-required UNKNOWN; raw per-run observation samples begin now (not completed7d/24h). Full wallet/transaction/strategy/production qualification remains incomplete.

Portfolio browser acceptance:32 desktop/mobile tests passed on isolated PostgreSQL/API/worker at3100/4100; screenshots/traces in evidence/integrated-portfolio/browser. Real RPC read and labelled UI fixture remain separate. Actual Phantom owner device NOT_RUN. Release IN_PROGRESS / NOT_LIVE_VERIFIED.

## Finalized receipt recovery and SOL/WSOL effect checkpoint

Smart-wallet backfill now requires the primary transaction signature, matching finalized slot/block time/error status, ordered signature windows and complete decoded receipt metadata. Duplicate account balances are quarantined. Stored provenance includes receipt SHA256, signature, commitment, genesis and observed time. PostgreSQL watermark CAS is mandatory; concurrent stale windows, removed watchlists and conflicting immutable receipt hashes reject atomically. Worker retains specific failure reasons. No copy authorization is inferred from token deltas or Jupiter presence.

wallet-effects.ts records exact SOL delta, identified fee payer, owner token-account lamport/quantity changes, WSOL quantity and unclassified backing/reserve residual. Controlled account effects are not spendability, refundable rent, swap attribution, valuation or P&L; those remain unqualified. Missing/unsafe mappings remain UNKNOWN. Copy feed exposes persisted payload details with bounded wrapping and keyboard access. Actual regression evidence: evidence/integrated-wallet-recovery/release-commands.json;129 unit/PostgreSQL tests pass, including200 generated wrap/close conservation samples, concurrent cursor/restart, altered receipt rollback, signature/slot/time/error mutations. Native effects and portfolio have95% per-file gates; legacy wallet decoder branch coverage is still83.18%, so this is not full decoder qualification. Prior failing fixture assumptions are retained in logs.

Remaining CODE: independent CPI/multi-hop/native-rent semantic attribution and copy eligibility; independent transaction/ALT verifier, isolated signer harness, durable live-order uncertainty/receipt reconciliation; point-in-time/OOS evaluation and production operations. OWNER: actual Phantom device and approved public watch addresses/program review. ENVIRONMENT: native validator absent, Docker daemon unavailable. TIME: actual continuous7d observation/24h shadow not qualified. Mainnet/funding/signing remain NOT_AUTHORIZED. Release stays IN_PROGRESS / NOT_LIVE_VERIFIED.

Checkpoint verification:130 combined unit/PostgreSQL tests pass;34 final desktop/mobile browser cases pass. Separate owner-runtime read-only browser navigation at localhost3000 passes8 viewport/page combinations with HALTED preserved; no operational or financial mutation. Runtime upgrade preserves modeUpdatedAt exactly (owner-before/after.json). Encrypted backup/restore into a new disposable database matches all included table hashes, intentionally revokes sessions and retains append-only audit protection. Evidence: integrated-wallet-recovery/{release-commands.json,trace-qualified-integration.txt,browser-final-command.json,owner-browser/results.json,backup-commands.json,verify-restore.txt,owner-readiness.json}. Trace sanitizer additionally discovers per-archive session/CSRF to handle concurrent-run manifests; foreign-run credential redaction test preserves ordinary receipt hashes. Computed owner readiness remains503 RELEASE_NOT_QUALIFIED. Actual owner worker samples only start at the upgrade; no7d/24h duration PASS.

| Current requirement | Integrated implementation | Executed acceptance | Evidence |
|---|---|---|---|
| Exact read-only portfolio / no stale wallet output | portfolio.ts; wallet-routes.ts; wallet-panel.tsx | owner/mint/program/supply/window negatives; binding disconnect;25-row UI desktop/mobile | integrated-portfolio/commands.json; integrated-wallet-recovery/browser-final-command.json |
| Finalized receipt identity / recovery | wallet.ts; storage/index.ts; wallet-monitor.ts | primary signature/error/slot/time/missing metadata; duplicate quantities; concurrent watermark, restart and conflicting receipt rollback | integrated-wallet-recovery/final-qualified-commands.json |
| SOL/WSOL effects without fabricated P&L | wallet-effects.ts; copy-feed details |200 generated wrap/close conservation inputs; missing/unsafe mapping; fee payer, keyboard/mobile overflow | integrated-wallet-recovery/final-integration.txt; browser-final/ |
| Runtime preservation / backup / honest readiness | dev-local.ts; migrations013–015; backup.ts; qualification.ts | owner mode timestamp unchanged;8 read-only browser pages; new empty-target restore with hash MATCH;503 readiness | integrated-wallet-recovery/owner-before.json; owner-after.json; backup-commands.json; owner-readiness.json |

Export follow-up: scripts/export-safety.py performs exact hex-token matching with overlapping-window detection plus literal nonhex checks; audit-export.py uses it for files and unpacked trace contents. The previous repeated per-secret scans were stopped before publication and replaced with tested matching; no redaction gate was removed. Actual export smoke succeeds (evidence/integrated-export/export-precommit.txt); final clean post-commit export resolves its own source SHA in AUDIT_EXPORT/MANIFEST.json.131 combined tests pass, including overlapping and nonhex secret detection. Lint/typecheck/integration UTC commands: evidence/integrated-export/commands.json. Application build/browser proof remains integrated-wallet-recovery (unchanged application source;34 desktop/mobile cases). Release NOT_LIVE_VERIFIED; outstanding software/device/duration gates unchanged.

## Execution qualification vertical slice — 2 November2026

Implemented independent legacy/v0 wire parsing, writable/signer/program/account/instruction validation, hash-bound binary ALT state, canonical shortvec/size limits, exact SOL transfer and SPL transfer-checked semantics, freshness/fee/spend limits. Isolated subprocess generates only ephemeral test keys; fixed HARNESS blockhash and immutable native-transfer mandate prevent mainnet signing. No owner keys, signing env provisioning or external submission were used.

Migrations016–017 add HARNESS-only accounts, reservations, immutable intent/attempt/events/receipts/ledger, guarded state transitions and deferred quote/lease/HALT commit fence. Worker persists signed identity and attempt before submit; ambiguous results retain reservation and only reconcile, without signing/resubmitting. Persistent bank model (not blockchain) independently updates model balances and produces HARNESS_NOT_CHAIN receipts. Failed instruction charges only observed model fee. Order API is authenticated read-only; Trades exposes eleven-role REPLAY trace→harness order→attempt→receipt→ledger. CLI is restricted to explicit disposable DB names; actual process exit88 after submit is recovered by a fresh process.

Executed evidence: execution-v1/commands-rerun.json and commands-formatted.json;36 desktop/mobile Playwright cases (browser-command.json), including actual process crash/recovery, no second broadcast, veto/no-order and lineage. Verifier95% per-file gate met. Concurrency, idempotency, wrong receipt/owner/fee, immutable payload, quote/lease commit expiry and HALT recovery tested in a separate execution database. Initial fixture timing/mutation/parse/coverage failures retained and corrected; no threshold reduced. Native validator absent; Docker daemon unavailable. Owner DB HALTED/signerfalse remains unchanged; local project PG cluster was restarted, not reinitialized.

Gate scopes: independent transfer verifier and native signer HARNESS TESTED; durable native-transfer lifecycle HARNESS TESTED; Jupiter swap instruction/min-output/slippage/compute-budget/ATA semantics NOT_IMPLEMENTED; real-chain receipt adapter, production signer mandate and mainnet order lifecycle NOT_QUALIFIED. A model receipt is not chain settlement. Readiness remains RELEASE_NOT_QUALIFIED and full release NOT_LIVE_VERIFIED. Next safe code: actual read-only ALT proof resolution, then whole-session analytics series and remaining swap/copy semantics.

Execution checkpoint checks: latest executed commands are evidence/execution-v1/checkpoint-commands.json; previous formatted coverage failure was corrected by adding instruction-allocation and mixed-asset-budget adversarial tests, without lowering95% thresholds. The supported verifier scope remains transfer-only.

## Independent read-only RPC context, whole-session analytics and scoped release evidence

Added loadMainnetVerificationContext: independently fetched finalized genesis/blockhash/fee/native payer/ALT and legacy SPL mint/account proofs; native reserve, source balance across repeated instructions, stale/missing/wrong proof checks remain fail-closed. Read-only actual mainnet observation confirms fixed harness blockhash invalid at slot464520934 (execution-rpc/provider-negative.json); no transaction signing/submission. Native/SPL transfer scope only; Jupiter swap semantics remain CODE incomplete.

Fixed50-row analytics truncation: full-session minimal P&L series is independent of paged ledger rows, with explicit full dataset/page/date-range totals. UTC filtering happens server-side across the session; invalid/reversed ranges reject. Charts retain UNKNOWN equity and exact integer realized values. UI aborts/ignores old filter/session responses; polling overlap guarded. PostgreSQL proves off-page BUY/SELL still contribute to57-point history and all-session N=1 fixture metrics; timezone test is independent of DB session timezone. All fixture profits remain REPLAY, not forward evidence.

Diagnostics now verify hash-bound source and successful command artifacts before displaying PARTIAL/BLOCKED scopes and explicit missing work. The manifest loader denies PASS and cannot override runtime safety facts; missing/stale/tampered/failed evidence is not promoted. qualified-checks.ts records source identities before/after actual frozen install, check and integration; build-gate-manifest refuses source drift. Commands: evidence/attested-core-final/commands.json (all0,162 combined tests); release-evidence/browser-command.json (all38 desktop/mobile cases passed). Older failed/superseded logs retained. Full readiness remains503 RELEASE_NOT_QUALIFIED.

Actual LIVE_PROVIDER SHADOW collection started on a separate database, with no keys/submissions/fills and source identity in immutable worker samples. Initial source window is development observation only (shadow-observation/actual-window.json), not24h/seven-day qualification. Owner observation DB remains HALTED. A CODE limit was found:10000 decisions/session requires bounded shadow rollover/retention before long-run shadow qualification. This is listed separately from actual TIME gates, not hidden behind an owner blocker.

## Current transfer / continuous-history acceptance mapping

Finalized receipt integrity → packages/execution/src/chain-receipt.ts plus verifier.ts → tests/chain-receipt.test.ts, execution-verifier.test.ts, rpc-envelope.test.ts → evidence/chain-qualified/commands.json (all0;176 combined). Scope tested: transfer observation only; Jupiter swap/order integration remains CODE.

Durable attempts/no blind retry/correlated ledger → storage/execution.ts, worker/execution-cycle.ts, migrations016–017 and web/execution-panel.tsx → execution-database.test.ts and persisted execution Playwright case → streaming-qualified/commands.json plus streaming-research/browser traces. Scope HARNESS_NOT_CHAIN, not actual settlement.

Full-session statistics and long-run SHADOW → storage/research.ts, accounting/performance.ts, web/session-series.tsx, migration018 → database/performance tests (>10000 decisions) and whole-session Playwright case (10057) → streaming-qualified/commands.json (178 tests) and streaming-research/browser-execution.json. First full browser run37/38; mobile actual-provider quote case failed then passed unchanged-source targeted rerun (browser-provider-rerun-execution.json). No fabricated forward fills.

Recovery/startup → scripts/dev-local.ts, backup.ts, verify-restore.ts → encrypted empty-target restore/hash comparison/immutable audit and owner read-only navigation → streaming-research/backup-commands.json, owner-browser/results.json, owner-readiness-authenticated.json. Local qualification partial; production deployment, real device and actual-duration gates remain open.
