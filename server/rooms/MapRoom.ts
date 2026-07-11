// MapRoom (P0-07, channel P0-08, server-authoritative movement P1-02) — Colyseus Room = map+channel
// instance (tech §6). Local dev เท่านั้นใน P0/P1 world-sync branch.
//
// ทำ: join → spawn PlayerState ที่ตำแหน่ง client ส่งมา · MSG_MOVE → **validate แล้วค่อย apply** · leave → ลบ.
// state ถูก broadcast ให้ทุก client อัตโนมัติผ่าน schema patch (delta binary) ของ Colyseus.
//
// P1-02 server-authoritative movement (TA §6/§7/§16.3):
//   onCreate โหลด map config (loader เดิม, pure) → รู้ collision/bounds เอง.
//   ทุก MSG_MOVE → validateMove(prev, next, elapsed, ...) — speed cap / walkable / teleport.
//   ผิด → **ไม่ apply** + ส่ง MSG_POSITION_CORRECTION กลับ client นั้น (snap กลับ valid ล่าสุด, ไม่แบน).
//   **Single source of truth**: reuse engine pure fn (loadMapConfig/snapToTile/isWalkableTile) +
//   อ่าน knob เดียวกับ client จาก DEFAULT_ENGINE_CONFIG (compile ร่วม — ไม่ copy สูตร/ค่า).
//
// channelId (P0-08): มาจาก client joinOptions ตรง ๆ (default = DEFAULT_CHANNEL_ID). server.define ผูก
// `.filterBy(['mapId','channelId'])` (server/index.ts) แยก room instance ตาม (mapId, channelId).
//
// P1-03 server-side mob simulation (TA §18 + §6 monster sync + §11 LOD):
//   onCreate สร้าง MobSimulation (pure, src/game/mob/simulation.ts — spawn/respawn/AI/LOD) แล้ว
//   ขับด้วย setSimulationInterval ที่ ai.tickHz (10Hz) → เขียนผล mob เข้า schema (state.mobs MapSchema).
//   **Single source of truth**: reuse pure spawn/wander/ai เดิม (ไม่ copy) + knob จาก DEFAULT_ENGINE_CONFIG.
//   **AOI filter (§18.2) ยังไม่บังคับ** ที่ 30 CCU/map เล็ก — จุด filter = syncMobsToState() (ดู TODO ในนั้น).
//
// P1-05 server combat authority (TA §15/§16.2/§16.3): MSG_CAST_SKILL intent → handleCast():
//   validate (skillId รู้จัก / cooldown per-player per-skill / range) → คำนวณ AoE hit (pure findHits +
//   maxTargets cap §18.4) → damage formula server §15.2 (formula.ts, ค่า k/stat จาก combatBalance knob) →
//   apply กับ mob hp (sim.damageMob) → death: despawn+respawn → broadcast MSG_SKILL_RESULT. ปฏิเสธ → เงียบ
//   (MSG_CAST_REJECTED). **สูตร damage = server-only** (formula.ts ไม่หลุด client bundle). ลบ MSG_DEBUG_KILL_MOB แล้ว.
//
// P1-07 reconnect 30s grace (GS §59.1 · TA §6): onLeave แยก consented (ออกเอง → ลบทันที) ออกจาก
//   unexpected disconnect (ws หลุด → allowReconnection hold state 30 วิ). reconnect ทันใน grace = กลับ
//   sessionId เดิม → PlayerState/MoveTracker/cooldown ที่ไม่เคยลบ = ตำแหน่ง/channel/cooldown เดิม restore
//   อัตโนมัติ (ไม่ผ่าน onJoin). grace หมด → ลบจริง; client รอบถัดไป = fresh join → safe camp (onJoin resolve).
//   onJoin ใช้ resolveSpawnPosition (§59.1 "ตำแหน่ง invalid → safe camp") snap พิกัดที่ client ส่งไป safe
//   camp ถ้าเดินไม่ได้. grace = knob (DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds; env override dev/test).
//
// P1 **ยังไม่ทำ** (จด TODO ชี้ spec):
//   - persistence ตอน leave (player position → MySQL, TA §6 checkpoint)
//   - server-side full simulation ของ player position ทุก tick (ยัง client-drive + validate, TA §6)
//   - AOI filter บังคับ (P1+/map ใหญ่, §18.2) · resource/mana pool (proposal §5 [8] PENDING OWNER)
//   - progression/EXP/loot (P2) — P1 ผู้เล่นทุกคน lv1 นักดาบ (stat จาก combatBalance)

