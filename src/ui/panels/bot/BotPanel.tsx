"use client";

// Bot Hub panel (7b-UI, deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md) — multi-tab pattern เดียวกับ
// JournalPanel.tsx (แถวปุ่มแท็บด้านบนแทน sidebar). 4 แท็บ (MVP scope ตาม orchestrator brief):
//   สถานะ (Hub §2 + Live Status §7) · โปรไฟล์ (Setup §3 + Rule Builder v1 §4 อย่างง่าย) · รายงาน (§8) ·
//   แพ็กเกจ (Tier Comparison + MOCK purchase §11, D-061/D-063).
// Schedule (§6) + Analytics ขั้นสูง (§8.2) = locked placeholder "เร็วๆ นี้" (deferred, ไม่ใช่ MVP scope) —
// แสดงใน tier table เป็นตัวเลข/เครื่องหมายเฉย ๆ ไม่มี UI แยกให้กด. notification prefs = defer เช่นกัน.
//
// อ่าน state ผ่าน Zustand bridge เท่านั้น (useGameStore, docs/context/ui.md contract) — ส่ง intent
// (create/update/delete/start/stop/mockPurchase/reportList/reportFetch) ผ่าน EngineHandle.net ตรง ๆ
// (imperative, เหมือน InventoryPanel/ShopPanel/StoragePanel). ทุก op (ยกเว้น reportFetch/reportList ที่เป็น
// read) ผ่าน BotOpPhase เดียว (bot-view.ts, pattern เดียวกับ ShopTxPhase — ทำได้ทีละ action, ปุ่ม disable
// ระหว่าง processing กันชนกัน).
//
// map/pocket dropdown: mirror ของ server/config/bot.ts botAllowedPockets (ui ห้าม import server/**) — ดู
// comment ที่ bot-view.ts BOT_ALLOWED_POCKETS. server เป็น authority จริง (validate ซ้ำทุก create/update/start).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { BotProfileWire, BotRulesWire, BotTierWire } from "@/shared/net-protocol";
import { Panel, usePanelManager } from "@/ui/panels";
import { Button, ConfirmDialog, TextInput } from "@/ui/components";
import {
  selectBotLastStopped,
  selectBotOpResult,
  selectBotProfiles,
  selectBotReportDetail,
  selectBotReports,
  selectBotStatus,
  selectBotTierState,
  selectBotCheckpoint,
  selectBotAuthorityActive,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  BOT_PANEL_ID,
  BOT_RULE_SKILL_SLOTS,
  BOT_TAB_LABELS,
  BOT_TAB_ORDER,
  BOT_TIER_PLANS,
  botActionLabel,
  botMapLabel,
  botMapOptions,
  botOpMessage,
  botPocketLabel,
  botPocketOptions,
  botStopReasonLabel,
  botTierComparisonRows,
  botTierLabel,
  canConfirmBotOp,
  canCreateMoreProfiles,
  countBotRules,
  defaultBotRules,
  formatDurationShort,
  formatEpochMs,
  formatHpPercent,
  formatPassExpiry,
  hasAtLeastOneSkillSlot,
  isValidBotProfileName,
  profileCountLabel,
  reportStopReasonLabel,
  resolveBotOpState,
  resolveBotPurchaseConfirmation,
  ruleCountLabel,
  setBotLootAll,
  toggleBotSkillSlot,
  type BotOpPhase,
  type BotTab,
} from "./bot-view";

export interface BotPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** ไม่ได้รับ bot:opResult ภายในนี้หลังกด → UNKNOWN_RECONCILING (pattern เดียวกับ ShopPanel) */
const RESULT_TIMEOUT_MS = 8000;

type Net = NonNullable<EngineHandle["net"]>;

interface ProfileFormState {
  mode: "create" | "edit";
  id?: string;
  name: string;
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
}

