"use client";

// เนื้อหา panel "สมุดนักผจญภัย" (C3-MVP, spec §2/§8) — 7 แท็บ, multi-tab pattern เดียวกับ HelpPanel.tsx
// (แถวปุ่มแท็บด้านบน แทน sidebar ใน spec §8.1 — Panel.tsx เป็น floating panel กว้าง 360-420px ไม่ใช่
// full-screen dedicated page ตามที่ brief สั่งให้ reuse ตรง ๆ ไม่แตะ Panel.tsx). อ่าน state ผ่าน Zustand
// bridge เท่านั้น (useGameStore, docs/context/ui.md contract).
//
// แท็บ 2 Achievement = ข้อมูลจริงจาก MSG_ACHIEVEMENTS_SNAPSHOT (C2b, game-store.selectAchievementsSnapshot) —
// ยิง sendAchievementsRequest() ผ่าน EngineHandle.net ทุกครั้งที่เปิด panel (refresh ทับของที่ app.ts ยิงไว้
// แล้วตอน self join ทุก map, pattern เดียวกับ storage/shop). แท็บ 1/7 อ่าน snapshot เดียวกัน + store อื่น
// ที่มีอยู่แล้ว (level/exp/gold) ไม่มี network call เพิ่ม. แท็บ 3/4/5/6 = empty-state placeholder เท่านั้น
// (ยังไม่มี data plumbing ฝั่ง server — คนละงานจาก C3-MVP).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { AchievementRow } from "@/shared/net-protocol";
import { Panel, usePanelManager } from "@/ui/panels";
import { Button } from "@/ui/components";
import {
  selectAchievementsSnapshot,
  selectGold,
  selectPlayerExp,
  selectPlayerLevel,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  achievementProgressPercent,
  achievementTierColorClass,
  achievementTierLabel,
  categoryLabel,
  filterAchievementRows,
  groupAchievementRowsByCategory,
  isAchievementMasked,
  JOURNAL_ACHIEVEMENT_FILTER_LABELS,
  JOURNAL_ACHIEVEMENT_FILTER_ORDER,
  JOURNAL_EMPTY_STATE_COPY,
  JOURNAL_PANEL_ID,
  JOURNAL_STAT_ITEMS,
  JOURNAL_TAB_LABELS,
  JOURNAL_TAB_ORDER,
  pickDailyBark,
  resolveJournalStatValue,
  topClaimedAchievements,
  type AchievementFilter,
  type JournalTab,
} from "./journal-view";

export interface JournalPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ StoragePanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

