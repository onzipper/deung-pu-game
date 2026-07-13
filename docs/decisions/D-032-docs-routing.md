# D-032 — Docs routing tier
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Docs routing tier**: งาน docs ประจำรอบ (CODEMAP/pointer/history/current-state sync) ใช้ tier กลางลงมา (docs-curator/tiny-worker) — tier สูง/orchestrator เฉพาะการตีความ decision ลง spec/decision-index (source of truth) · รายละเอียด `docs/agent-rules.md` §7

สถานะ: Locked

เหตุผล: owner ถามเรื่องใช้ Fable ทำ docs ล้วน → เคาะแนวที่ tech เสนอ 2026-07-12