import { Room, type Client } from "colyseus";
import { MapRoomState, MobState, PlayerState } from "../schema/MapRoomState";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  MSG_CAST_SKILL,
  MSG_CAST_REJECTED,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
  MSG_SKILL_RESULT,
  type CastRejectedMessage,
  type CastSkillMessage,
  type JoinOptions,
  type MoveMessage,
  type PositionCorrectionMessage,
  type SkillHit,
  type SkillResultMessage,
} from "../../src/shared/net-protocol";
import {
  validateMove,
  type MoveValidationParams,
  type WalkableAtFn,
} from "../../src/shared/movement-validation";
import { loadMapConfig } from "../../src/engine/map/loader";
import { P0_TEST_FIELD } from "../../src/engine/map/p0-test-field";
import { isWalkableTile, safeCampOf, type MapConfig } from "../../src/engine/map/types";
import { resolveSpawnPosition, type ReconnectVec2 } from "../../src/shared/reconnect";
import { snapToTile } from "../../src/engine/iso/coords";
import { DEFAULT_ENGINE_CONFIG, type CombatBalanceConfig } from "../../src/engine/config";
import {
  createMobSimulation,
  type MobSimulation,
} from "../../src/game/mob/simulation";
import type { AiPlayerRef } from "../../src/game/mob/ai";
import type { SkillDefinition } from "../../src/game/skill/types";
import { loadSkillDefinitions } from "../../src/game/skill/loader";
import { WARRIOR_SKILLS_SERVER } from "../../src/game/skill/data/warrior-skills-server";
import {
  resolveSkillHits,
  skillReadyAt,
  validateCast,
} from "../../src/game/combat/cast-validation";
import { computeSkillDamage } from "../../src/game/combat/formula";
import type { HitTestTarget } from "../../src/game/combat/hit-test";
import { coerceDirection } from "../../src/engine/net/sync";
import { defaultRng } from "../../src/game/mob/rng";

/** onCreate options = merge ของ options ที่ define() ตั้ง (ว่างใน P0) + clientOptions ของคนแรกที่ join. */
interface MapRoomCreateOptions {
  mapId?: string;
  channelId?: string;
}

/**
 * P1-07: grace window (วินาที) ที่ server hold state หลัง disconnect ไม่ตั้งใจ (§59.1 = 30).
 * ค่าหลัก = knob (DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds); env `RECONNECT_GRACE_SECONDS`
 * override ได้ **เฉพาะ dev/test** (proof ตั้ง 2 วิ พิสูจน์ grace expiry). > 0 เท่านั้น ไม่งั้นใช้ค่า knob.
 */
function resolveGraceSeconds(): number {
  const env = Number(process.env.RECONNECT_GRACE_SECONDS);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds;
}

/**
 * per-player movement tracker (server-authoritative, P1-02) — ไม่อยู่ใน schema (ไม่ broadcast).
 * เก็บ "ตำแหน่ง valid ล่าสุด" + เวลา เพื่อคำนวณ elapsed/allowance และเป็นจุด snap กลับตอน correct.
 */
