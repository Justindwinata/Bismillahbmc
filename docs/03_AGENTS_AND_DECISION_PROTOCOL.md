# 03 — Agent Catalog, Roles, Discussion Protocol, Orchestration

## A. Design principle

The reference videos display bot **roles**. Implement them as **actual independently testable workers/modules**, with state and timestamps. Real-life intelligent multi-agent activity does not require 10 separate LLM calls. At first: deterministic, explainable modules; P1 optional LLM read-only analyst council with schema validation, cost cap and fixed prompt versions. Text opinions cannot execute trades.

## B. Role ownership and inputs/outputs

| Code | Bot shown in UI | Inputs | Obligatory output | Authority | Fail-safe |
|---|---|---|---|---|---|
| A00 | DESK / Orchestrator | candidate stream; mode; policy hash | evaluation session with stages/evidence references | route events; no signing | SKIP session |
| A01 | SCOUT / Scanner | live pair/pool events, wallet signals | `TokenCandidate` + evidence IDs | discover only | no candidate |
| A02 | FILTER | candidate, liquidity/volume, freshness | `FilterAssessment PASS/REJECT/UNKNOWN` | candidate veto | REJECT |
| A03 | RUG CHECK / Security | mint state, supply, token extensions, holder/route metadata | `SecurityAssessment PASS/REJECT/UNKNOWN` | **hard veto** | REJECT |
| A04 | ANALYST | valid historical market features | `SignalAssessment` score, confidence, evidence | read-only signal | SKIP |
| A05 | SNIPER / Strategy | signal, policies, observed wallet trades | `TradeProposal BUY/SELL/SKIP` | propose entry/exit | SKIP |
| A06 | SIZER | balance, reserve, caps, quote | exact `amount_base_units`, position/cost budgets | propose limited size | size=0 SKIP |
| A07 | GUARD / Risk Governor | all assessments, policy, trade state | `ALLOW/DENY/HALT` + reason codes | final veto; cannot sign | DENY/HALT |
| A08 | EXECUTOR | approved unexpired ExecutionIntent | tx lifecycle states, signature, cost | only execution with isolated signer | uncertain→quarantine |
| A09 | LOGGER / Auditor | every event, fills, decisions | append-only audit and reconciliation evidence | observe only | alert and halt new trades on lost audit |
| A10 | EQUITY / Portfolio Observer | owned accounts, trades, prices | balances and PnL with confidence | observe only | UNKNOWN display |

Sidebar names may use `Scout`, `Filter`, `Analyst`, `Sniper`, `Guard` as Video A view and `Scanner`, `Rug Check`, `Sizer`, `Executor`, `Logger`, `Equity` as Video B view, but both are projections of the same unified pipeline. `Copy Feed`/`Smart Wallets` are **data feeds/strategies**, not magical privileged agents.

## C. Decision event protocol

Every stage writes immutable `AgentEvent` with: `event_id`, `decision_id`, `candidate_mint`, `stage`, `run_id`, `source_ids`, `source_at`, `received_at`, `slot`, `policy_version`, `strategy_version`, `model_version?`, `outcome`, `reason_codes[]`, `confidence?`, `duration_ms`, `expires_at`, `input_hash`, `output_hash`. Idempotent event consumption with unique `event_id` plus logical candidate/window dedupe. No bypass from frontend chat message.

**Required ordering for new positions:** source fresh -> candidate -> market filter -> on-chain security -> analytical signal -> trading proposal -> sizing -> pre-risk -> quote -> transaction validation -> final-risk with updated balances/quote -> isolated signing -> submission -> confirmation -> reconciliation -> ledger -> portfolio/exit monitor. Log rejection at every step. Exit proposals follow a similarly protected workflow, but risk policy prioritizes safe exposure reduction over new buys while still checking scam routes.

## D. Discussion / disagreement logic

- `Scout` nominates a mint, `Filter` and `Rug Check` provide independent assessments, `Analyst` and `Strategy` propose trade only with valid evidence, `Sizer` computes bounded nominal, Guard authorizes or vetoes.
- **No majority vote** over hard risk checks; role outputs independently persisted, show dashboard “why BUY/SELL/SKIP”.
- An LLM can summarize why Guard rejected, but it may **not** alter reason codes, mint, amount, signer eligibility or ledger truth.
- Disagreement between strategies -> `SKIP` absent explicit deterministic policy; unknown/stale -> fail closed.
- Internal message content from token name, website, Telegram/social or LLM is untrusted; strip controls, escape UI, guard against prompt injection.
- Avoid heavy calls on each price tick. Trigger only on candidate change/threshold crossing, cache, set provider cost/rate limits. `LLM_ENABLED=false` default.

## E. Pseudocode contract (illustrative, not executable source)

```ts
async function handleCandidate(candidate: TokenCandidate): Promise<Decision> {
  assertFresh(candidate);
  const market = await filter.evaluate(candidate);
  if (market.state !== 'PASS') return recordSkip('MARKET_REJECT_OR_UNKNOWN');
  const security = await rugCheck.evaluate(candidate);
  if (security.state !== 'PASS') return recordSkip('TOKEN_SECURITY_REJECT_OR_UNKNOWN');
  const analysis = await analyst.evaluate(candidate);
  const proposal = await strategy.evaluate(candidate, analysis);
  if (proposal.action === 'SKIP') return recordSkip('NO_ENTRY');
  const sized = await sizer.propose(proposal, currentChainBalance());
  const precheck = guard.precheck(sized, currentPolicy());
  if (precheck !== 'ALLOW') return recordSkip(precheck.reason);
  const quote = await quoteProvider.getFreshQuote(sized);
  const verified = verifier.validateQuoteAndTransaction(quote, sized);
  const finalCheck = guard.finalCheck(verified, latestBalanceAndPolicy());
  if (finalCheck !== 'ALLOW') return recordSkip(finalCheck.reason);
  return executionQueue.enqueueUnique(verified.executionIntent);
}
```

Note: no direct tool to sign in this function; execution queue does not imply active signer. In OBSERVE/PAPER/SHADOW the queue never signs.

## F. Each agent card acceptance

Every bot card includes: colored state `IDLE/RUNNING/PASS/VETO/DEGRADED/HALTED`, latest evaluated token (mint abbreviated + copy), last input timestamp, last decision, duration, current queue, number considered/accepted/rejected, evidence link and version, provider health. Failing API never renders success animation. Clicking opens trace details with stage inputs/outputs (redacted).

## G. Optional LLM council (not required for real live trades)

- Fixed schema/json response, schema validator (Zod), temperature choices documented, prompt version/hash, timeout and budget; no trading credentials or shell tools.
- LLM receives only sanitized summarized data; never raw secret-bearing HTTP metadata; no freeform “call this endpoint”.
- If model API unavailable, UI says “AI advisory unavailable”; deterministic analysis continues only if all specified policy gates remain met; otherwise SKIP.
- Benchmark whether LLM adds measurable value vs deterministic baseline in out-of-sample and forward evaluation. Never imply multi-agent AI automatically improves profitability.

## H. State machine and controls

Actor roles: owner/admin only for configuration and live activation, viewer for read-only dashboards (if multi-user later), service accounts for workers. Agent cannot create users, modify risk limits, approve fees or flip mode. All risk policy changes audited with actor, old/new values, reason, version, explicit re-auth. A bot may request change but must wait for human review; never self-authorize higher exposure.
