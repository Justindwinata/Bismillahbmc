# R0 source review and reproduced baseline

1 November 2026. Source, migration, scripts, tests, package/lock policy, evidence and new continuation contract reviewed. Existing specs remain unchanged from the previously read baseline. Preserve backend; no rewrite. Initial HEAD 1acfb16, prior implementation uncommitted. Safe files scanned before checkpoint; ignored .env/.tmp/node_modules excluded. No push.

Reproduced frozen install, pnpm check (19 tests, foundation domain branch 97.56%), 5 tests on a newly created disposable native PostgreSQL DB, public DEX+finalized Solana reads and advisory audit. All exit 0; exact stdout and hashes evidence/R0/commands.jsonl. No retained evidence hash mismatches. Prior overwritten outputs remain explicitly unavailable; not reconstructed. Native PostgreSQL used; Docker Compose not claimed.

Review findings to address in R1: browser auth absent; no frontend; migration runner handles one file only; outbox sequence allocation alone does not ensure commit ordering; audit/outbox lacks provider-health events; dedupe retains original receipt and cannot represent repeated unchanged market observations; halt repeats audit for every request; no payload enrichment or chain status view. These are concrete changes against existing modules, not a reason to recreate scaffold.

Security boundaries: bootstrap always denies trading; no signer, balance/PnL or fill code exists. Boolean chainProof in domain transition is a test interface, not a receipt verifier. Money coverage is only packages/domain, not app/signer. Future browser sessions must never expose internal token. Minimatch 10.2.6 -> 11.0.1 override is explicit in lockfile; install and current zero-advisory audit reproduced. No independent security-audit claim is made by this self-review.

R0 scope PASS_WITH_EVIDENCE once checkpoint committed; full product NOT_LIVE_VERIFIED. R1 implementation begins immediately after checkpoint: authenticated sessions + persisted SSE + real OBSERVE browser, with unknown financial values, genuine empty stage states and real Playwright evidence. R2–R6 remain open, R7 not authorized.