interface MoveTracker {
  /** ตำแหน่ง valid ล่าสุด (tile coord) = จุด snap กลับเมื่อ move ถูกปฏิเสธ */
  tx: number;
  ty: number;
  /** เวลา (ms, Date.now) ที่ประมวลผล MSG_MOVE ครั้งล่าสุด — ใช้คิด elapsed ครั้งถัดไป */
  lastMoveTime: number;
  /** เวลา (ms) ที่ส่ง correction ครั้งล่าสุด — บังคับ correctionCooldownMs กัน flood */
  lastCorrectionTime: number;
}

export class MapRoom extends Room<MapRoomState> {
  /** map config ที่ validate แล้ว (server รู้ collision/bounds เอง) — set ตอน onCreate */
  private map!: MapConfig;
  /** walkable check ที่ reuse engine pure fn (snapToTile + isWalkableTile) — ไม่ copy สูตร */
  private isWalkableAt!: WalkableAtFn;
  /** knob เดียวกับ client (speed + validation) — single source of truth (DEFAULT_ENGINE_CONFIG) */
  private moveParams!: MoveValidationParams;
  private readonly trackers = new Map<string, MoveTracker>();
  /** mob simulation ฝั่ง server (P1-03) — authoritative spawn/respawn/AI/LOD (pure core) */
  private sim!: MobSimulation;
  /** skill definitions (P1-05) — full server view (37 field §50.1); key = skillId. โหลดใน onCreate. */
  private skills!: Map<string, SkillDefinition>;
  /** combat balance knob (P1-05) — k/player/mob stat (single source of truth, DEFAULT_ENGINE_CONFIG) */
  private balance!: CombatBalanceConfig;
  /** cooldown state ต่อ (sessionId → skillId → readyAtMs) — server clock authority (§16.3). ไม่ broadcast. */
  private readonly cooldowns = new Map<string, Map<string, number>>();
  /** P1-07: grace window (วินาที) สำหรับ allowReconnection (§59.1) — set ตอน onCreate */
  private graceSeconds = 30;
  /** P1-07: safe camp ของ map (§59.1 reconnect fallback) = map.safeCamp ?? spawnPoint (tile coord) */
  private safeCamp: ReconnectVec2 = { tx: 0, ty: 0 };

