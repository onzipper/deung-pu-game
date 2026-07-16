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
import { Button } from "@/ui/components";
import {
  selectDebugInfo,
  selectGold,
  selectHelpPanelRequestedAt,
  selectInventory,
  selectLastKillAtMs,
  selectPlayerLevel,
  selectShopList,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { getHelpArticle, searchHelpArticles } from "./help-articles";
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
  const helpPanelRequestedAt = useGameStore(selectHelpPanelRequestedAt);

  const [activeTab, setActiveTab] = useState<HelpTab>("recommend");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [sessionIntent, setSessionIntent] = useState<PlayIntent>(null);
  const [articleSearchQuery, setArticleSearchQuery] = useState("");

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

  // C4 (§5.1): คลิกดึ๋งๆ companion ในโลก → engine stamp helpPanelRequestedAt → เปิด help panel ("ช่วยเหลือ"
  // — ชื่อ panel แยกขาดจากดึ๋งๆ ตาม D-068, ไม่ใช่ "ดึ๋งๆ ช่วยเหลือ" อีกต่อไป). setState/openPanel เกิดใน
  // setTimeout callback (deferred, ไม่ใช่ตรงใน effect body — pattern
  // เดียวกับ DialoguePanel/context-help effect) จึงไม่ผิด react-hooks. ค่าเปลี่ยน = คลิกใหม่ → เปิดอีกครั้ง.
  useEffect(() => {
    if (helpPanelRequestedAt === null) return;
    const timer = setTimeout(() => manager.openPanel(HELP_PANEL_ID), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpPanelRequestedAt]);

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
    <Panel id={HELP_PANEL_ID} title="ช่วยเหลือ" widthPx={400}>
      <div className="dp-text-body-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(TAB_LABELS) as HelpTab[]).map((tab) => (
            <Button key={tab} variant={activeTab === tab ? "primary" : "ghost"} size="sm" onClick={() => setActiveTab(tab)}>
              {TAB_LABELS[tab]}
              {tab === "checklist" && checklistVisible && !checklistDone ? " •" : ""}
            </Button>
          ))}
        </div>

        {activeTab === "recommend" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {INTENT_OPTIONS.map((opt) => (
                <Button
                  key={opt.intent}
                  variant={sessionIntent === opt.intent ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setSessionIntent(sessionIntent === opt.intent ? null : opt.intent)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {shownRecommendations.length === 0 ? (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-3 text-(--dp-sand)">
                ตอนนี้ยังไม่มีอะไรเร่งด่วน ลองสำรวจต่อ หรือเลือกสิ่งที่อยากทำจากด้านบน
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {shownRecommendations.map((rec) => (
                  <li key={rec.id} className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                    <div className="font-semibold text-(--dp-highlight)">{rec.title}</div>
                    <div className="text-(--dp-parchment)">{rec.summary}</div>
                    <div className="dp-text-caption text-(--dp-sand)">เหตุผล: {rec.reason}</div>
                    {rec.estimatedMinutes !== undefined && (
                      <div className="dp-text-caption text-(--dp-sand)">ประมาณ {rec.estimatedMinutes} นาที</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rec.actionType === "open_panel" && rec.actionTarget && (
                        <Button variant="primary" size="sm" onClick={() => manager.openPanel(rec.actionTarget as PanelId)}>
                          ไปเลย
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onDismissOnce(rec)}>
                        ไม่เอาตอนนี้
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDismissForever(rec)}>
                        ไม่ต้องเตือนเรื่องนี้อีก
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "articles" && (
          <div className="flex flex-col gap-2">
            {selectedArticle ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedArticleId(null)}
                  className="dp-focus-ring self-start text-(--dp-sand) hover:text-(--dp-highlight)"
                >
                  ← กลับไปลิสต์
                </button>
                <div className="font-semibold text-(--dp-highlight)">{selectedArticle.title}</div>
                <div className="text-(--dp-parchment)">{selectedArticle.oneLine}</div>
                <ol className="list-inside list-decimal space-y-1 text-(--dp-parchment)">
                  {selectedArticle.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {showMoreDetail && (
                  <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-sand)">
                    {selectedArticle.moreDetail}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {(() => {
                    const action = selectedArticle.action;
                    if (action.type !== "open_panel") return null;
                    return (
                      <Button variant="primary" size="sm" onClick={() => manager.openPanel(action.panelId)}>
                        {action.label}
                      </Button>
                    );
                  })()}
                  <Button variant="ghost" size="sm" onClick={() => setShowMoreDetail((v) => !v)}>
                    {showMoreDetail ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={articleSearchQuery}
                  onChange={(e) => setArticleSearchQuery(e.target.value)}
                  placeholder="ค้นบทความ เช่น เดิน, ตี, เสริมแกร่ง"
                  aria-label="ค้นบทความช่วยเหลือ"
                  className="dp-focus-ring w-full rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment) placeholder:text-(--dp-sand)"
                />
                {(() => {
                  const results = searchHelpArticles(articleSearchQuery);
                  if (results.length === 0) {
                    return (
                      <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-3 text-(--dp-sand)">
                        ไม่พบบทความ
                      </div>
                    );
                  }
                  return (
                    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                      {results.map((article) => (
                        <li key={article.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedArticleId(article.id);
                              setShowMoreDetail(false);
                            }}
                            className="dp-focus-ring w-full rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-left text-(--dp-parchment) transition-colors hover:bg-(--dp-deep-brown)"
                          >
                            {article.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1">
              {TUTORIAL_CHECKLIST_STEPS.map((step) => {
                const done = isChecklistStepDone(checklist, step.id);
                return (
                  <li
                    key={step.id}
                    className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-1.5"
                  >
                    <span className={done ? "text-(--dp-pale-moss) line-through" : "text-(--dp-parchment)"}>
                      {done ? "✓ " : "☐ "}
                      {step.title}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActiveTab("articles");
                          setSelectedArticleId(step.helpArticleId);
                          setShowMoreDetail(false);
                        }}
                      >
                        ดูวิธีทำ
                      </Button>
                      {!step.auto && !done && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            const next = markChecklistStepDoneManually(checklist, step.id);
                            setChecklist(next);
                            checklistStore.save(next);
                          }}
                        >
                          ทำแล้ว
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {checklistDone && (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-leaf) bg-(--dp-deep-ink) px-3 py-2 text-(--dp-pale-moss)">
                ครบทุกข้อแล้ว พร้อมออกไปผจญภัยต่อได้เลย
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="dp-text-label mb-1 text-(--dp-sand)">โหมดช่วยเหลือ</div>
              <div className="flex flex-col gap-1">
                {MODE_OPTIONS.map((opt) => (
                  <label key={opt.mode} className="flex items-center gap-2 text-(--dp-parchment)">
                    <input
                      type="radio"
                      name="guidance-mode"
                      checked={prefs.mode === opt.mode}
                      onChange={() => onSavePrefs({ mode: opt.mode })}
                      className="accent-(--dp-resonance-teal)"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="dp-text-label mb-1 text-(--dp-sand)">ระดับความละเอียดของคำใบ้</div>
              <div className="flex flex-col gap-1">
                {HINT_DETAIL_OPTIONS.map((opt) => (
                  <label key={opt.detail} className="flex items-center gap-2 text-(--dp-parchment)">
                    <input
                      type="radio"
                      name="hint-detail"
                      checked={prefs.hintDetail === opt.detail}
                      onChange={() => onSavePrefs({ hintDetail: opt.detail })}
                      className="accent-(--dp-resonance-teal)"
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
