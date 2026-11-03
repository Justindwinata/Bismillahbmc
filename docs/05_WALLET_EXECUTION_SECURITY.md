# 05 — Wallet, Phantom, Signing, Mainnet Execution, Security

## A. Three separate wallet concepts

1. **Phantom owner wallet (primary):** connects via official Phantom browser provider; read public address, balances, asset inventory and perhaps sign a manual test message; user manually funds or withdraws from authorized account. No owner seed exported into app. Browser may disconnect; worker should still work independently from Phantom once the designated trading wallet is funded and activated.
2. **Dedicated trading hot wallet (secondary):** new limited-funds account *owned by user*. User funds it manually from Phantom/exchange. It has no authority over main Phantom wallet. Exposed capital may be lost if compromised; never store entire savings here. User can sweep funds manually to an address they control, with careful address/network verification.
3. **Signer service (execution role):** narrowly scoped internal service that holds/decrypts trading hot wallet secret in OS credential store/KMS/HSM appropriate to deployment, not in frontend, not in source, never in AI context; receives only signed-off typed intent + verified tx. Can be disabled independently and locks after policy change, restart or suspicious conditions as designed.

**Phantom Auto-Confirm is not a substitute for continuous headless signing.** Phantom docs describe supported dApps and temporary permission; as checked 2026-11-01, up to 10 tx/min for 2 hours on supported apps, not universal indefinite permission. Do not silently assume our app is supported. It can be a convenience for manual wallet flows, not the autonomous mainnet backend.

## B. Owner onboarding / explicit activation

1. Explain phishing, seed safety, chain identity, network fee, slippage, price impact, rent, token risk, loss up to 100%, supported assets and exchange/regulatory considerations.
2. `Connect Phantom`: connect wallet public key, challenge nonce with expiry, verify signed message if auth binding needed; never auto-authorize trades from connection alone.
3. Choose `OBSERVE` then configure data providers; monitor public chain without wallet signing.
4. Create a dedicated hot wallet via locally audited method under operator custody (outside LLM and public web app); store encrypted securely, separate from primary Phantom. Keypair generation/import is NOT an automatic Codex action using user funds.
5. User manually performs a tiny transfer over Solana to trading wallet after checking addresses, network and first/last characters; wait for explorer confirmation. Do not autofill irreversible destination without owner review.
6. Set explicit caps, preserve fee/ATA reserve, risk disclosures; re-authenticate owner, verify gate and activation phrase/session token; capture policy version/hash and scope. `LIVE_TRADING_ENABLED` env alone is insufficient.
7. For `MICRO_LIVE`, test carefully chosen supported liquid route with one small real BUY and SELL, after a separate user approval. Use snapshots of chain balances, decoded instructions and signatures. Never claim success if transaction fails or position can't be liquidated.
8. For `CAPPED_AUTO`, another review must accept maximum account-level loss, hourly trade rate, kill switch, unattended period and watcher/alert mechanism. Expire activation after configurable session; after expiration stop new orders until renewed.

## C. Restricted signer design (M3+)

- Signer request includes: immutable intent ID; signed owner activation token; policy hash; wallet; input/output mint; max in/min out; max fees; quote ID and expiry; preapproved program IDs; serialized tx hash; decoded instruction set; nonce/request timestamp. All inputs server-to-server authenticated (mTLS or Unix domain socket; no public HTTP endpoint).
- Signer **independently** validates: requested network/genesis, expected fee payer/owner, all addresses, all top-level instructions and address lookup tables (ALT), allowed programs/Token-2022 extensions, token flow, rent/fee/sponsor limits, max spend from state, absence of unauthorized transfers, message digest and no extra signers. If decompilation incomplete => deny.
- `x-api-key` provider API key is not a wallet key. Never trust returned Jupiter swap transaction solely because its URL says Jupiter; validate payload and destination.
- The presence of `Tokenkeg`/Token-2022 does not certify safety. Reject transfer hooks or unknown extensions until integration can verify semantics.
- Avoid exporting private key to environment variables/plaintext .env on a VPS. Local development may use ephemeral test keypairs stored outside Git; production requires encrypted secret manager, least privilege, isolated host/container/network ACL, secure backup and recovery ceremony.
- Rate/amount limits enforced twice (risk engine and signer independent policy) and never enlarged by the trade proposal. Signer has standalone emergency disable independent of web UI.