  onCreate(options: MapRoomCreateOptions = {}): void {
    const state = new MapRoomState();
    state.mapId = options.mapId ?? DEFAULT_MAP_ID;
    state.channelId = options.channelId ?? DEFAULT_CHANNEL_ID;
    state.roomId = this.roomId;
    this.setState(state);

    // P1-02: server โหลด map เอง (loader pure เดิม) → รู้ collision/bounds. reuse engine collision:
    // snapToTile ตำแหน่งต่อเนื่อง → integer tile → isWalkableTile (bounds + block). ไม่ copy สูตร.
    this.map = loadMapConfig(P0_TEST_FIELD);
    this.isWalkableAt = (tx: number, ty: number): boolean => {
      const cell = snapToTile({ tx, ty });
      return isWalkableTile(this.map, cell.tx, cell.ty);
    };
    this.moveParams = {
      speed: DEFAULT_ENGINE_CONFIG.player.speed,
      validation: DEFAULT_ENGINE_CONFIG.movementValidation,
    };

    // P1-07 (§59.1): grace window + safe camp (reconnect fallback). safeCamp = map.safeCamp ?? spawnPoint.
    this.graceSeconds = resolveGraceSeconds();
    const sc = safeCampOf(this.map);
    this.safeCamp = { tx: sc.x, ty: sc.y };

    // P1-05: combat balance + skill definitions (single source of truth = DEFAULT_ENGINE_CONFIG + proposal).
    // loadSkillDefinitions validate 37 field §50.1 (fail-loud ตอน boot ถ้า config เพี้ยน) → full server view.
    this.balance = DEFAULT_ENGINE_CONFIG.combatBalance;
    this.skills = loadSkillDefinitions(WARRIOR_SKILLS_SERVER as unknown[]);

    // P1-03/P1-05: สร้าง mob simulation (spawn ชุดแรกทันที) + ขับด้วย fixed tick ที่ ai.tickHz (TA §11 10Hz).
    // hp ต่อ mobType อ่านจาก combatBalance (single source of truth เดียวกับ damage formula).
    this.sim = createMobSimulation({
      map: this.map,
      config: DEFAULT_ENGINE_CONFIG.mob,
      hpFor: (mobType) => (this.balance.mobs[mobType] ?? this.balance.defaultMob).hp,
    });
    this.syncMobsToState();
    this.setSimulationInterval(
      (deltaMs) => this.stepMobSim(deltaMs),
      1000 / DEFAULT_ENGINE_CONFIG.mob.ai.tickHz,
    );

    // P1-05: server combat authority (TA §15/§16.2) — client ส่ง cast intent → validate → damage → broadcast.
    this.onMessage(MSG_CAST_SKILL, (client: Client, message: CastSkillMessage) => {
      this.handleCast(client, message);
    });

    this.onMessage(MSG_MOVE, (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      const tracker = this.trackers.get(client.sessionId);
      if (!player || !tracker) return;

      const now = Date.now();
      const elapsedMs = now - tracker.lastMoveTime;
      // reference เวลา = ตอนนี้เสมอ (ทั้ง accept/reject) → allowance รอบถัดไปคิดจากตำแหน่ง valid ปัจจุบัน
      tracker.lastMoveTime = now;

      const result = validateMove(
        { tx: tracker.tx, ty: tracker.ty },
        { tx: message.tx, ty: message.ty },
        elapsedMs,
        this.moveParams,
        this.isWalkableAt,
      );

      if (result.ok) {
        // valid → apply เข้า schema (broadcast) + เลื่อน valid position
        player.tx = message.tx;
        player.ty = message.ty;
        player.direction = message.direction;
        player.anim = message.anim;
        tracker.tx = message.tx;
        tracker.ty = message.ty;
        return;
      }

      // invalid → ไม่ apply. ส่ง authoritative pos กลับ client นี้ (respect cooldown กัน flood).
      if (now - tracker.lastCorrectionTime >= this.moveParams.validation.correctionCooldownMs) {
        tracker.lastCorrectionTime = now;
        const correction: PositionCorrectionMessage = {
          tx: player.tx,
          ty: player.ty,
          direction: player.direction as PositionCorrectionMessage["direction"],
          anim: player.anim as PositionCorrectionMessage["anim"],
          reason: result.reason,
        };
        client.send(MSG_POSITION_CORRECTION, correction);
        console.log(
          `[MapRoom ${this.roomId}] correct ${client.sessionId} (${result.reason}) → ` +
            `snap (${player.tx.toFixed(2)},${player.ty.toFixed(2)})`,
        );
      }
    });
  }

  /**
   * 1 base cycle ของ mob AI (setSimulationInterval @ ai.tickHz). ป้อนตำแหน่งผู้เล่นทุกคน (จาก schema)
   * ให้ sim → เขียนผลกลับ schema. dt จริงจาก Colyseus (deltaMs) → รองรับ drift.
   */
  private stepMobSim(deltaMs: number): void {
    const players: AiPlayerRef[] = [];
    this.state.players.forEach((p, sessionId) => {
      players.push({ id: sessionId, tx: p.tx, ty: p.ty });
    });
    this.sim.tick(deltaMs / 1000, players, Date.now());
    this.syncMobsToState();
  }

