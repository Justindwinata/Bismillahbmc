# 07 — Dashboard UI/UX Specification and Reference Mapping

Build **original product UI** resembling the information density and real-time operation of the supplied videos, not a cloned logo or fake performance reel. See `references/0238_contact.jpg`, `references/0241_contact.jpg`, and `references/IMG_0239.jpg`. No static mock wallets, fabricated gains or success animations are allowed in LIVE mode.

## Design system

- Theme: professional dark trading terminal (charcoal, graphite, muted magenta/pink primary, clear teal/green healthy, amber caution, red danger, blue information). Readable font, accessible contrast AA target, high-density desktop layout, mobile responsive (375px), keyboard navigation and semantic status labels.
- Every time-series value includes **mode, source, last-update age, currency/denomination, and uncertainty**. Green/red denotes state with text labels; `UNKNOWN` never rendered as zero. Main mode badge always visible: `OBSERVE`, `PAPER`, `SHADOW`, `MICRO_LIVE`, `CAPPED_AUTO`, `HALTED`.
- Render data from actual backend event stream; if backend offline show `DISCONNECTED`, reconnect with last snapshot labeled stale. Never animate simulated fills into mainnet history.

## Screens/route catalog

| Route | Contents & interactions | Backend provenance |
|---|---|---|
| `/` Overview | net equity graph, Solana status, active mode, risk budget, 11 agents, positions, wallet radar, trade tape | portfolio snapshots, agents, chain |
| `/agents` | Scout/Filter/Analyst/Sniper/Guard + Scanner/Rug Check/Sizer/Executor/Logger/Equity in unified pipeline, state/timing, decision trace | agent events |
| `/discover` | token scanner, pair freshness, liquidity/volume, security reasons, copy mint, explorer links | market provider + on-chain mint |
| `/copy-feed` | watched-wallet trade timeline, lag, signals rejected/accepted, our own related intents | wallet signatures & decisions |
| `/smart-wallets` | manage **public** wallet watchlist, history, quality, settings; no private keys | indexed chain data |
| `/positions` | holdings, quantity, entries, current quotes, realized/unrealized PnL, exit-blocked flags | fills + wallet state |
| `/trades` | real & paper trades **separate**, tx hashes, commitment, fees, quote and receipts | execution ledger |
| `/risk` | emergency stop, exposure, drawdown, guard veto feed, signer/provider status, limits | risk policy and health |
| `/rules` | owner-authenticated policy editor, change history, risk limits and explanations | versioned policy |
| `/wallets` | Phantom connect, read-only balances, hot-wallet public address, funding & withdrawal instructions | Solana RPC |
| `/analytics` | net-of-deposits equity, drawdown, loss/win ratio with sample size, costs, provider quality | accounting snapshots |
| `/settings/integrations` | RPC/Jupiter/DEX/LLM health, cost budget and keys configured (not shown) | adapter status |
| `/audit` | signed-event correlations, full stage trace, receipts, export redacted CSV/JSON | immutable audit events |
| `/setup` | beginner onboarding, network warning, wallet split guide, acceptance gates | setup state |

## Primary desktop overview hierarchy

```
Top nav: SOLANA SENTINEL | MAINNET | OBSERVE [mode] | live data quality | STOP
Sidebar: Overview / Copy Feed / Smart Wallets / Discover / Agents / Positions / Trades / Risk / Wallets
Main row 1: net equity & deposit-adjusted result | balances | open exposure
Main row 2: equity historical chart | wallet radar / observed alerts
Main row 3: Scout -> Filter -> Analyst -> Sniper -> Guard (expand to all roles)
Main row 4: Open positions & PnL per token | live decision / copy activity log
Footer status: data latency, provider errors, ledger reconciliation, signer lock
```

Agent pipeline detail page also offers Video B view: `SCAN → RUG CHECK → SIZE → EXECUTE → LOG → EQUITY`. These are projections of the same backend decisions; any stage click shows actual evidence and rejection reasoning. No ungrounded progress percentages.

## UX states & safeguards

- App skeleton (loading), healthy streaming, stale data, disconnected, provider degraded, no wallet, not funded, insufficient fee reserve, signer locked, trading halted, transaction uncertain, exit blocked, pending manual verification.
- Default `OBSERVE` is read-only. Live enable requires reauthentication, required risk caps, system gate PASS and explicit warning confirmation; owner sees assigned trading wallet and cap, not just button `Start Bot`.
- **Emergency stop** always above fold, available with keyboard and mobile, clearly states “mencegah entry baru; transaksi yang sudah dikirim mungkin tetap settle; exit posisi tidak dijamin”.
- Funding and withdrawal screen shows address QR/copy, chain name SOLANA, first/last address, test transfer guide, explorer verification. No blind automatic transfer or generated bank withdrawal.
- PnL charts must distinguish `verified on-chain`, `estimated mark-to-market`, `paper`, and `unavailable`; include cost/fee/deposit adjustments. Win rate unavailable if no settled closed trades.

## Browser acceptance with Playwright CLI

1. Dashboard loads with real backend health and no fake positions; screen 1440×900, 390×844, keyboard check.
2. Fake auth/CSRF attempts denied; unprivileged viewer cannot change risk.
3. Disconnection flips stale indicator; updates reconnect without duplicate events.
4. Agent veto correctly prevents BUY in UI and ledger; reason is drillable.
5. Emergency stop both calls actual backend command and makes new orders impossible.
6. PAPER and LIVE visually unambiguous, signature links only for real chain transactions.
7. Phantom connect does not request mnemonic; user receives explicit wallet separation reminder.
8. Screenshot and Playwright traces saved per milestone; do not mark UI complete from JSX existence alone.