function blankForm(): ProfileFormState {
  const mapId = botMapOptions()[0] ?? "map1";
  const pocketId = botPocketOptions(mapId)[0] ?? "";
  return { mode: "create", name: "", mapId, pocketId, rules: defaultBotRules() };
}

function editForm(profile: BotProfileWire): ProfileFormState {
  return { mode: "edit", id: profile.id, name: profile.name, mapId: profile.mapId, pocketId: profile.pocketId, rules: profile.rules };
}

const SELECT_CLASS =
  "h-10 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-3 " +
  "text-(--dp-highlight) dp-focus-ring";

export function BotPanel({ getHandle }: BotPanelProps) {
  const manager = usePanelManager();
  const isOpen = manager.isPanelOpen(BOT_PANEL_ID);

  const tierState = useGameStore(selectBotTierState);
  const profiles = useGameStore(selectBotProfiles);
  const status = useGameStore(selectBotStatus);
  const lastStopped = useGameStore(selectBotLastStopped);
  const reports = useGameStore(selectBotReports);
  const reportDetail = useGameStore(selectBotReportDetail);
  const opResult = useGameStore(selectBotOpResult);
  const checkpoint = useGameStore(selectBotCheckpoint);
  const authorityActive = useGameStore(selectBotAuthorityActive);

  const [tab, setTab] = useState<BotTab>("status");
  const [phase, setPhase] = useState<BotOpPhase>({ kind: "idle" });
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotProfileWire | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [purchaseConfirm, setPurchaseConfirm] = useState<
    { tier: BotTierWire; days: number; lostDays: number } | null
  >(null);
  // "now" สำหรับ formatPassExpiry/countdown — Date.now() ห้ามเรียกตรงใน render body (react-hooks/purity)
  // จึง lazy-init ครั้งแรกผ่าน useState initializer (เหมือน JournalPanel sessionStartMs) แล้ว refresh ตอนเปิด panel.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // เปิด panel → ขอ tier state + profiles ใหม่ (reply เดียวจาก bot:profileList มาทั้งคู่ — pattern เดียวกับ
  // JournalPanel sendAchievementsRequest, deferred setState/network call ใน setTimeout callback) + refresh nowMs
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendBotProfileList();
      setNowMs(Date.now());
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // เปิด panel ที่แท็บรายงาน (หรือสลับมาแท็บนี้) → ขอ report list ใหม่เสมอ (สดตาม retention ของ tier)
  useEffect(() => {
    if (!isOpen || tab !== "reports") return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendBotReportList();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  // ผล bot:opResult มาถึง → settle เฉพาะตอนกำลังรอ op เดียวกัน (กันผลลัพธ์เก่ามาทับ)
  useEffect(() => {
    if (!opResult) return;
    if (phase.kind !== "processing" && phase.kind !== "timed_out") return;
    if (opResult.op !== phase.op) return;
    const timer = setTimeout(() => setPhase({ kind: "settled", result: opResult }), 0);
    return () => clearTimeout(timer);
  }, [opResult, phase]);

  // timeout ระหว่าง processing
  useEffect(() => {
    if (phase.kind !== "processing") return;
    const { op } = phase;
    const timer = setTimeout(() => setPhase({ kind: "timed_out", op }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // settled สำเร็จ → ปิดฟอร์ม/เคลียร์ delete target (bot:profiles ใหม่มาเองจาก server อยู่แล้ว) — deferred
  // setState ใน setTimeout callback (pattern เดียวกับ effect อื่นในไฟล์นี้ — ไม่ผิด react-hooks/set-state-in-effect)
  useEffect(() => {
    if (phase.kind !== "settled" || !phase.result.ok) return;
    const op = phase.result.op;
    const timer = setTimeout(() => {
      if (op === "profileCreate" || op === "profileUpdate") setForm(null);
      if (op === "profileDelete") setDeleteTarget(null);
      if (op === "mockPurchase") setPurchaseConfirm(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [phase]);

  const opState = resolveBotOpState(phase);
  const busy = !canConfirmBotOp(opState);
  const opMessage = botOpMessage(opState, phase.kind === "settled" ? phase.result : opResult);
  const caps = tierState?.caps ?? null;

  const send = (op: string, fn: (net: Net) => void): void => {
    const net = getHandle()?.net;
    if (!net) return;
    fn(net);
    setPhase({ kind: "processing", op });
  };

  const onSubmitForm = (): void => {
    if (!form || busy) return;
    if (form.mode === "create") {
      send("profileCreate", (net) =>
        net.sendBotProfileCreate({ name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }),
      );
    } else if (form.id) {
      send("profileUpdate", (net) =>
        net.sendBotProfileUpdate({ id: form.id!, name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }),
      );
    }
  };

  const onBuyPass = (tier: BotTierWire, days: number): void => {
    const confirm = resolveBotPurchaseConfirmation(tierState, tier, nowMs);
    if (confirm.needsConfirm) {
      setPurchaseConfirm({ tier, days, lostDays: confirm.lostDays ?? 0 });
      return;
    }
    send("mockPurchase", (net) => net.sendBotMockPurchase({ tier, days }));
  };

  const formInvalid =
    !form ||
    !isValidBotProfileName(form.name) ||
    !hasAtLeastOneSkillSlot(form.rules) ||
    (caps !== null && countBotRules(form.rules) > caps.rules);

  return (
    <Panel id={BOT_PANEL_ID} title="ผู้ช่วยนักล่า" widthPx={420}>
      <div className="dp-text-body-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {BOT_TAB_ORDER.map((t) => (
            <Button key={t} variant={tab === t ? "primary" : "ghost"} size="sm" onClick={() => setTab(t)}>
              {BOT_TAB_LABELS[t]}
            </Button>
          ))}
        </div>

        {opMessage && (
          <div
            className={[
              "flex items-center justify-between gap-2 rounded-(--dp-radius-sm) px-3 py-2",
              opState === "REJECTED"
                ? "border border-(--dp-danger-red) bg-(--dp-deep-ink) text-(--dp-highlight)"
                : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
            ].join(" ")}
          >
            <span>{opMessage}</span>
            {opState !== "PROCESSING" && (
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setPhase({ kind: "idle" })}
                className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-highlight)"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {tab === "status" && (
          <div className="flex flex-col gap-2">
            {tierState && (
              <div className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="text-(--dp-highlight)">{botTierLabel(tierState.tier)}</span>
                <span className="dp-text-caption text-(--dp-sand)">{formatPassExpiry(tierState.passExpiresAt, nowMs)}</span>
              </div>
            )}

            {authorityActive && !status && (
              <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="text-(--dp-resonance-light)">ตัวละครกำลังทำตามแผน — กำลังเชื่อมสถานะล่าสุด</span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      send("takeover", (net) =>
                        net.sendBotTakeover({ requestId: `takeover:cta:${Date.now()}`, source: "cta" }),
                      )
                    }
                  >
                    รับช่วงต่อ
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => send("stop", (net) => net.sendBotStop({}))}
                  >
                    หยุดแผน
                  </Button>
                </div>
              </div>
            )}

            {!profiles || profiles.length === 0 ? (
              <div className="text-(--dp-sand)">ยังไม่มีโปรไฟล์ — ไปที่แท็บ “โปรไฟล์” เพื่อสร้างงานแรก</div>
            ) : (
              <div className="flex flex-col gap-2">
                {profiles.map((p) => {
                  const running = authorityActive && status?.profileId === p.id;
                  const interrupted = checkpoint?.profileId === p.id ? checkpoint : null;
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-(--dp-parchment)">
                          {p.name}
                          {p.readOnly && <span className="ml-1 dp-text-caption text-(--dp-fire-light)">(ถูกพัก)</span>}
                        </span>
                        <span className="dp-text-caption shrink-0 text-(--dp-sand)">
                          {botMapLabel(p.mapId)} · {botPocketLabel(p.pocketId)}
                        </span>
                      </div>
                      {running && status ? (
                        <>
                          <div className="text-(--dp-resonance-light)">{botActionLabel(status.action)}</div>
                          <div className="dp-text-caption text-(--dp-sand)">
                            ฆ่า {status.killCount} · gold {status.goldEarned} · exp {status.expEarned} · HP{" "}
                            {formatHpPercent(status.hpFraction)} · เวลา {formatDurationShort(status.uptimeMs)}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                send("takeover", (net) =>
                                  net.sendBotTakeover({ requestId: `takeover:cta:${Date.now()}`, source: "cta" }),
                                )
                              }
                            >
                              รับช่วงต่อ
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={() => send("stop", (net) => net.sendBotStop({ profileId: p.id }))}
                            >
                              หยุดแผน
                            </Button>
                          </div>
                        </>
                      ) : interrupted ? (
                        <>
                          <div className="text-(--dp-resonance-light)">
                            {interrupted.state === "saving"
                              ? "กำลังบันทึกจุดทำงาน…"
                              : interrupted.state === "ready"
                                ? "บันทึกจุดทำงานแล้ว — พร้อมทำต่อ"
                                : "บันทึกจุดทำงานไม่สำเร็จ"}
                          </div>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || interrupted.state === "saving" || p.readOnly}
                            onClick={() => {
                              if (interrupted.state === "ready") {
                                send("resume", (net) => net.sendBotResume({ checkpointId: interrupted.id }));
                              } else if (interrupted.state === "failed") {
                                send("start", (net) => net.sendBotStart({ profileId: p.id }));
                              }
                            }}
                          >
                            {interrupted.state === "failed" ? "เริ่มแผนใหม่" : "ทำต่อ"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy || p.readOnly || authorityActive || status !== null || checkpoint?.state === "saving"}
                          onClick={() => send("start", (net) => net.sendBotStart({ profileId: p.id }))}
                        >
                          เริ่ม
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {lastStopped && (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
                หยุดล่าสุด: {botStopReasonLabel(lastStopped.reason)}
                <div className="dp-text-caption text-(--dp-sand)">
                  ฆ่า {lastStopped.killCount} · gold {lastStopped.goldEarned} · exp {lastStopped.expEarned}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "profiles" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-(--dp-sand)">{caps ? profileCountLabel(profiles?.length ?? 0, caps.profiles) : "—"}</span>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || form !== null || (caps !== null && !canCreateMoreProfiles(profiles?.length ?? 0, caps.profiles))}
                onClick={() => setForm(blankForm())}
              >
                + สร้างโปรไฟล์ใหม่
              </Button>
            </div>

            {(!profiles || profiles.length === 0) && !form && (
              <div className="text-(--dp-sand)">— ยังไม่มีโปรไฟล์ —</div>
            )}

            {!form &&
              profiles?.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-(--dp-parchment)">
                      {p.name}
                      {p.readOnly && <span className="ml-1 dp-text-caption text-(--dp-fire-light)">(ถูกพัก, อ่านอย่างเดียว)</span>}
                    </span>
                    <span className="dp-text-caption text-(--dp-sand)">
                      {caps ? ruleCountLabel(countBotRules(p.rules), caps.rules) : ""}
                    </span>
                  </div>
                  <div className="dp-text-caption text-(--dp-sand)">
                    {botMapLabel(p.mapId)} · {botPocketLabel(p.pocketId)}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={busy || p.readOnly} onClick={() => setForm(editForm(p))}>
                      แก้ไข
                    </Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={() => setDeleteTarget(p)}>
                      ลบ
                    </Button>
                  </div>
                </div>
              ))}

            {form && (
              <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <TextInput
                  placeholder="ชื่อโปรไฟล์"
                  value={form.name}
                  maxLength={40}
                  showCounter
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div className="flex gap-2">
                  <select
                    value={form.mapId}
                    onChange={(e) => {
                      const mapId = e.target.value;
                      setForm({ ...form, mapId, pocketId: botPocketOptions(mapId)[0] ?? "" });
                    }}
                    className={SELECT_CLASS}
                  >
                    {botMapOptions().map((mapId) => (
                      <option key={mapId} value={mapId}>
                        {botMapLabel(mapId)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.pocketId}
                    onChange={(e) => setForm({ ...form, pocketId: e.target.value })}
                    className={SELECT_CLASS}
                  >
                    {botPocketOptions(form.mapId).map((pocketId) => (
                      <option key={pocketId} value={pocketId}>
                        {botPocketLabel(pocketId)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dp-text-label text-(--dp-sand)">ใช้สกิลช่อง</div>
                <div className="flex flex-wrap gap-3">
                  {BOT_RULE_SKILL_SLOTS.map((slot) => (
                    <label key={slot} className="flex items-center gap-1.5 text-(--dp-parchment)">
                      <input
                        type="checkbox"
                        checked={form.rules.skillSlots.includes(slot)}
                        onChange={() => setForm({ ...form, rules: toggleBotSkillSlot(form.rules, slot) })}
                        className="h-4 w-4 accent-(--dp-resonance-teal)"
                      />
                      S{slot + 1}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-(--dp-parchment)">
                  <input
                    type="checkbox"
                    checked={form.rules.lootAll}
                    onChange={(e) => setForm({ ...form, rules: setBotLootAll(form.rules, e.target.checked) })}
                    className="h-4 w-4 accent-(--dp-resonance-teal)"
                  />
                  เก็บของทุกอย่างที่บอทฟาร์มได้
                </label>
                <label className="flex items-center gap-1.5 text-(--dp-sand) opacity-60">
                  <input type="checkbox" disabled className="h-4 w-4" />
                  HP potion threshold — รอระบบโพชั่น
                </label>

                <div className="dp-text-caption text-(--dp-sand)">
                  {caps ? ruleCountLabel(countBotRules(form.rules), caps.rules) : ""}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setForm(null)}>
                    ยกเลิก
                  </Button>
                  <Button variant="primary" size="sm" disabled={busy || formInvalid} onClick={onSubmitForm}>
                    {form.mode === "create" ? "สร้างโปรไฟล์" : "บันทึก"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="flex flex-col gap-2">
            {caps && <div className="dp-text-caption text-(--dp-sand)">เก็บย้อนหลัง {caps.reportRetentionDays} วัน</div>}

            {!reports ? (
              <div className="text-(--dp-sand)">กำลังโหลด…</div>
            ) : reports.length === 0 ? (
              <div className="text-(--dp-sand)">— ยังไม่มีรายงาน —</div>
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedReportId(r.id);
                      getHandle()?.net?.sendBotReportFetch({ id: r.id });
                    }}
                    className={[
                      "dp-focus-ring flex w-full flex-col gap-0.5 rounded-(--dp-radius-sm) border px-3 py-2 text-left transition-colors",
                      selectedReportId === r.id
                        ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash)"
                        : "border-(--dp-soil-brown) bg-(--dp-warm-ink) hover:bg-(--dp-deep-brown)",
                    ].join(" ")}
                  >
                    <span className="text-(--dp-parchment)">
                      {formatEpochMs(r.startedAt)} · ฆ่า {r.killCount} · gold {r.goldEarned} ({r.goldPerHour}/ชม.)
                    </span>
                    <span className="dp-text-caption text-(--dp-sand)">{reportStopReasonLabel(r.stopReason)}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedReportId && reportDetail && reportDetail.id === selectedReportId && (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <div className="dp-text-label text-(--dp-sand)">ของที่ได้</div>
                {Object.keys(reportDetail.drops).length === 0 ? (
                  <div className="text-(--dp-sand)">— ไม่มี —</div>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {Object.entries(reportDetail.drops).map(([itemId, qty]) => (
                      <li key={itemId} className="flex justify-between text-(--dp-parchment)">
                        <span className="truncate">{itemId}</span>
                        <span className="shrink-0 tabular-nums">x{qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {selectedReportId && reportDetail === null && (
              <div className="text-(--dp-sand)">รายงานนี้เก่ากว่าที่แพ็กเกจปัจจุบันเก็บไว้ — อัปเกรดเพื่อดูย้อนหลังได้ไกลขึ้น</div>
            )}
          </div>
        )}

        {tab === "packages" && (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left">
                <thead>
                  <tr className="text-(--dp-sand)">
                    <th className="py-1 pr-2 font-normal">ความสามารถ</th>
                    {BOT_TIER_PLANS.map((p) => (
                      <th key={p.tier} className="px-2 py-1 text-center font-semibold text-(--dp-highlight)">
                        {botTierLabel(p.tier)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {botTierComparisonRows().map((row) => (
                    <tr key={row.label} className="border-t border-(--dp-soil-brown)">
                      <td className="py-1 pr-2 text-(--dp-parchment)">{row.label}</td>
                      {BOT_TIER_PLANS.map((p) => (
                        <td key={p.tier} className="px-2 py-1 text-center tabular-nums text-(--dp-parchment)">
                          {row.values[p.tier]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {BOT_TIER_PLANS.filter((p) => p.passes.length > 0).map((plan) => (
              <div
                key={plan.tier}
                className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-(--dp-highlight)">{botTierLabel(plan.tier)}</span>
                  {tierState?.tier === plan.tier && (
                    <span className="dp-text-caption text-(--dp-pale-moss)">
                      tier ปัจจุบัน · {formatPassExpiry(tierState.passExpiresAt, nowMs)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.passes.map((pass) => (
                    <Button
                      key={pass.days}
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onBuyPass(plan.tier, pass.days)}
                    >
                      [MOCK] ซื้อ {pass.days} วัน ({pass.priceThb}฿)
                    </Button>
                  ))}
                </div>
              </div>
            ))}

            <div className="dp-text-caption text-(--dp-fire-light)">ทดสอบ — ยังไม่ตัดเงินจริง (D-061)</div>
            <div className="dp-text-caption text-(--dp-sand)">
              Free ใช้ได้ตลอดไป 24/7 — จ่ายเพื่อความสะดวก (หลาย profile, กฎเยอะ, ตั้งเวลา, รายงานยาว)
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบโปรไฟล์"
        description={deleteTarget ? `ลบโปรไฟล์ "${deleteTarget.name}" ถาวร — ต้องสร้างใหม่ถ้าต้องการใช้อีก` : undefined}
        variant="high-risk"
        requireCheckbox
        checkboxLabel="เข้าใจแล้วว่าโปรไฟล์นี้จะถูกลบถาวร"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        committing={busy}
        onConfirm={() => {
          if (!deleteTarget) return;
          send("profileDelete", (net) => net.sendBotProfileDelete({ id: deleteTarget.id }));
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={purchaseConfirm !== null}
        title="ยืนยันเปลี่ยนแพ็กเกจ"
        description={
          purchaseConfirm
            ? `แพ็กเกจปัจจุบันยังเหลือประมาณ ${purchaseConfirm.lostDays} วัน — ซื้อแพ็กเกจ ${botTierLabel(purchaseConfirm.tier)} จะทับทันที และวันที่เหลือของแพ็กเกจเดิมจะหายไป (ไม่คืนวัน/เงิน)`
            : undefined
        }
        confirmLabel="ยืนยันซื้อ"
        cancelLabel="ยกเลิก"
        committing={busy}
        onConfirm={() => {
          if (!purchaseConfirm) return;
          send("mockPurchase", (net) => net.sendBotMockPurchase({ tier: purchaseConfirm.tier, days: purchaseConfirm.days }));
        }}
        onCancel={() => setPurchaseConfirm(null)}
      />
    </Panel>
  );
}