  /**
   * เขียน mob จาก simulation → schema (state.mobs). upsert ตัวที่มี + ลบตัวที่หายไป (ตาย/ยังไม่ respawn).
   *
   * **AOI filter point (§18.2 — ยังไม่บังคับ P1):** ตอนนี้เขียน mob **ทุกตัว** ลง shared state → ทุก client
   * เห็นหมด (พอที่ 30 CCU/map เล็ก, density §11 target). เมื่อ scale (map ใหญ่/หลาย pocket active,
   * entity 150–200) ต้อง filter ต่อ client ที่นี่: ใช้ Colyseus StateView/@filter + spatial hash (§11)
   * ส่งเฉพาะ mob ในรัศมี AOI ของแต่ละ player. TODO(§18.2/P1+): เพิ่ม per-client view ที่จุดนี้.
   */
  private syncMobsToState(): void {
    const seen = new Set<string>();
    this.sim.forEach((m) => {
      seen.add(m.id);
      let ms = this.state.mobs.get(m.id);
      if (!ms) {
        ms = new MobState();
        ms.mobId = m.id;
        ms.mobType = m.mobType;
        this.state.mobs.set(m.id, ms);
      }
      ms.tx = m.pos.tx;
      ms.ty = m.pos.ty;
      ms.state = m.moved ? "walk" : "idle";
      ms.hp = m.hp;
    });
    // ลบ mob ที่ไม่อยู่ใน sim แล้ว (ตายรอ respawn) → client เห็น despawn.
    // เก็บ key ก่อนค่อยลบ (เลี่ยง mutate ระหว่าง iterate MapSchema).
    const stale: string[] = [];
    this.state.mobs.forEach((_ms, id) => {
      if (!seen.has(id)) stale.push(id);
    });
    for (const id of stale) this.state.mobs.delete(id);
  }