## D. Solana execution happy-path

1. Guard approves a typed `ExecutionIntent` under already-activated live mode.
2. Executor obtains current account balances, latest block context and fresh Jupiter `/swap/v2/order` quote/transaction for precise mint+amount/taker (check current schema before coding).
3. Validate expected input/output, min-out, price impact, account ownership, program list, token extensions, ALT, fee reserve, quote lifetime, policy digest. Reject if unverifiable.
4. Sign via isolated signer, durable DB commit of intent/signature hash, submit through documented Jupiter `/execute` (or a single specifically supported alternative flow with ADR), store request and response with secrets redacted.
5. Confirm independently using Solana RPC `getSignatureStatuses`, then `getTransaction`, inspect `meta.err`, input/output token balance deltas, actual fees, slots and correct wallet; reconcile positions. Do not equate an API `success` flag with final truth until chain corroboration.
6. If API timeout after sign/broadcast, keep `UNCERTAIN` and reconcile existing signature; do not make a fresh buy because market price changed.
7. Post validated fill events and counters, update dashboard; user can open Solana Explorer link for each signature.

**Jupiter route caveat:** token launches before Jupiter liquidity is routable may not be tradable. That is a valid SKIP; no undocumented injection, MEV/fake route fallback, or bypass of platform anti-bot controls.

## E. Sell/exit rules

- All STOP/TP conditions use measured prices, not arbitrary UI values; exact target choice belongs to the owner and should be tested in paper/shadow before live.
- Exits are *attempts*, not guarantees; slippage, rug pull, frozen tokens and missing liquidity may prevent sale. Allow controlled retry only when original outcome known and every attempt re-evaluates risk.
- Emergency stop default means cancel new buys, do not call any arbitrary transaction. Existing positions remain tracked. Optional emergency reduction policy is separately configured (and may fail).
- Never auto-withdraw to bank/exchange. User manually transfers back to owned Phantom or regulated venue; if an in-app transfer tool is ever added, owner authenticates and individually approves destination/amount through a wallet interaction—no unattended withdrawal path.

## F. Threat model & test cases

| Attack / failure | Control | Test |
|---|---|---|
| prompt injection in token metadata | sanitized, typed trusted inputs | malicious name cannot alter agent modes |
| malicious swap tx injected by provider | independent instruction decode & allowlist | unexpected SOL transfer denied |
| signer endpoint exposed publicly | bind private interface, auth, firewall | unauthenticated remote request rejected |
| main Phantom secret stolen | NEVER accessed or stored | static and runtime scans |
| worker compromise | no secret in worker, signer independent guard | attack cannot exceed signer cap |
| false price/oracle manipulation | cross-source, quote validation, freshness | feed disagreement triggers reject |
| wallet drain via duplicate intents | unique intent id / atomic budget / chain reconciliation | crash and retry at every boundary |
| fees deplete 1 SOL | cap priority/network and per-day fee | stop before reserve breach |
| altered policy in database/browser | reauth, signed/versioned activation | silent cap raise denied |
| API/provider downtime | circuit breaker, halt entries | outage chaos test |
| malicious third-party dependency | pinned lockfile, scan, review | fail build on critical issue or documented exception |
| leaked seed in logs/screenshot | redact, controlled observability | secret canary scan |

## G. Ownership and operational disclosure

No configuration can eliminate loss, including full loss. 1 SOL is the user's approximate available capital, **not an authorized transfer or risk mandate**. Do not suggest sending 1 SOL into a brand-new automated bot. Production release is technically feasible but conditional on audits and external on-chain proof; avoid guaranteeing profitability.
