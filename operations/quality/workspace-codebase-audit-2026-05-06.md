# Workspace Codebase Audit (2026-05-06)

## Scope
Tracked repository code inventory used for workspace-wide documentation synchronization.

## Coverage Summary
- Total tracked code/config files in audit scope: 594
- Apps boundary files: 472
- Services boundary files: 69
- Packages boundary files: 31
- Infrastructure boundary files: 0 (no tracked code/config files with audited extensions)
- Scripts boundary files: 8

## Extension Distribution
- `.ts`: 343
- `.tsx`: 172
- `.mjs`: 15
- `.cjs`: 2
- `.json`: 46
- `.yml`: 5
- `.yaml`: 2
- `.sql`: 9

## Notes
1. Inventory is based on tracked files (`git ls-files`) to avoid dependency and generated artifacts.
2. This audit is intended to anchor repo-owned documentation synchronization work.
3. Runtime-generated artifacts (for example sqlite wal/shm and transient evidence exports) are excluded from ownership decisions.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
