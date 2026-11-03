# 06 — Real Provider Integration Matrix

**Verified 2026-11-01; verify again at implementation.** All providers are accessed behind typed, versioned adapters, contract tests, timeouts, rate budgets and circuit breakers. Third-party market prices are NOT equivalent to real fills.

| Provider | Purpose | P0 | Important caveat |
|---|---|---|---|
| Solana HTTP RPC | read mint/accounts, send/verify transactions | required | public endpoint rate-limited, confirmation != broadcast |
| Solana RPC WebSocket | live logs and wallet monitoring | required | reconnect + backfill after gaps |
| Jupiter Swap API V2 | quote, assembled transaction, real buy/sell | required | `/order` + `/execute`; routes not always available |
| DEX Screener | pool discovery, liquidity, volume and prices | required or equivalent | delayed/estimated values, not settled balance |
| Phantom browser provider | connect primary wallet, manual fund/withdraw | required | cannot promise endless automatic signing |
| Token Program & Token-2022 on-chain | mint authorities and transfer restrictions | required | unknown extensions => DENY |
| RugCheck or equivalent risk | optional supplemental scam signals | optional | never replace primary on-chain checks |
| Helius/private RPC/indexer | low-latency subscriptions, wallet decoding | optional | quotas/fees must be approved |
| OpenAI API | optional model-assisted analysis/explanations | optional | separate billing from ChatGPT Plus |
| OJK-licensed exchange | IDR↔SOL onboarding | manual external step | verify license, KYC, withdrawal chain |

## A. Jupiter connector

Reference: https://github.com/jup-ag/docs/blob/main/swap/index.mdx and https://github.com/jup-ag/docs/blob/main/swap/order-and-execute.mdx . The 2026 docs describe `https://api.jup.ag/swap/v2/order` and `/execute` (Meta Aggregator), or distinct Router `/build` path. Select one protocol with ADR. Document live API auth/keyless current state: docs may differ about keyless availability vs API-key requirements, so verify with harmless provider discovery before depending on it. Never mix `/build` response with `/execute` unless docs explicitly support it. No route => skip, not a fictitious fill.

Required adapter methods: `getQuote(exactMint, amount, taker)`, `decodeAndVerifyUnsignedTx`, `submitSignedOrder`, `parseResponse`, `getProviderHealth`; include request IDs, sanitized response fixture, network/fee/slippage data, timeout and quota handling. Pass serialized transactions only to isolated verifier/signer, never client browser LLM.

## B. Solana connector

Implement `getMintState`, `getTokenAccounts`, `getNativeBalance`, `getSignaturesForAddress`, `getTransaction`, `getSignatureStatuses`, target WS subscriptions, and cursored backfill. Slot/finality and provider receive time are logged. `sendTransaction` successful response is NOT proof it landed. `blockSubscribe` not universally available; use targeted logs/account subscriptions when applicable. One data source may fail or reorganize; recover with idempotent historical reads.

## C. Market discovery and wallet mirroring

Use canonical **mint address** and **pair address**, not ticker. DEX Screener API: https://docs.dexscreener.com/api/reference . Parse missing liquidity/volume explicitly. Track only bounded user-selected public smart wallet addresses. Infer swaps from chain token balance deltas and instructions; confidence-coded parsing, unknown cannot be copied. Avoid promises of zero-lag mirroring or matching source wallet entry prices.

## D. Phantom details

Official integration: https://docs.phantom.com/solana/integrating-phantom . Connect/Disconnect and optional nonce-challenge authentication in browser. The supported auto-confirm feature is time-limited: https://help.phantom.com/articles/19385761078547 (describes up to 10 tx/min over two hours for supported apps). Backend autonomous trading must use a distinct hot-wallet signer with owner mandate. Phantom main wallet seed is never supplied to Codex. Manual off-ramp always needs user interaction on exchange/wallet.

## E. Operational integration quality

For each adapter maintain an integration report: doc URL/date; API version; live read-only smoke (if permissible); fixture and parser tests; quota, retries and rate failures; source quality timestamps; latency; estimated cost and free-tier fit; fallback policy; secret handling. Any paid provider needs explicit budget approval. Preserve HTTP-level errors in sanitized logs without storing auth headers.

Further sources: https://solana.com/docs/rpc ; https://solana.com/docs/tokens ; https://solana.com/docs/rpc/http/sendtransaction ; https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform ; https://ojk.go.id/id/Fungsi-Utama/ITSK/Perizinan-ITSK-Aset-Keuangan-Digital-Aset-Kripto/
