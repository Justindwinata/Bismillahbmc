# Evidence Audit — 3 reference attachments and feasibility decision

**Date:** 2026-11-01  
**Input:** `IMG_0238.MOV` (13.0s; 1920x1080), `IMG_0239.jpg` (image), `IMG_0241.MOV` (20.4317s; 1920x1080).  
**Method:** local video sampling of multiple frames and closer inspection of legible dashboard elements, plus verification against official OpenAI/Solana/Jupiter/OJK documentation. No wallet addresses or transaction signatures were independently supplied. No chain replay performed. This is a visual/architectural audit, not authentication of claimed profits.

## Attachment A: IMG_0239.jpg

Observed: a page titled **New bot**, configured with `Name: DESK`, a Solana trading job, and instructions approximately:

- `Every lead goes SCAN -> VERIFY -> EXECUTE -> EXIT.`
- `A skip is final.`
- `You never buy, sell, sign or move funds.`

Implication: despite mention of an execute stage, the DESK role itself is **non-signing orchestration**. This supports a separate privileged executor architecture. Visual presence of characters does not imply real autonomous execution.

## Attachment B: IMG_0238.MOV

Observed UI text: `Grok Bot`, `GROKIUS terminal`; `Overview`, `Copy feed`, `Smart wallets`, `Rules`, `Risk guard`; role cards `Scout`, `Filter`, `Analyst`, `Sniper`, `Guard`; wallet radar, positions table, PnL by token, copy log, equity graph, risk guard values. Frames display large percentage gains in a short time and a high win rate. What the video **does not expose**: independently verifiable signature-linked trade fills, exact deposits and withdrawals, true starting cost basis, quotes/fills/fees, provider latency, or whether the video is a simulation/accelerated playback.

## Attachment C: IMG_0241.MOV

Observed UI text: `Grok Bot Terminal`; role cards `SCANNER`, `RUG CHECK`, `SIZER`, `EXECUTOR`, `LOGGER`, `EQUITY`; a flow `SCAN -> CHECK -> SIZE -> EXEC -> LOG`; steps/decision displays, session timer, wallet/balance ladder and event logs. The displayed balance changes sharply while clock jumps. The footage appears to show a replay/timelapse-style presentation, but the original source and transaction authenticity cannot be established from video alone. Unverified balance numbers must never be asserted as real investment returns.

## Technical feasibility matrix

| Desired capability | Verdict | Mechanism | Caveat |
|---|---|---|---|
| Build full app with Codex | FEASIBLE | Codex CLI / IDE writes, tests and runs code | not a perpetual user wallet trader by itself |
| Multiple agents with distinct roles | FEASIBLE | application worker orchestration; typed agents and audit trail | multiple LLM calls do not automatically make decisions safer |
| Agents exchange analysis | FEASIBLE | event-driven structured decision + deterministic risk policy | agents cannot override Guard veto |
| Read real-time Solana activity | FEASIBLE | RPC/WebSocket + bounded third-party feeds | latency, rate limits, downtime, reconciliation needed |
| Track wallet buys/sells | FEASIBLE | public address subscriptions and chain decoding | history and inferred wallet skill may be misleading |
| Execute genuine token swaps | FEASIBLE CONDITIONAL | Jupiter Swap API v2, approved transaction signing | requires supported route, liquidity, wallet SOL, valid network and security checks |
| Buy and sell without manual click per order | FEASIBLE CONDITIONAL | one-time owner-authorized live mode with bounded risk, isolated hot-wallet signer | can't promise no intervention in an emergency; no automated bank KYC |
| Work 24/7 | FEASIBLE CONDITIONAL | independent always-on worker and reliable infrastructure | requires hosting, operational oversight and continuous provider access |
| Identical speed to video | NOT ESTABLISHED | unknown video infrastructure and execution path | no latency/transaction proof |
| Identical earnings / 100% win | NOT GUARANTEED | no reliable deterministic mechanism | significant risk of total capital loss |
| ChatGPT Plus as unlimited model API budget | NO | API account separate billing | Codex plan quota != deployed bot's continuous model inference allowance |
| Autonomous banking/IDR cashout without exchange onboarding | NOT ASSUMED | provider-specific regulated transfer rails | compliance/KYC and beneficiary verification may need human action |

**Conclusion:** The target is technically buildable as an autonomous **bounded** blockchain trading system, not as a profit-predicting guarantee. Codex should be commissioned to build the independent service; the ultimate acceptance demonstration must show real signed/confirmed mainnet BUY and SELL on a separate capped trading wallet, after full security gates and owner activation. Until then the product status stays `NOT_LIVE_VERIFIED`.

## Gaps needing independent verification by Codex in M0

1. Current Jupiter Swap API version, availability, keys, fees, rate limits and route access for intended token/pair mix.
2. Mainnet market data provider capabilities, subscriptions and free-tier budget versus target alert rate.
3. Wallet/signer operating environment under Windows/WSL and host compromise consequences.
4. Actual third-party product branding and video origin: unverified; **do not** reverse engineer or claim SDK integration based only on the UI.
5. Which venues/tokens can be bought/sold via Jupiter vs launchpad route: skip when unavailable, no invented alternative.
6. Paper-trading calibration: latency, fillability, fees, missed entries and exit liquidity; many seemingly profitable backtests are overstated.
7. Indonesian OJK/exchange permissions, supported SOL on/off-ramp and tax rules as of actual use date.

## Source links and recency

- Codex: https://learn.chatgpt.com/docs/codex/cli
- ChatGPT/Codex limits: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- ChatGPT and API separate billing: https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- Jupiter API v2: https://developers.jup.ag/docs/swap/index , https://developers.jup.ag/docs/swap/order-and-execute
- Solana fees and token design: https://solana.com/docs/core/fees , https://solana.com/docs/tokens
- DEX Screener: https://docs.dexscreener.com/api/reference
- OJK whitelist and rulebook: https://ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/OJK-Terbitkan-Whitelist-Penyelenggara-Perdagangan-Aset-Keuangan-Digital-Dan-Aset-Kripto-Berizin.aspx , https://ojk.go.id/id/regulasi/Pages/POJK-23-2025-Perubahan-POJK-27-Tahun-2024-tentang-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-Termasuk-Aset-Kripto.aspx
