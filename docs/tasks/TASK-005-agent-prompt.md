# TASK-005: Confirm multi-currency / multi-tax-jurisdiction scope for Phase 1

**Depends on:** — (no dependency — can run in parallel with TASK-001 through TASK-004)

## What you're doing and why
This is a **scope decision task, not a coding task.** Do not write any code, schema, or migration.

SRS §1.4 states that an organisation may operate branches across more than one currency or tax
jurisdiction. Whether that needs to be modelled in the Phase 1 schema (TASK-006) or can be safely
deferred is a product decision — not a technical one. Getting this wrong in either direction has
real cost:

- **If deferred when it shouldn't be:** adding `currency_override` / `tax_rate_override` to
  `Branch` after other tables reference it requires a migration, potential data backfill, and
  changes to any already-built financial logic.
- **If built now when it isn't needed:** TASK-006 becomes more complex and Phase 1 scope grows.

Your job is to surface the question clearly, wait for an explicit answer, and record it.
Do not make the decision yourself.

---

## Steps

### 1. Check for an existing answer

Before asking, search the repo for any prior decision:
- `/docs/decisions/` — any file referencing currency, tax, or jurisdiction
- `README.md`, SRS docs, any product brief under `docs/`
- Any schema file (`.prisma`, `.sql`) that already defines `currency_override` or `tax_rate_override`

If a clear, unambiguous answer already exists in any of the above:
- Use it to populate the decision record in step 3.
- Note the source file in the decision record under a `## Source` heading.
- Do not ask the user a question they have already answered.

If no prior answer exists, proceed to step 2.

---

### 2. Stop and ask the user

Do not guess. Do not infer from context. Surface the following question **verbatim** to the user
or PM before doing anything else:

---

> **Scope decision required before TASK-006 (schema design) can begin.**
>
> SRS §1.4 states that an organisation may operate branches in more than one currency or tax
> jurisdiction. Please confirm one of the following for Phase 1:
>
> **A — Include in Phase 1 (required now)**
> The `Branch` table must include `currency_override` and `tax_rate_override` fields in the
> initial schema. Multi-currency and multi-jurisdiction logic is a Phase 1 requirement.
>
> **B — Defer to a later phase**
> The Phase 1 schema will use a single currency and tax rate at the organisation level.
> `Branch`-level overrides will be added in a future migration when needed.
>
> **C — Partial — include fields but leave them nullable with no logic**
> Add `currency_override` and `tax_rate_override` as nullable columns now so the schema
> is forward-compatible, but implement no validation or business logic around them in Phase 1.
>
> Please reply with A, B, or C and a brief rationale. TASK-006 is blocked until this is answered.

---

Do not proceed to step 3 until you have received an explicit A, B, or C response.

---

### 3. Create the decision record

Once you have a confirmed answer, create the following file:

**Path:** `/docs/decisions/0002-multi-currency-scope.md`

**Template:**
```markdown
# 0002 — Multi-Currency / Multi-Tax-Jurisdiction Scope (Phase 1)

**Status:** Accepted
**Date:** YYYY-MM-DD
**Decided by:** [name or role of person who answered, e.g. "Product Owner"]

## Decision
[A | B | C] — [one-sentence restatement of the chosen option]

## Rationale
[The rationale provided by the user. Transcribe it accurately — do not paraphrase.]

## Impact on TASK-006
[Fill in exactly one of the following based on the answer:]

### If A:
- `Branch` table must include `currency_override VARCHAR(3)` (ISO 4217 currency code, NOT NULL)
  and `tax_rate_override NUMERIC(5,4)` (NOT NULL) in the Phase 1 migration.
- These fields are required — the schema is invalid without them.

### If B:
- `Branch` table does NOT include currency or tax override fields in Phase 1.
- A `TODO` comment must be added to the Branch model noting these fields are deferred.
- Currency and tax rate are defined at the `Organisation` level only for now.

### If C:
- `Branch` table includes `currency_override VARCHAR(3)` and `tax_rate_override NUMERIC(5,4)`,
  both NULLABLE.
- No validation, no business logic, no application-layer handling in Phase 1.
- A `TODO` comment must mark them as unimplemented.

## Alternatives considered
- **A:** [one line on why it was or wasn't chosen]
- **B:** [one line on why it was or wasn't chosen]
- **C:** [one line on why it was or wasn't chosen]

## Source
[If the answer came from an existing document, name it here. Otherwise: "Direct confirmation from [name/role] on YYYY-MM-DD."]
```

---

## Acceptance criteria (all must be true before marking done)

- [ ] `/docs/decisions/0002-multi-currency-scope.md` exists.
- [ ] The document contains an explicit answer — A, B, or C. A "TBD", "maybe", or blank answer is not acceptable.
- [ ] The "Impact on TASK-006" section is filled in for the chosen option, not all three.
- [ ] The document names who provided the answer and when.
- [ ] TASK-006 is **not** started until this file exists and is complete.

---

## What not to do

- Do not choose A, B, or C yourself — this decision belongs to the product owner or user.
- Do not start TASK-006 schema design while waiting for an answer, even speculatively.
- Do not create a placeholder or "TBD" decision file — the file must not exist until there is a real answer to put in it.
- Do not infer the answer from the SRS alone — §1.4 raises the requirement but does not resolve the phasing question.
- Do not ask any other question alongside this one — one decision at a time.
