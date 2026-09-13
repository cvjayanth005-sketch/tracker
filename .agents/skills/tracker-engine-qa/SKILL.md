---
name: tracker-engine-qa
description: >-
  Automates full-stack QA, domain decision-engine rule verification, build checks, and DOCX/JSON QA report generation for the Fat Loss Ledger / PawTrack project. Use when running build validation, auditing domain rule invariants, or generating QA reports.
---

# Tracker Engine QA & Rule Audit

## Overview
The `tracker-engine-qa` skill provides automated full-stack verification, domain rules engine invariant validation, and executive DOCX/JSON report generation for the Fat Loss Ledger / PawTrack project.

## Quick Start
Run full-stack verification and generate JSON audit report:
```bash
uv run python .agents/skills/tracker-engine-qa/scripts/run_qa.py verify --output qa_summary.json
```

Audit domain TypeScript rule invariants and test coverage:
```bash
uv run python .agents/skills/tracker-engine-qa/scripts/run_qa.py check-invariants --output invariants_report.json
```

Generate executive DOCX report:
```bash
uv run python .agents/skills/tracker-engine-qa/scripts/run_qa.py generate-report --summary qa_summary.json --output PawTrack_QA_Report.docx
```

## Utility Scripts

### `scripts/run_qa.py`

Subcommands:

- **`verify`**:
  - `npm --prefix frontend run build` (`tsc -b && vite build`)
  - `npm --prefix frontend run test` (`vitest run`)
  - `npm --prefix frontend run lint` (`oxlint`)
  - `pytest` in `backend/`
  - Output: JSON summary specified via `--output` flag.

- **`check-invariants`**:
  - Audits `frontend/src/domain/rules.ts` for `RULES_VERSION` existence.
  - Verifies unit test coverage files (`*.test.ts`) across all domain files.
  - Output: Invariants JSON report specified via `--output` flag.

- **`generate-report`**:
  - Formats test summary results into executive `.docx` report.
  - Required arguments: `--summary <json_path>` and `--output <docx_path>`.

## Invariant Rules Enforced

1. **`null` vs `0`**: `null` is unknown/unlogged; `0` is a logged zero. Averages skip nulls.
2. **Trailing Trends**: No decision reads raw daily weights or paces — only trailing averages with minimum reading thresholds.
3. **Non-Overlapping Windows**: Week-over-week comparisons use non-overlapping windows.
4. **Rules Decide, AI Narrates**: All decision calculations stay pure in TypeScript (`frontend/src/domain/`).
5. **Cache Bumping**: `RULES_VERSION` must be incremented in `rules.ts` whenever rule logic changes.

## Common Mistakes

- **Forgetting `--output` argument**: The CLI helper enforces explicit file output paths.
- **Skipping `vitest` domain tests**: Any domain code edit must pass all pure TS tests (`npm --prefix frontend test`).
- **Editing rule logic without bumping `RULES_VERSION`**: Invalidates AI commentary note cache consistency.
