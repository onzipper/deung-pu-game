"use client";

// เนื้อหา panel guidance "DG lite" (P2-12) — 4 แท็บ: "ทำอะไรต่อดี" (rule engine) / "เล่นระบบนี้ยังไง"
// (help article registry) / checklist เริ่มเกม / ตั้งค่า (guidance preferences). อ่าน state ผ่าน Zustand
// bridge เท่านั้น (useGameStore, docs/context/ui.md contract) — ไม่มี network call เลย (DG §15.2:
// "client-side: local help article rendering... non-authoritative stuck signals" — P2 lite ไม่มี
// companion/server recommendation service).
//
// preferences/runtime/checklist persist ผ่าน localStorage adapter แยกไฟล์ (guidance-preferences.ts /
// guidance-runtime-storage.ts / tutorial-checklist-storage.ts) — โหลดครั้งเดียวตอน mount ด้วย useState lazy
// initializer, เขียนกลับทุกครั้งที่เปลี่ยนค่า.

import { useEffect, useState } from "react";
import { Panel, usePanelManager, type PanelId } from "@/ui/panels";
import {
  selectDebugInfo,
  selectGold,
  selectInventory,
  selectLastKillAtMs,
  selectPlayerLevel,
  selectShopList,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { getHelpArticle, HELP_ARTICLES } from "./help-articles";
import { useHelpFocus } from "./help-focus-context";
import { createGuidancePreferencesStore } from "./guidance-preferences";
import {
  createRuleRuntimeStore,
} from "./guidance-runtime-storage";
import {
  dismissRecommendationOnce,
  dismissRecommendationTagsForever,
  findRuleById,
  getRecommendations,
  recordRecommendationsShown,
  type RuleRuntimeState,
} from "./guidance-rules";
import type { GuidanceMode, HintDetail, PlayIntent, Recommendation } from "./help-types";
import {
  buildRecommendationInput,
  HELP_PANEL_ID,
  type HelpTab,
} from "./help-view";
import { isShopAvailable } from "@/ui/panels/shop/shop-view";
import {
  createChecklistStore,
} from "./tutorial-checklist-storage";
import {
  isChecklistComplete,
  isChecklistStepDone,
  isChecklistVisible,
  markChecklistStepDoneManually,
  TUTORIAL_CHECKLIST_STEPS,
  updateChecklistFromSignals,
  type ChecklistState,
} from "./tutorial-checklist";

const prefsStore = createGuidancePreferencesStore();
const runtimeStore = createRuleRuntimeStore();
const checklistStore = createChecklistStore();

const TAB_LABELS: Record<HelpTab, string> = {
  recommend: "ทำอะไรต่อดี",
  articles: "เล่นระบบนี้ยังไง",
  checklist: "เริ่มต้นเกม",
  settings: "ตั้งค่า",
};

const INTENT_OPTIONS: { intent: PlayIntent; label: string }[] = [
  { intent: "power", label: "อยากเก่งขึ้น" },
  { intent: "economy", label: "อยากหาเงิน" },
  { intent: "explore", label: "อยากสำรวจ" },
];

const MODE_OPTIONS: { mode: GuidanceMode; label: string }[] = [
  { mode: "OFF", label: "ปิด" },
  { mode: "QUIET", label: "เงียบ (ค่าเริ่มต้น)" },
  { mode: "AVAILABLE", label: "พร้อมช่วย" },
  { mode: "ACTIVE", label: "ช่วยบ่อย" },
];

const HINT_DETAIL_OPTIONS: { detail: HintDetail; label: string }[] = [
  { detail: "LIGHT", label: "บอกแนวทางกว้าง ๆ" },
  { detail: "DIRECT", label: "บอกตรง ๆ ชัดเจน" },
];

export function HelpPanel() {
  const manager = usePanelManager();
  const { focusedArticleId } = useHelpFocus();
  const isOpen = manager.isPanelOpen(HELP_PANEL_ID);

  const inventory = useGameStore(selectInventory);
  const gold = useGameStore(selectGold);
  const playerLevel = useGameStore(selectPlayerLevel);
  const lastKillAtMs = useGameStore(selectLastKillAtMs);
  const shopList = useGameStore(selectShopList);
  const debugInfo = useGameStore(selectDebugInfo);

  const [activeTab, setActiveTab] = useState<HelpTab>("recommend");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [sessionIntent, setSessionIntent] = useState<PlayIntent>(null);

  const [prefs, setPrefs] = useState(() => prefsStore.load());
  const [runtime, setRuntime] = useState<RuleRuntimeState>(() => runtimeStore.load());
  const [shownRecommendations, setShownRecommendations] = useState<Recommendation[]>([]);
  const [checklist, setChecklist] = useState<ChecklistState>(() => checklistStore.load());

  // context help (DG §5.4) ตั้ง focusedArticleId ไว้ → สลับไปแท็บบทความ + เลือกบทความนั้นให้ทันที.
  // setState เกิดใน setTimeout callback (deferred, ไม่ใช่ตรงใน effect body — pattern เดียวกับ
  // InventoryPanel.tsx/EnhancementPanel.tsx) จึงไม่ผิด react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!focusedArticleId) return;
    const timer = setTimeout(() => {
      setActiveTab("articles");
      setSelectedArticleId(focusedArticleId);
      setShowMoreDetail(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [focusedArticleId]);

  const mapId = debugInfo?.net.mapId ?? null;
  const shopAvailable = isShopAvailable(shopList);

  // คำนวณ "ทำอะไรต่อดี" ใหม่ทุกครั้งที่เปิดแท็บนี้ (ไม่ใช่ทุก render — กัน recordRecommendationsShown
  // นับซ้ำเกินจริงตอน re-render เฉย ๆ). ตั้งใจไม่ใส่ runtime/inputs ใน deps (อ่านค่า ณ ตอนเปิดแท็บพอ).
  // setState เกิดใน setTimeout callback (deferred) เหมือน effect ก่อนหน้า — ไม่ผิด react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!isOpen || activeTab !== "recommend") return;
    const timer = setTimeout(() => {
      const nowMs = Date.now();
      const input = buildRecommendationInput({
        playerLevel,
        gold,
        inventory,
        mapId,
        shopAvailable,
        sessionIntent,
        nowMs,
      });
      setRuntime((prevRuntime) => {
        const recs = getRecommendations(input, prevRuntime);
        setShownRecommendations(recs);
        const next = recordRecommendationsShown(prevRuntime, recs.map((r) => r.id), nowMs);
        runtimeStore.save(next);
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, sessionIntent]);

  // tutorial checklist — อัปเดตจากสัญญาณสด ๆ ของ HudState (bail out ถ้าไม่มีอะไรเปลี่ยนจริง กัน setState loop).
  // setState เกิดใน setTimeout callback (deferred) เหมือน effect ก่อนหน้า — ไม่ผิด react-hooks/set-state-in-effect.
  const playerTile = debugInfo?.playerTile ?? null;
  const hasKilledMob = lastKillAtMs !== null;
  const equipmentCount = inventory?.equipment.length ?? 0;
  useEffect(() => {
    const timer = setTimeout(() => {
      setChecklist((prev) => {
        const next = updateChecklistFromSignals(prev, { playerTile, hasKilledMob, equipmentCount });
        const changed =
          next.walkDone !== prev.walkDone ||
          next.killDone !== prev.killDone ||
          next.equipDone !== prev.equipDone ||
          next.baselineTile !== prev.baselineTile;
        if (!changed) return prev;
        checklistStore.save(next);
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerTile?.tx, playerTile?.ty, hasKilledMob, equipmentCount]);

  const selectedArticle = selectedArticleId ? getHelpArticle(selectedArticleId) : null;

  const onDismissOnce = (rec: Recommendation): void => {
    const next = dismissRecommendationOnce(runtime, rec.sourceRuleId, Date.now());
    setRuntime(next);
    runtimeStore.save(next);
    setShownRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
  };

  const onDismissForever = (rec: Recommendation): void => {
    const ruleDef = findRuleById(rec.sourceRuleId);
    if (!ruleDef) return;
    const next = dismissRecommendationTagsForever(runtime, ruleDef, Date.now());
    setRuntime(next);
    runtimeStore.save(next);
    setShownRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
  };

  const onSavePrefs = (patch: Partial<typeof prefs>): void => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    prefsStore.save(next);
  };

  const checklistVisible = isChecklistVisible(checklist);
  const checklistDone = isChecklistComplete(checklist);

  return (
    <Panel id={HELP_PANEL_ID} title="ดึ๋งๆ ช่วยเหลือ" widthPx={400}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1 text-xs">
          {(Object.keys(TAB_LABELS) as HelpTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-2 py-1 font-semibold ${
                activeTab === tab
                  ? "bg-amber-700/80 text-black"
                  : "border border-neutral-700 text-neutral-300"
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === "checklist" && checklistVisible && !checklistDone ? " •" : ""}
            </button>
          ))}
        </div>

        {activeTab === "recommend" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 text-xs">
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.intent}
                  type="button"
                  onClick={() => setSessionIntent(sessionIntent === opt.intent ? null : opt.intent)}
                  className={`rounded px-2 py-1 ${
                    sessionIntent === opt.intent
                      ? "bg-amber-700/80 text-black"
                      : "border border-neutral-700 text-neutral-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {shownRecommendations.length === 0 ? (
              <div className="rounded border border-neutral-800 bg-black/30 px-2 py-3 text-xs text-neutral-400">
                ตอนนี้ดึ๋งๆ ยังไม่มีอะไรเร่งด่วน ลองสำรวจต่อ หรือเลือกสิ่งที่อยากทำจากด้านบน
              </div>
            ) : (
              <ul className="space-y-2">
                {shownRecommendations.map((rec) => (
                  <li key={rec.id} className="rounded border border-amber-700/40 bg-black/30 px-2 py-2">
                    <div className="font-semibold text-amber-200">{rec.title}</div>
                    <div className="text-xs text-neutral-300">{rec.summary}</div>
                    <div className="text-xs text-neutral-400">เหตุผล: {rec.reason}</div>
                    {rec.estimatedMinutes !== undefined && (
                      <div className="text-xs text-neutral-500">ประมาณ {rec.estimatedMinutes} นาที</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      {rec.actionType === "open_panel" && rec.actionTarget && (
                        <button
                          type="button"
                          onClick={() => manager.openPanel(rec.actionTarget as PanelId)}
                          className="rounded bg-amber-700/80 px-2 py-1 font-semibold text-black hover:bg-amber-600"
                        >
                          ไปเลย
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDismissOnce(rec)}
                        className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-white/10"
                      >
                        ไม่เอาตอนนี้
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismissForever(rec)}
                        className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-white/10"
                      >
                        ไม่ต้องเตือนเรื่องนี้อีก
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "articles" && (
          <div className="space-y-2">
            {selectedArticle ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedArticleId(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
                >
                  ← กลับไปลิสต์
                </button>
                <div className="font-semibold text-amber-200">{selectedArticle.title}</div>
                <div className="text-xs text-neutral-200">{selectedArticle.oneLine}</div>
                <ol className="list-inside list-decimal space-y-1 text-xs text-neutral-300">
                  {selectedArticle.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {showMoreDetail && (
                  <div className="rounded border border-neutral-800 bg-black/30 px-2 py-2 text-xs text-neutral-400">
                    {selectedArticle.moreDetail}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 text-xs">
                  {(() => {
                    const action = selectedArticle.action;
                    if (action.type !== "open_panel") return null;
                    return (
                      <button
                        type="button"
                        onClick={() => manager.openPanel(action.panelId)}
                        className="rounded bg-amber-700/80 px-2 py-1 font-semibold text-black hover:bg-amber-600"
                      >
                        {action.label}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setShowMoreDetail((v) => !v)}
                    className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-white/10"
                  >
                    {showMoreDetail ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {HELP_ARTICLES.map((article) => (
                  <li key={article.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArticleId(article.id);
                        setShowMoreDetail(false);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1 text-left text-xs hover:bg-neutral-800/60"
                    >
                      {article.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-2">
            <ul className="space-y-1">
              {TUTORIAL_CHECKLIST_STEPS.map((step) => {
                const done = isChecklistStepDone(checklist, step.id);
                return (
                  <li
                    key={step.id}
                    className="flex items-center justify-between gap-2 rounded border border-neutral-800 bg-black/30 px-2 py-1 text-xs"
                  >
                    <span className={done ? "text-emerald-300 line-through" : "text-neutral-200"}>
                      {done ? "✓ " : "☐ "}
                      {step.title}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("articles");
                          setSelectedArticleId(step.helpArticleId);
                          setShowMoreDetail(false);
                        }}
                        className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:bg-white/10"
                      >
                        ดูวิธีทำ
                      </button>
                      {!step.auto && !done && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = markChecklistStepDoneManually(checklist, step.id);
                            setChecklist(next);
                            checklistStore.save(next);
                          }}
                          className="rounded bg-amber-700/80 px-1.5 py-0.5 font-semibold text-black hover:bg-amber-600"
                        >
                          ทำแล้ว
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {checklistDone && (
              <div className="rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-200">
                ครบทุกข้อแล้ว พร้อมออกไปผจญภัยต่อได้เลย
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-300">โหมดช่วยเหลือ</div>
              <div className="flex flex-col gap-1 text-xs">
                {MODE_OPTIONS.map((opt) => (
                  <label key={opt.mode} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="guidance-mode"
                      checked={prefs.mode === opt.mode}
                      onChange={() => onSavePrefs({ mode: opt.mode })}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-300">ระดับความละเอียดของคำใบ้</div>
              <div className="flex flex-col gap-1 text-xs">
                {HINT_DETAIL_OPTIONS.map((opt) => (
                  <label key={opt.detail} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="hint-detail"
                      checked={prefs.hintDetail === opt.detail}
                      onChange={() => onSavePrefs({ hintDetail: opt.detail })}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
