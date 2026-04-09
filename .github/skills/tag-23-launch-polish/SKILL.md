---
name: tag-23-launch-polish
description: "Use when: Tag-23 launch polish, feature freeze decision, bug hunt prioritization, pre-launch checklist, release readiness"
---

# Tag 23 Launch Polish

## Purpose

Run a strict, no-new-features quality pass before launch.

## Scope

This skill focuses on:

- Feature Freeze gate decision
- Bug-hunting across critical modules
- Risk prioritization for launch
- Functional pre-launch checks

This skill does **not** implement new features.

## Workflow

1. Freeze Gate

- Check core features, tests, and happy path
- Decide `FREEZE_ON` or `FREEZE_OFF`
- Park all new ideas in `POST_LAUNCH.md`

2. Bug Hunt (staged)

- Pick top 3 critical files (API route, Auth, Frontend logic)
- Analyze for logic bugs, edge cases, null/undefined risks, missing error handling, async race conditions
- Use severity labels: `CRITICAL`, `MAJOR`, `MINOR`, `COSMETIC`

3. Prioritization

- Convert findings into execution buckets:
  - `BLOCKER`
  - `CRITICAL`
  - `SHOULD-FIX`
  - `NICE-TO-HAVE`
- For `BLOCKER` and `CRITICAL`: include concrete fix approach, effort, and verification test

4. Functional Pre-Launch Check

- Happy path walkthrough
- UX quick checks
- Accessibility basics
- Responsive check at 375px
- Output decision: `GO`, `GO_WITH_RISKS`, or `NO_GO`

## Explicit Non-Automated Items

These are intentionally applied directly in project code after analysis:

- Loading states with `finally`
- Central `apiFetch()` with 401/session expiry handling
- Human-friendly error messages
- Empty states for no-data screens
- Auth UX flows (bad login, expiry, logout, guarded routes)

## Output Contract

Always provide:

1. Prioritized findings
2. Next best action
3. Smallest safe fix first
