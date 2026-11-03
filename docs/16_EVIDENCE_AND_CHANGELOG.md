# 16 — Evidence Ledger and Development Status Template

## Current status at package creation

**2026-11-01:** SPECIFICATION COMPLETE (V2 baseline). Implementation NOT_STARTED. No code, no DB, no tests, no live connection and no verified trades are claimed. Reference visuals have not been independently authenticated on-chain.

## Status convention

Codex creates/updates root `IMPLEMENTATION_STATUS.md` after every phase with:

| Field | Mandatory meaning |
|---|---|
| Milestone | M0–M8 and exit gate G0–G5 |
| Status | NOT_STARTED / IN_PROGRESS / PASS_WITH_EVIDENCE / FAIL / BLOCKED / NOT_RUN |
| Baseline | commit hash before work; branch; dirty state |
| Delta | exact changed files and user-visible capabilities |
| Verification | command, timestamp, exit code, test count, evidence link |
| Safety | secrets checked, signer on/off, mode and financial exposure |
| Limitations | what is absent or known broken; risks |
| Next | next task and external owner action if any |

### Sample entry (template only)

```
M1: NOT_STARTED
Provider live-read smoke: NOT_RUN
Tests: NOT_RUN
Mainnet signing: DISABLED
External blockers: may require RPC API access
Next action: implement read-only connector and freshness monitor
```

## Evidence path conventions

`evidence/M0/`, `evidence/M1/`, etc.; reserve `evidence/G4/` for real mainnet transaction proofs with public signatures **after owner approval**. Each evidence folder should have sanitized `COMMANDS.md`, `RESULTS.md`, code baseline hash, and artifacts (logs/screenshot/trace). Never include secret env files, private transaction signer data or mnemonic backups.

## Release notes

A release must state version, commit hash, platform tested, previous version compatibility, migration/rollback, mode matrix, test suite run, live status, critical risks, user operational commands, and how to STOP. A large ZIP or number of lines is not proof of correctness.
