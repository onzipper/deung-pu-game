# docs/decisions/ — decision rationale (Thai, verbatim)

This directory holds one file per locked decision from `docs/decision-index.md`. The index table
is navigation only (thin, English) — **these files are the authority for rationale**. When the
two disagree, this directory wins.

## Rules

- **1 decision = 1 file**: `D-NNN-<slug>.md`, `NNN` zero-padded 3 digits.
- **IDs are permanent** — never renumber, never reuse a retired ID.
- **New decisions append the next `D-NNN`** (highest existing + 1) at the bottom of the index
  table, in the order the owner ratifies them.
- Rationale text stays **Thai and verbatim** — copied exactly from the source row (decision cell +
  status + reason), no paraphrasing, no translation, no typo fixes. Thai game terms stay exactly
  as written.
- This directory is additive-only history: a decision that gets superseded still keeps its file
  (status becomes `Superseded → D-0XX` in the index); its file is never deleted or rewritten to
  erase what was actually decided.

## Template

```md
# D-NNN — <short EN title>
- Date: <date from row> · Status: <Locked / Open / Superseded per row>
- Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: <verbatim decision cell>

สถานะ: <verbatim status>

เหตุผล: <verbatim reason cell>
```
