# 09 — Database, API, Realtime Transport and Transactional Consistency

## 1. Database design (PostgreSQL)

Create normalized tables (naming adaptable, semantics mandatory): `users`, `sessions`, `wallet_connections`, `trading_wallets_public`, `owner_activations`, `risk_policies`, `risk_policy_revisions`, `provider_health`, `source_snapshots`, `token_mints`, `dex_pools`, `wallet_watchlists`, `wallet_swap_observations`, `candidate_evaluations`, `agent_events`, `trade_decisions`, `risk_budget_reservations`, `execution_intents`, `execution_attempts`, `chain_transactions`, `trade_fills`, `portfolio_lots`, `positions`, `ledger_entries`, `equity_snapshots`, `alerts`, `audit_events`, `outbox_events`, `job_leases`, `system_state`, `data_retention_jobs`. Add referential integrity, indexes and constraints, migrations and rollback/restore plan.

**Critical DB constraints:** unique `event_id`, `intent_id`, `signature` (when known), source-event dedupe `(provider, source_key, slot)`, per-wallet active decision uniqueness `(wallet, mint, strategy, decision_window)`. Sum of account-level reserved notional must never exceed configured cap; enforce under DB row lock/serializable transaction and in signer policy. Records of live order+budget reservation+audit+outbox must commit atomically.

**Encryption:** never store wallet seed/private key in DB. Public wallet address and user preferences are allowed. Other financial/activity data requires access control, log redaction, backups encrypted at rest and explicit retention.

## 2. HTTP API contract (all examples under `/api/v1`)

| Method/route | Access | Response/side effects |
|---|---|---|
| GET `/health/live` | local/public limited | process liveness only; no secret |
| GET `/health/ready` | admin/ops | RPC/DB/worker dependencies, degraded reason |
| GET `/system` | authenticated | mode, current gate, signer locked, policy version, provider health |
| GET `/market/candidates` | authenticated | paginated candidates, source age and risk flags |
| GET `/market/tokens/:mint` | authenticated | token details/evidence |
| GET `/agents` | authenticated | latest actual bot status and counters |
| GET `/decisions/:id` | authenticated | full decision trace, reason codes, source links |
| GET `/wallets` | authenticated | public wallet addresses and verified balances |
| POST `/wallets/connect-challenge` | auth path | short-lived sign-message nonce; replay protected |
| POST `/wallets/verify-message` | auth path | verify signature, bind session public key |
| GET/POST/DELETE `/smart-wallets` | owner for mutation | watchlist, requires address validation |
| GET `/copy-feed` | authenticated | observed public wallet swaps and copy decisions |
| GET `/positions` | authenticated | verified on-chain holdings and PnL confidence |
| GET `/trades` | authenticated | paginated paper/live trades explicitly separated |
| GET `/ledger` | owner | verified cash/token movements and fees |
| GET `/risk/policy` | authenticated | versioned current caps (no keys) |
| POST `/risk/policy` | owner, CSRF, re-auth | validated update, audit, signing lock on increase |
| POST `/system/halt` | owner/emergency credentials | immediately disable new entries, persist audit |
| POST `/system/resume` | owner, re-auth | verify gates then resume eligible nonlive mode |
| POST `/mode/activate` | owner, 2FA/re-auth | only after evidence and wallet mandate; separate G4/G5 approvals |
| GET `/audit/events` | owner | paginated redacted timeline, trace ID |
| GET `/events` | authenticated | SSE stream of versioned state events |
| GET `/analytics/equity` | authenticated | series with source/mode/confidence, net deposits |

**No endpoints** `POST /send-arbitrary-transaction`, `POST /sign-raw-bytes`, unrestricted `POST /withdraw` or unbounded `POST /trade`. Do not expose internal signer over public network. Use same-origin session cookies Secure/HttpOnly/SameSite + CSRF protection, origin checks, login rate limits, audit role and approvals. Schema validate query, body, and response.

## 3. SSE event envelope

```json
{
  "version": 1,
  "id": "evt_example_123",
  "sequence": "1000042",
  "type": "AGENT_DECISION",
  "mode": "OBSERVE",
  "recorded_at": "2026-11-01T00:00:00Z",
  "source_at": "2026-11-01T00:00:00Z",
  "freshness": "FRESH",
  "payload": {"decision_id": "example", "status": "SKIP", "reasons": ["NO_SWAP_ROUTE"]}
}
```

Events are append-only/logical monotonic sequence; browser resumes using `Last-Event-ID` or snapshot+cursor; out-of-order/duplicate events ignored. SSE is **presentation**, not financial instruction channel; if disconnected, worker continues or HALTs based on safety policy, not browser state. Debounce high-volume ticks and send material events; protect server from unbounded subscriptions.

## 4. Execution coordination

Durable outbox for events + workers with leases; pessimistic locking for risk budget, idempotent retries on nonfinancial tasks, reconciliation-first on signed/submitted tx. Record signed tx hash and signature before broadcast if possible (as implementation allows), and preserve audit that distinguishes *broadcast attempted* vs *landed*. DB availability required to authorize new trade. Restart must rebuild queue and reconstruct open orders from chain.

## 5. PnL and chain reconciliation tables

A reconciliation job compares token account balances and lamport balances against cumulative ledger deltas; categorizes unknown inflows/outflows, rent deposits/refunds, network/priority fees, external manual transfers. Balance mismatch => alert and prevent new entries. Realized PnL requires buy/sell cost basis and all fees; unrealized PnL uses timestamped executable quote (or uncertain marker) not merely marketing market cap. Deposit is capital flow, not strategy profit.

## 6. API-level acceptance

- OpenAPI docs generated from server schemas (or schema-first validated). Every admin mutation integration-tested for authn/authz/CSRF; rate limits and no secrets.
- DB migration on clean PostgreSQL + backup restore + replay after simulated worker restart.
- Test 2 simultaneous agents with same token: only one reserved intent, never double exposure.
- Test SSE reconnect with 500 events, no loss of material decision/settlement states; no fake zero balance on outage.
