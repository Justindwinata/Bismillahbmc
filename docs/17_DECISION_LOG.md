# 17 — Decision Log (ADRs to verify and refine in Codex M0)

| ADR | Decision | Why | Trade-off / revisit |
|---|---|---|---|
| ADR-001 | Standalone web app, not dashboard inside Codex | 24/7 runtime and mobile access independent of IDE | requires server operations |
| ADR-002 | TypeScript monorepo, Next.js UI, typed API/worker | one code ecosystem and explicit types | exact framework version at M0 |
| ADR-003 | PostgreSQL DB with outbox/locks | prevent duplicate/excess trades in multi-process runtime | more setup than SQLite; justified for durability |
| ADR-004 | Distinct Phantom primary and limited hot-wallet signer | Phantom connects UI; unattended backend needs independent signing | hot wallet remains risky; owner only deposits approved small amount |
| ADR-005 | Jupiter Swap API V2 initial execution route | documented mainnet swap route | unsupported or unreached tokens => SKIP |
| ADR-006 | Deterministic safety/risk logic; LLM optional | cannot entrust funds to stochastic chat outputs | less flashy but auditable |
| ADR-007 | Mode OBSERVE default, G4/G5 human permission | prevent accidental real purchases | requires supervised activation |
| ADR-008 | Genuine smart-wallet public mirror signals, NOT blind copy | copied price/routes differ and signals can be manipulated | lower trade frequency |
| ADR-009 | SSE from backend for user-facing live updates | sufficient responsive dashboard, simple recovery | reconsider websocket only for bidirectional live collaboration |
| ADR-010 | No automated transfer to banking/exchange | withdrawal is high-risk, requires human/platform steps | in-app manually signed sends optional future scope |
| ADR-011 | Separate paper/live ledger, on-chain reconciliation | accuracy and truthful equity | more accounting complexity |
| ADR-012 | No exact performance benchmark from reference videos | authenticity and strategy profitability unverified | demo visual structure only |

Codex must record any change as new ADR entry with rationale, source and code impact, not quietly contradict other docs. `01_MASTER_PRD.md` governs product, `AGENTS.md` governs hard safety, stricter security rules prevail on conflict.