  /**
   * P1-05 server combat authority (TA §15/§16.2/§16.3). client ส่ง intent → server ตัดสินทั้งหมด:
   *   1. validate (รู้จัก skillId / cooldown per-player per-skill / range) — ผิด → MSG_CAST_REJECTED (เงียบ)
   *   2. set cooldown (server clock)
   *   3. resolve hit จาก sim (pure findHits + maxTargets cap §18.4) — targets = มอนมีชีวิตในห้อง
   *   4. คำนวณ damage ต่อ target (สูตร server §15.2, formula.ts) เคารพ hitCount → apply กับ mob hp
   *   5. mob ตาย → despawn + respawn (sim.damageMob) · sync state ทันที → broadcast MSG_SKILL_RESULT
   * ไม่ throw/crash room ไม่ว่า payload อะไร (best-effort validate).
   */
  private handleCast(client: Client, message: CastSkillMessage): void {
    const sessionId = client.sessionId;
    const player = this.state.players.get(sessionId);
    if (!player || !message) return;

    const skillId = typeof message.skillId === "string" ? message.skillId : "";
    const skill = this.skills.get(skillId);
    const cds = this.cooldowns.get(sessionId);
    const now = Date.now();
    const casterPos = { tx: player.tx, ty: player.ty };
    const aimPos = {
      tx: Number.isFinite(message.aimTx) ? message.aimTx : player.tx,
      ty: Number.isFinite(message.aimTy) ? message.aimTy : player.ty,
    };

    // TODO(P2): validate skill ownership/class/unlockLevel เมื่อมี progression (ตอนนี้ทุกคน lv1 นักดาบ
    //   → ยังไม่เป็นบั๊ก; ทุกคนใช้ WARRIOR_SKILLS ได้หมด). เพิ่มเช็ค player.class === skill.class +
    //   player.level ≥ skill.unlockLevel + สกิลอยู่ใน loadout ที่ผู้เล่นปลด (§8 branch).
    const verdict = validateCast({
      skill,
      readyAtMs: cds?.get(skillId),
      nowMs: now,
      casterPos,
      aimPos,
      rangeToleranceFactor: this.balance.rangeToleranceFactor,
    });
    if (!verdict.ok) {
      const rejected: CastRejectedMessage = { skillId, reason: verdict.reason };
      client.send(MSG_CAST_REJECTED, rejected);
      return;
    }
    // verdict.ok = true → skill มีจริง (validateCast การันตี)
    const def = skill as SkillDefinition;

    // set cooldown (server clock) ก่อนคำนวณ hit — กัน race cast รัวในเฟรมเดียว
    cds?.set(skillId, skillReadyAt(now, def.cooldown));

    // targets = มอนมีชีวิตทั้งหมดในห้อง (pos ปัจจุบันจาก sim) + lookup mobType เพื่อ resolve stat
    const targets: HitTestTarget[] = [];
    const mobTypeById = new Map<string, string>();
    this.sim.forEach((m) => {
      targets.push({ id: m.id, pos: { tx: m.pos.tx, ty: m.pos.ty } });
      mobTypeById.set(m.id, m.mobType);
    });

    // TODO(ground-target skills): geometry ปัจจุบัน anchor ที่ caster+facing (arc/cone/line/self-circle
    //   ของนักดาบ P1). ถ้ามี skill ground-target (AoE ตกที่จุดเล็ง เช่น mage_crystal_storm) ต้องใช้
    //   aimPos เป็นศูนย์กลาง AoE (ไม่ใช่ caster) + validate range ของ aimPos จาก server position — ปรับ
    //   resolveSkillHits ให้รับ origin แยกจาก caster ตาม targetShape.
    const facing = coerceDirection(message.direction);
    const hitIds = resolveSkillHits(def, casterPos, facing, targets, DEFAULT_ENGINE_CONFIG.tileSize);

    // สกิลที่ทำ damage: targetType enemy + baseMultiplier>0 + hitCount>0 (utility เช่น taunt = valid cast แต่ไม่ damage)
    const dealsDamage = def.targetType === "enemy" && def.baseMultiplier > 0 && def.hitCount > 0;
    const hits: SkillHit[] = [];
    if (dealsDamage) {
      for (const mobId of hitIds) {
        const mobType = mobTypeById.get(mobId);
        if (mobType === undefined) continue;
        const ms = this.balance.mobs[mobType] ?? this.balance.defaultMob;
        const dmg = computeSkillDamage(
          {
            atk: this.balance.player.atk,
            baseMultiplier: def.baseMultiplier,
            targetDef: ms.def,
            penetration: this.balance.player.penetration,
            k: this.balance.k,
            critRate: this.balance.player.critRate,
            critDmg: this.balance.player.critDmg,
            // bossModifier ใช้เฉพาะเมื่อ target เป็น boss — P1 มีแต่ normal mob → 1.0 (proposal §1)
            bossModifier: 1.0,
            pvpModifier: this.balance.pvpModifier,
            tierReduction: ms.tierReduction,
          },
          def.hitCount,
          defaultRng,
        );
        const applied = this.sim.damageMob(mobId, dmg.damage);
        if (!applied) continue;
        hits.push({ mobId, dmg: dmg.damage, crit: dmg.crit, killed: applied.killed });
      }
      // sync ทันที → hp ที่ลด + มอนที่ตาย (despawn) สะท้อนใน state broadcast รอบนี้ (ไม่รอ sim tick ถัดไป)
      this.syncMobsToState();
    }

    const result: SkillResultMessage = { casterId: sessionId, skillId, hits };
    this.broadcast(MSG_SKILL_RESULT, result);
  }