export function JournalPanel({ getHandle }: JournalPanelProps) {
  const manager = usePanelManager();
  const isOpen = manager.isPanelOpen(JOURNAL_PANEL_ID);

  const snapshot = useGameStore(selectAchievementsSnapshot);
  const playerLevel = useGameStore(selectPlayerLevel);
  const playerExp = useGameStore(selectPlayerExp);
  const gold = useGameStore(selectGold);

  const [activeTab, setActiveTab] = useState<JournalTab>("today");
  const [achievementFilter, setAchievementFilter] = useState<AchievementFilter>("all");
  const [sessionStartMs] = useState(() => Date.now());
  const [statsNowMs, setStatsNowMs] = useState<number | null>(null);

  // เปิด panel → ขอ snapshot ใหม่ (deferred setState/network call ใน setTimeout callback, pattern เดียวกับ
  // HelpPanel/StoragePanel — ไม่ผิด react-hooks/set-state-in-effect)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendAchievementsRequest();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // แท็บสถิติเปิด → stamp เวลาให้คำนวณ playtime session (ไม่ใช่ live ticking ต่อวินาที — MVP คำนวณใหม่ทุกครั้ง
  // ที่เปิด/สลับมาแท็บนี้ก็พอ). setState ใน setTimeout callback (deferred) เหมือน effect ก่อนหน้า.
  useEffect(() => {
    if (!isOpen || activeTab !== "stats") return;
    const timer = setTimeout(() => setStatsNowMs(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [isOpen, activeTab]);

  const rows = snapshot ?? [];
  const filteredRows = filterAchievementRows(rows, achievementFilter);
  const groups = groupAchievementRowsByCategory(filteredRows);
  const topToday = topClaimedAchievements(rows, 3);
  const bark = pickDailyBark();
  const playtimeMs = statsNowMs !== null ? statsNowMs - sessionStartMs : null;

  return (
    <Panel id={JOURNAL_PANEL_ID} title="สมุดนักผจญภัย" widthPx={400}>
      <div className="dp-text-body-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {JOURNAL_TAB_ORDER.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab)}
            >
              {JOURNAL_TAB_LABELS[tab]}
            </Button>
          ))}
        </div>

        {activeTab === "today" && (
          <div className="flex flex-col gap-2">
            <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
              {bark}
            </div>
            <div className="dp-text-label text-(--dp-sand)">Achievement ล่าสุด</div>
            {topToday.length === 0 ? (
              <div className="text-(--dp-sand)">ยังไม่มี Achievement ที่ปลดล็อก ลองออกไปผจญภัยดูสิ</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {topToday.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
                  >
                    <span className="text-(--dp-parchment)">{row.nameTh}</span>
                    <span className={achievementTierColorClass(row.tier)}>{achievementTierLabel(row.tier)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "achievement" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {JOURNAL_ACHIEVEMENT_FILTER_ORDER.map((filter) => (
                <Button
                  key={filter}
                  variant={achievementFilter === filter ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setAchievementFilter(filter)}
                >
                  {JOURNAL_ACHIEVEMENT_FILTER_LABELS[filter]}
                </Button>
              ))}
            </div>

            {snapshot === null ? (
              <div className="text-(--dp-sand)">กำลังโหลด…</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-(--dp-sand)">— ไม่มีรายการในตัวกรองนี้ —</div>
            ) : (
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                {groups.map((group) => (
                  <div key={group.category} className="flex flex-col gap-1">
                    <div className="dp-text-label text-(--dp-sand)">{categoryLabel(group.category)}</div>
                    <ul className="flex flex-col gap-1">
                      {group.rows.map((row) => (
                        <AchievementRowCard key={row.id} row={row} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "world" && <JournalPlaceholder text={JOURNAL_EMPTY_STATE_COPY.world} />}
        {activeTab === "monster" && <JournalPlaceholder text={JOURNAL_EMPTY_STATE_COPY.monster} />}
        {activeTab === "people" && <JournalPlaceholder text={JOURNAL_EMPTY_STATE_COPY.people} />}
        {activeTab === "collection" && <JournalPlaceholder text={JOURNAL_EMPTY_STATE_COPY.collection} />}

        {activeTab === "stats" && (
          <div className="flex flex-col gap-2">
            <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
              <div>เลเวล {playerLevel ?? "—"}</div>
              <div className="dp-text-caption text-(--dp-sand)">
                {playerExp ? `EXP ${playerExp.exp}/${playerExp.ceil}` : "EXP —"}
                {gold !== null ? ` · ทอง ${gold}` : ""}
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {JOURNAL_STAT_ITEMS.map((item) => {
                const { value, subtitle } = resolveJournalStatValue(
                  item.id,
                  item.id === "playtime" ? playtimeMs : null,
                );
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-1.5"
                  >
                    <span className="text-(--dp-parchment)">{item.label}</span>
                    <span className="text-right">
                      <div className={value === "—" ? "text-(--dp-sand)" : "text-(--dp-highlight)"}>{value}</div>
                      {subtitle && <div className="dp-text-caption text-(--dp-sand)">{subtitle}</div>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** แถว Achievement เดียว (§8.3 Achievement Card: icon(-)/ชื่อ/tier badge/progress bar/claimed/reward) */
function AchievementRowCard({ row }: { row: AchievementRow }) {
  const masked = isAchievementMasked(row);
  const claimed = row.state === "claimed";
  const percent = achievementProgressPercent(row);
  const reward = row.gold && row.gold > 0 ? `+${row.gold} ทอง` : row.titleId ? "ได้ฉายา" : null;

  return (
    <li className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={claimed ? "text-(--dp-pale-moss)" : "text-(--dp-parchment)"}>
          {row.nameTh}
          {claimed ? " ✓" : ""}
        </span>
        <span className={`dp-text-caption ${achievementTierColorClass(row.tier)}`}>
          {achievementTierLabel(row.tier)}
        </span>
      </div>
      {!masked && (
        <>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-(--dp-radius-sm) bg-(--dp-deep-ink)">
            <div
              className={claimed ? "h-full bg-(--dp-pale-moss)" : "h-full bg-(--dp-resonance-teal)"}
              style={{ width: `${percent}%` }}
            />
          </div>
          {!claimed && (
            <div className="dp-text-caption text-(--dp-sand)">
              {row.currentValue}/{row.target}
            </div>
          )}
        </>
      )}
      {claimed && reward && <div className="dp-text-caption text-(--dp-pale-moss)">{reward}</div>}
    </li>
  );
}

/** empty-state ของแท็บที่ยังไม่มี data plumbing (3/4/5/6) — ไม่มี icon asset จริง (ดู JournalHudButton
 * comment) จึงใช้ glyph ตัวอักษรล้วนแทน ไม่ใช่ emoji (ตาม UI copy invariant — meme อยู่ใน content ไม่ใช่ UI) */
function JournalPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-4 py-8 text-center text-(--dp-sand)">
      <span className="dp-text-title-md text-(--dp-warm-wood)" aria-hidden>
        ···
      </span>
      <span>{text}</span>
    </div>
  );
}
