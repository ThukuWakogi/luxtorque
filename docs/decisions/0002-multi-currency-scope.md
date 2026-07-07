# 0002 — Multi-Currency / Multi-Tax-Jurisdiction Scope (Phase 1)

**Status:** Accepted
**Date:** 2026-07-07
**Decided by:** User

## Decision
C — Add `currency_override` and `tax_rate_override` as nullable columns now so the schema is forward-compatible, but implement no validation or business logic around them in Phase 1.

## Rationale
We want the schema to be forward-compatible without expanding Phase 1 scope into business logic.

## Impact on TASK-006
- `Branch` table includes `currency_override VARCHAR(3)` and `tax_rate_override NUMERIC(5,4)`,
  both NULLABLE.
- No validation, no business logic, no application-layer handling in Phase 1.
- A `TODO` comment must mark them as unimplemented.

## Alternatives considered
- **A:** Not chosen because it would expand Phase 1 scope beyond the current need.
- **B:** Not chosen because the schema should remain forward-compatible for future multi-jurisdiction use.
- **C:** Chosen because it balances compatibility with a constrained Phase 1 implementation.

## Source
Direct confirmation from User on 2026-07-07.