  onJoin(client: Client, options: JoinOptions): void {
    // P1-07 (§59.1): server = source of truth ว่า spawn ลงได้จริง. พิกัดที่ client ส่ง (fresh join /
    // reconnect เกิน grace) ถ้าเดินไม่ได้/ไม่ finite → snap ไป safe camp. (within-grace reconnect ไม่ผ่าน
    // onJoin เลย → ตำแหน่งเดิมคงอยู่ ไม่ถูก resolve ซ้ำ.)
    const requested: ReconnectVec2 = {
      tx: options?.tx ?? this.safeCamp.tx,
      ty: options?.ty ?? this.safeCamp.ty,
    };
    const spawn = resolveSpawnPosition(requested, this.safeCamp, this.isWalkableAt);

    const player = new PlayerState();
    player.tx = spawn.pos.tx;
    player.ty = spawn.pos.ty;
    player.direction = options?.direction ?? "S";
    player.anim = options?.anim ?? "idle";
    this.state.players.set(client.sessionId, player);
    // valid position เริ่มต้น = จุด spawn (หลัง resolve safe camp); เวลาเริ่ม = now
    this.trackers.set(client.sessionId, {
      tx: player.tx,
      ty: player.ty,
      lastMoveTime: Date.now(),
      lastCorrectionTime: 0,
    });
    if (spawn.usedSafeCamp) {
      console.log(
        `[MapRoom ${this.roomId}] ${client.sessionId} spawn ที่ safe camp ` +
          `(${this.safeCamp.tx},${this.safeCamp.ty}) — พิกัดที่ขอ (${requested.tx},${requested.ty}) invalid (§59.1)`,
      );
    }
    // P1-05: cooldown state ต่อ player (ว่างตอน join → ทุกสกิลพร้อมใช้)
    this.cooldowns.set(client.sessionId, new Map());
    console.log(
      `[MapRoom ${this.roomId}] join ${client.sessionId} @(${player.tx.toFixed(1)},${player.ty.toFixed(1)}) — ${this.clients.length} online`,
    );
  }

  /**
   * P1-07: ลบ player ออกจาก state + tracker + cooldown จริง (หลัง consented leave หรือ grace หมด).
   * client อื่นเห็น entity หายผ่าน schema removal.
   */
  private removePlayer(sessionId: string, reason: string): void {
    this.state.players.delete(sessionId);
    this.trackers.delete(sessionId);
    this.cooldowns.delete(sessionId);
    console.log(`[MapRoom ${this.roomId}] remove ${sessionId} (${reason})`);
  }

  /**
   * P1-07 reconnect 30s grace (GS §59.1 · TA §6). แยก 2 เส้นทาง:
   *   consented (client เรียก room.leave() ตั้งใจออก) → ลบทันที (ไม่ต้อง grace).
   *   unexpected disconnect (ws หลุด, consented=false) → allowReconnection hold state `graceSeconds` วิ:
   *     - reconnect ทันใน grace → Deferred resolve → **ไม่ลบอะไร** → PlayerState/MoveTracker/cooldown
   *       ที่ผูกกับ sessionId เดิมยังอยู่ครบ = ตำแหน่ง/channel/cooldown เดิม restore อัตโนมัติ (ไม่ผ่าน onJoin).
   *     - grace หมด / reject → Deferred throw → removePlayer จริง; client รอบถัดไป = fresh join → safe camp.
   * ระหว่าง grace: client อื่นยังเห็น player นี้ค้างใน state (Colyseus hold state จน expire — documented).
   */
  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const sessionId = client.sessionId;

    if (consented) {
      this.removePlayer(sessionId, "consented");
      return;
    }

    // TODO(anti-exploit §59.1): P1 ยังไม่มี player death/PvP → disconnect ไม่ได้ใช้หนีตาย จึงยังไม่ต้อง
    //   บังคับ safe camp ตอนหลุด. เมื่อมี combat death / PvP / boss critical state (P2) ต้องเช็คตรงนี้:
    //   ถ้า player อยู่ critical state → **ไม่ hold ตำแหน่งเดิม** / บังคับ safe camp ตอนกลับ
    //   (reconnect/channel switch ห้ามใช้เป็น exploit หนีตาย, §59.1 guardrail).
    console.log(
      `[MapRoom ${this.roomId}] ${sessionId} หลุด — เริ่ม grace ${this.graceSeconds}s (§59.1)`,
    );
    try {
      await this.allowReconnection(client, this.graceSeconds);
      console.log(
        `[MapRoom ${this.roomId}] ${sessionId} reconnect สำเร็จใน grace — resume ตำแหน่ง/channel เดิม`,
      );
    } catch {
      this.removePlayer(sessionId, "grace_expired");
    }
  }
}
