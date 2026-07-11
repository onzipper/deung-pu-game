# CODEMAP — file → responsibility

> structural เท่านั้น (path + หน้าที่ 1 บรรทัด) · test-enforced: path ที่อ้างต้องมีจริง (`npm test`)
> แก้/ย้าย/ลบ/เพิ่มไฟล์ ⇒ อัปเดตบรรทัดของมันใน commit เดียวกัน

## Next.js shell

- `src/app/layout.tsx` — root layout (font + globals)
- `src/app/page.tsx` — landing page (ยัง default create-next-app)
- `src/app/game/page.tsx` — route /game: server shell → render GameCanvas เต็มจอ
- `src/app/globals.css` — Tailwind v4 entry + theme vars
- `src/app/favicon.ico` — favicon

## Shared (client ↔ server)

- `src/shared/net-protocol.ts` — realtime wire contract (P0-07, channelId first-class P0-08, ไม่มี runtime dep): MAP_ROOM_NAME/DEFAULT_MAP_ID/DEFAULT_CHANNEL_ID/MSG_MOVE + MoveMessage/JoinOptions(mapId+**channelId**)/PlayerSnapshot/WirePlayerDirection/Anim — import ได้ทั้งฝั่ง client (alias @/shared) และ server (relative path); **P1-02**: MSG_POSITION_CORRECTION + PositionCorrectionMessage{tx,ty,direction,anim,reason}; **P1-03**: MobSnapshot{mobId,mobType,tx,ty,state,hp}/WireMobState; **P1-05**: MSG_CAST_SKILL(+CastSkillMessage{skillId,aimTx,aimTy,direction}) · MSG_SKILL_RESULT(+SkillResultMessage{casterId,skillId,hits:SkillHit[]}) · MSG_CAST_REJECTED(+CastRejectedMessage) — MSG_DEBUG_KILL_MOB ลบแล้ว
- `src/shared/reconnect.ts` — **pure** reconnect logic (P1-07, GS §59.1 · TA §6, ไม่มี runtime dep): `decideReconnect({withinGrace,roomOpen,positionValid})→"resume"|"safe_camp"` (§59.1 decision table) · `resolveSpawnPosition(requested,safeCamp,isWalkable)→{pos,usedSafeCamp}` (invalid/non-finite → safe camp) · `reconnectBackoffMs(attempt,cfg)` exponential+cap · `shouldRetryReconnect(attempt,cfg)`; import type ReconnectClientRetryConfig จาก @/engine/config
- `src/shared/movement-validation.ts` — **pure** validateMove(prev,next,elapsedMs,params,isWalkableAt) (P1-02, TA §6/§16.3): server-authoritative move check → {ok} | {ok:false,reason,correctTo=prev}; ลำดับ non_finite→teleport(absolute cap)→speed(clamp elapsed min/max กัน clock skew, ไม่ divide)→blocked; walkable ผ่าน callback (caller ประกอบ engine snapToTile+isWalkableTile — ไม่ copy สูตร); knob จาก @/engine/config (type-only)

## Game engine (P0)

- `src/engine/config.ts` — shared config/types (EngineConfig, DEFAULT_ENGINE_CONFIG, tileSize 64×32, SceneTheme/CameraConfig/PropStyle/PlayerConfig/PlayerAnimationConfig+PlayerSpriteStyle, **MobConfig** P0-09 (spawn/wander/animation/styles) + **P1-03** MobAiConfig (tickHz/chaseSpeed/aggroRadius per type/leash/deaggro/pullCap)+MobLodConfig (aoiRadius/idleTickHz)+respawnDelayMs, **NetConfig** P0-07 รวม channelId P0-08, **P1-07 ReconnectConfig** (graceSeconds §59.1 + clientRetry backoff — mirror client/server), **CombatStubConfig** P0-10 (attack/dummyDamage offline/hitboxDebug/deathFeedback — damageNumber ย้ายไป combatFeel), **P1-05** **CombatBalanceConfig** (k/player stat/mob stat per type — server, PENDING OWNER) + MobConfig.**hpBar** (client visual), **P1-06** **CombatFeelConfig** (DamageNumberPoolConfig pool/normal/crit/aggregate style + aggregateWindowMs · HitStopConfig durationMsByLevel/timeScale · ScreenShakeConfig levelsByLevel/enabled/alwaysTriggerAtLevel · EffectQualityConfig current+tiers Low/Med/High/Cinematic) + **StressHarnessConfig** (F4 toggleKeyCode/syntheticMobCount/damageNumberRatePerSec/maxSpawnPerTick, dev-only), **DebugOverlayConfig** P0-11) — ทุกค่าปรับได้อยู่ที่นี่ (mob HP = combatBalance เป็น single source of truth)
- `src/engine/runtime/app.ts` — createEngine(): ครอบ pixi Application (async init) + mount P0 Test Field scene + local player + **mob view manager (P1-03, `src/game/mob/manager.ts`)** + **mob source controller** (server-driven online / offline local sim fallback สลับตาม net status) + **combat coordinator (P0-10→P1-05→P1-06: clientView skill แรกนักดาบ + castSkill/isOnline wiring, onSkillResult→combat, hit-stop/shake จัดการในตัว combat-stub เอง)** + **stress harness (P1-06 §5, dev-only)**: F4 keydown toggle (knob: stressHarness.toggleKeyCode) → `stressHarness.update()` ใน ticker + cleanup ตอน destroy + **net layer (P0-07, offline-safe; joinOptions mapId+channelId P0-08)** + **pointer tile tracking (P0-11)** + ticker + fps ui + destroy(); **P0-11**: `getDebugInfo()` + `setDepthDebug()` passthrough → scene
- `src/engine/runtime/resize.ts` — attachResize(): ResizeObserver บน container → renderer.resize; clampSize (pure)
- `src/engine/runtime/assets.ts` — asset loader stub (wrapper รอบ pixi Assets, manifest ว่าง)
- `src/engine/runtime/debug-info.ts` — **pure** (P0-11): EngineDebugInfo shape + `buildDebugInfo()`/`roundTile()` (ปัด playerTile 2 ตำแหน่ง) + `IDLE_NET_DEBUG_INFO` (net.enabled=false fallback) — ไม่แตะ pixi/colyseus, testable ตรง ๆ
- `src/engine/input/keyboard.ts` — keyboard intent tracker: MOVE_KEYS (WASD+arrows) + intentFromKeys (screen basis → tile-space, pure) + attachKeyboard (listeners + detach) + **ATTACK_KEY (Space) edge-triggered consumeAttackPressed() P0-10**
- `src/engine/movement/mover.ts` — stepMovement (pure): เดินต่อเนื่อง float tile + normalize diagonal + axis-separated collision slide + clamp dt
- `src/engine/movement/direction.ts` — resolveDirection (pure): tile vector → 8-dir logical (คิดจากมุมบนจอ) + directionToScreenUnit — เตรียม P0-06 sprite 5-dir+mirror
- `src/engine/player/local-player.ts` — createLocalPlayer(): pixi glue เชื่อม keyboard→mover→direction→animator→scene entity + camera follow; walk/idle + 5-dir+mirror animated sprite (แทน body+nose); expose position/facing/**animation** ให้ net sync; **P0-10**: triggerAttack()/isAttacking (ล็อก animation="attack" จนจบคลิป) + consumeAttackPressed() ส่งต่อจาก keyboard; **P1-02**: applyCorrection(tx,ty) snap ตำแหน่ง+กล้องจาก server (reconcile)
- `src/engine/net/sync.ts` — net sync **pure** helpers (P0-07, computePlayerCount P0-08): coerceDirection/coerceAnim + snapshotChanged (กัน spam) + advanceSendTimer (throttle) + toMoveMessage + computePlayerCount (debug overlay) + ConnectionState type (**P1-07**: เพิ่ม "reconnecting")
- `src/engine/net/net-client.ts` — createNetClient(): colyseus.js glue — connect/joinOrCreate MapRoom (joinOptions รวม channelId, P0-08) + wire schema callbacks → onPlayerAdd/Change/Remove + sendMove; **graceful offline** (connect ล้ม = solo); NetStatus + **getNetDebugInfo()** (P0-08); **P1-02**: onMessage(MSG_POSITION_CORRECTION) → correctionCount + onPositionCorrection (reconcile); **P1-03**: wire state.mobs onAdd/Change/Remove → onMobAdd/Change/Remove(MobSnapshot); **P1-05**: sendCast(CastSkillMessage) + onMessage(MSG_SKILL_RESULT→onSkillResult, MSG_CAST_REJECTED→onCastRejected); **P1-07 reconnect** (§59.1): เก็บ reconnectionToken → onLeave code≠4000 (หลุดไม่ตั้งใจ) = beginReconnect (backoff retry เข้า seat เดิม → re-wire เงียบ ๆ, resetTrackedEntities กัน remote/mob ซ้ำ) · หมดสิทธิ์ = freshJoin (safe camp) · status "reconnecting" · config.retry knob — sendDebugKillMob ลบแล้ว
- `src/engine/net/interpolation.ts` — createInterpolationBuffer(): **pure** snapshot ring buffer ต่อ entity (P1-01, TA §6) — push(t,tx,ty,dir,anim) + sampleAt(renderTime) lerp ตำแหน่งจาก 2 snapshot คร่อม; edge: ว่าง→null, เกิดใหม่→clamp, starved→extrapolate สั้น+clamp; out-of-order→drop; slot/result preallocate (ไม่ new ใน hot loop)
- `src/engine/net/remote-player-manager.ts` — createRemotePlayerManager(): pixi glue สร้าง/ขยับ/ลบ remote player entity (animator สีต่าง) จาก net event; **P1-01**: push snapshot เข้า interpolation buffer (stamp clock ที่ inject ได้) → ticker sampleAt(now−bufferMs) → render ย้อนหลัง smooth (แทน lerp ง่าย P0-07)
- `src/engine/animation/manifest.ts` — animation manifest (data-driven) + resolveClip (pure): logical dir → sprite source+mirror flag (5-dir+mirror, 8-dir override L15) + advancePlayhead (pure frame timing/loop) + createPlayerAnimationManifest
- `src/engine/animation/player-placeholder.ts` — generatePlayerTextures(): วาด placeholder sprite ด้วยโค้ด (Graphics→RenderTexture) — 5 ทิศ, walk/idle/attack, asymmetric ให้เห็น mirror; foot anchor คงที่
- `src/engine/animation/animator.ts` — createSpriteAnimator(): pixi glue เล่นเฟรมบน Sprite (setState/update) + mirror ด้วย scale.x=−1 รอบ anchor เท้า
- `src/engine/iso/coords.ts` — iso projection converters: TilePoint/ScreenPoint types + tileToScreen/screenToTile/snapToTile (pure math)
- `src/engine/iso/depth.ts` — iso depth sort key: depthKey(tile, zLayer) + band constants (pure math)
- `src/engine/map/types.ts` — MapConfig schema (spec P0 §4.3) + CollisionLayer/PropSpawn/MobPocket (+**P1-03** optional respawnDelayMs override) + packTile/isBlockedTile/isWithinBounds/isWalkableTile helpers; **P1-07**: optional `safeCamp` (§59.1 reconnect fallback) + `safeCampOf(map)` (= safeCamp ?? spawnPoint)
- `src/engine/map/loader.ts` — loadMapConfig(raw): validate + build blockedSet (MapConfigError, no zod); **P1-07**: validate optional safeCamp เหมือน spawnPoint (ในขอบ + เดินได้)
- `src/engine/map/p0-test-field.ts` — P0 Test Field config data (24×24, spawn/collision/props/3 pockets)
- `src/engine/render/depth-registry.ts` — DepthRegistry<D> (pure): entity registry + compareDepth comparator + dirty-tracked sorted() — source of truth ของลำดับ depth
- `src/engine/render/camera.ts` — camera math (pure): computeMapScreenBounds / clampCameraScreen / lerpTile (fixed iso, no rotation/zoom) + **P1-06**: `applyShakeOffset(point, offset)` (บวก screen shake offset เข้ากล้อง หลัง clamp เสมอ)
- `src/engine/render/placement.ts` — entityFootToScreen (pure): lock convention "tile ที่ส่งเข้า API = foot ต่อเนื่อง → tileToScreen (ไม่ +0.5)"
- `src/engine/render/object-pool.ts` — createObjectPool<T>() (**pure**, P1-06, TA §11): generic object pool — acquire()/release()/activeCount/capacity/createdCount; factory เรียกเฉพาะจนถึง capacity แล้วหมุนเวียนของเดิม (zero-alloc steady state), เต็ม → acquire() คืน undefined, release ของแปลกปลอม/ซ้ำ = no-op ปลอดภัย — แยกจาก pixi glue (game/combat/damage-number.ts ใช้ pool นี้กับ BitmapText) เพื่อเทสต์ได้ไม่ต้องมี WebGL
- `src/engine/render/screen-shake.ts` — screen shake state/decay (**pure**, P1-06, GS §17.5): createShakeState/triggerShake (level→amplitude×scale/duration, ใหม่แรงกว่าแทนที่ อ่อนกว่าไม่กลบ)/advanceShake (real-time decay)/computeShakeOffset (decay เชิงเส้น + ทิศสุ่มจาก RandomFn inject ได้) — engine layer เอง ไม่ import src/game/**
- `src/engine/render/scene.ts` — createMapScene(): pixi glue — ground layer (grid/checker/blocked, วาดครั้งเดียว) + entity layer (depth-sorted via zIndex rank) + fixed camera follow + entity API (addEntity/moveEntity/removeEntity) + `entityCount` getter + **P0-11**: `setDepthDebug()` — depth-rank text layer (sibling ของ entityLayer, sync ตอน syncDepth ถ้าเปิด, ลบหมดตอนปิด/destroy) + **P1-06**: `setCameraShakeOffset(offset)` — เก็บ offset ล่าสุด, applyCamera() บวกเข้ากล้อง **หลัง** clamp เสมอ (camera.ts applyShakeOffset)

## Game logic (P0-09, บน engine — src/game/**)

- `src/game/mob/rng.ts` — RngFn type + defaultRng (Math.random) + createLcgRng (seeded deterministic, ใช้ในเทสต์) — inject ได้ทุกจุดที่สุ่ม
- `src/game/mob/spawn.ts` — spawnPocketMobs/spawnAllPockets (pure, TA §18.1 fixed pocket + random point inside): จำนวน = random(packSize)clamp activeCap, จุดเกิด = findWalkableSpawnPoint (retry ตาม MobSpawnConfig.maxPlacementAttempts, best-effort ข้ามถ้าหาไม่เจอ)
- `src/game/mob/wander.ts` — createWanderState/stepWander (pure): สลับ idle/walk สุ่มช่วงเวลาจาก MobWanderConfig, เดินด้วย stepMovement เดิม + leash แบบง่าย (ผูก pocket.area เป็นเงื่อนไข block เพิ่ม) + walkableFromMap helper
- `src/game/mob/manifest.ts` — createMobAnimationManifest(): reuse AnimationManifest/resolveClip ของ engine — 2 ทิศวาดจริง (S,N) + mirror 6 ทิศ (mob symmetric, ดูเหตุผลในไฟล์)
- `src/game/mob/placeholder.ts` — generateMobTextures(): placeholder ด้วยโค้ด (Graphics→RenderTexture) ต่อ mobType (slime ก้อนเขียวเด้ง / mushroom หมวกแดง), generate ครั้งเดียวต่อ mobType (แชร์ข้าม instance)
- `src/game/mob/ai.ts` — **pure** mob AI decision (P1-03, TA §18.3/§6/§11): selectAggroTarget (nearest ในรัศมี + เคารพ pull cap) · shouldReturnToSpawn/hasReachedSpawn (leash) · stepToward (chase/return ผ่าน stepMovement) · isPocketActive/idleTickInterval/shouldStepPocket (AI LOD) · isRespawnDue (timer) · distSq — ไม่แตะ pixi, server+offline ใช้ร่วม
- `src/game/mob/simulation.ts` — createMobSimulation(): **authoritative stateful sim** (P1-03, pure TS) — spawn ชุดแรก (spawnAllPockets) + respawn ทีละตัวเมื่อ killMob (respawnDelayMs, clock inject) + AI tick (wander/aggro/leash ผ่าน ai.ts) + AI LOD (pocket active/asleep). tick(dt,players,now)/killMob/**damageMob(id,amount)→{hp,killed} P1-05 combat death**/forEach/snapshots/aggroCountFor — server (MapRoom) รัน authoritative, client offline-fallback รันตัวเดียวกัน
- `src/game/mob/manager.ts` — createMobViewManager() (**P1-03 refactor จาก P0-09**): pixi glue **view ล้วน** — render/ขยับ/ลบ มอนตาม snapshot (server state หรือ offline sim) ผ่าน **interpolation buffer** (P1-01, มอน=entity เหมือน remote player); onMobAdd/Change/Remove + syncAll (offline bulk) + removeAll + getAliveTargets (combat) + facing derive จาก delta (ไม่ sync ทิศ); **P1-05**: HP bar เล็ก ๆ เหนือมอนที่ hp < maxHp (maxHp จาก combatBalance, container wrap animator+bar); ไม่มี game logic (authority อยู่ที่ simulation.ts)

## Game logic (P1-04, skill schema — src/game/skill/**)

- `src/game/skill/types.ts` — `SkillDefinition` type: 37 field ตรงชื่อ/ลำดับ **GS v15 §50.1 เป๊ะ** (ห้าม rename) — comment อธิบาย type ต่อ field ที่ตีความคลุมเครือ (อ้าง §50.2–50.4 + proposal) + `SKILL_FIELD_NAMES` (readonly tuple 37 ชื่อ, derive `SkillFieldName`) — ใช้ทั้ง loader (unknown-field guard) และเทสต์
- `src/game/skill/loader.ts` — `loadSkillDefinitions(raw: unknown[]): Map<skillId, SkillDefinition>` (pure, ไม่ใช่ zod, match pattern ของ `src/engine/map/loader.ts`) — fail-loud: field ขาด/type ผิด/ค่าติดลบที่ไม่ควร/unknown field/skillId ซ้ำ → `SkillDefinitionError` ระบุ path field; **ยังไม่มี cast จริง (P1-05 scope)**
- `src/game/skill/views.ts` — แบ่ง field ตาม runtime role (**TA §16.1**): `serverView(def)` (shallow copy ครบ 37 field) · `clientView(def)` + `ClientSkillView` type (ตัด 9 server-only field: baseMultiplier/scalingStat/damageType/maxTargets/hitCount/bossModifier/pvpModifier/crowdControl/serverAuthority — "ไม่ ship ลง client bundle") · `SERVER_ONLY_FIELDS` const — comment ท้ายไฟล์บันทึก gap ที่ §16.1 ไม่ได้จัดหมวด skillName/description/statusEffects ชัดเจน (เก็บไว้ใน clientView ตามเหตุผลที่ document)
- `src/game/skill/data/warrior-skills-server.ts` — **SERVER-ONLY** data นักดาบ 4 skills (full SkillDefinition 37 field, มี server-only literal baseMultiplier/bossModifier/maxTargets ฯลฯ) copy จาก proposal §3.1 — **PENDING OWNER**; `WARRIOR_SKILLS_SERVER` ป้อนเข้า loadSkillDefinitions (server/**+tests). **client ห้าม import** (literal รั่ว bundle — ดู known-traps)
- `src/game/skill/data/warrior-skills-client.ts` — **CLIENT-SAFE** manifest นักดาบ 4 skills (ClientSkillView 28 field, **ไม่มี 9 server-only field แม้ literal**) — `WARRIOR_SKILLS_CLIENT` ให้ client (app.ts/HUD) import ตรง; drift guard = ต้อง = clientView(server) เป๊ะ (tests/game-skill-loader.test.ts)

## Game logic (combat — src/game/combat/**)

- `src/game/combat/hit-test.ts` — pure combat geometry (ไม่แตะ pixi, **shared client/server**): findHits (tile-space radius + screen-space arc รอบ facing), rollDummyDamage/advanceCooldown/canAttack/applyDummyDamage (offline/stub) + helper screenAngleForDirection/tileUnitVectorForScreenAngle (reuse ใน combat-stub.ts + cast-validation.ts)
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** (P1-05, TA §15.2): computeDamage/computeSkillDamage (สูตร diminishing ATK×baseMult×mitigation[k/(k+effDef)], crit, bossModifier/pvpModifier/tierReduction, hitCount aggregate) + effectiveDef/mitigationFactor (guard div-by-0/ติดลบ); RNG inject; **ห้าม client bundle import** (ดู known-traps)
- `src/game/combat/cast-validation.ts` — **pure** (P1-05, TA §16.2/§16.3/§18.4): validateCast (unknown_skill/cooldown/out_of_range) + isSkillReady/skillReadyAt + isAimInRange + skillAttackShape (§50.1→geometry) + resolveSkillHits (findHits + maxTargets cap, nearest-first)
- `src/game/combat/damage-aggregate.ts` — damage number aggregate window (**pure**, P1-06, GS §17.10 · TA §11): createDamageAggregateState/addToAggregate (สะสมยอดต่อ bucket key เช่น mobId)/tickDamageAggregate (flush เป็นเลขก้อนเดียวทุก windowMs) — ใช้เมื่อ damage-number.ts เกิน budget/quality cap
- `src/game/combat/hit-stop.ts` — hit stop state/timescale (**pure**, P1-06, GS §17.5): createHitStopState/triggerHitStop (level→duration, ใหม่ไม่บวกสะสม ใช้ค่ามากสุด)/advanceHitStop (real-time decay)/computeHitStopTimeScale — **visual เท่านั้น** (combat-stub.ts ใช้ scale เฉพาะ juice update, ห้ามแตะ network/sim/cooldown)
- `src/game/combat/damage-number.ts` — createDamageNumberLayer() (**P1-06 refactor จาก P0-10**): pixi glue — **BitmapText + object pool** (engine/render/object-pool.ts, poolSize 300–500 knob) แทน Text สร้าง-ทิ้ง; แยกสไตล์ normal/crit (BitmapFont คนละชื่อ, ใหญ่กว่า+สีต่าง GS §17.3); layer เป็น child เดียวของ scene.world (public field) (ไม่ผ่าน scene.addEntity ต่อเลข กัน DepthRegistry churn); เกิน budget/quality cap → เข้า damage-aggregate.ts (flush เป็นเลขก้อนทุก 0.5 วิ, GS §17.10); `activeCount` getter (debug/stress harness)
- `src/game/combat/stress-harness-rate.ts` — computeStressSpawnBatch() (**pure**, P1-06 §5): accumulator แบบเดียวกับ net/sync.ts advanceSendTimer แต่คืนจำนวน spawn/tick (รองรับ rate สูง 300/วิ) + cap กัน spike ตอน dt กระโดด
- `src/game/combat/stress-harness.ts` — createStressHarness() (**DEV-ONLY**, P1-06 §5, TA §11 budget proof): F4 toggle → spawn มอนสังเคราะห์ ~40 ตัวผ่าน MobViewHandle.onMobAdd ตรง ๆ (prefix `stress:`) + damage number ~300/วิ ผ่าน CombatStubHandle.spawnSyntheticDamageNumber (pool/aggregate จริง ไม่ใช่ path แยก) — owner กด F4 ดู FPS จาก debug overlay (F3) เอง ไม่มี automated FPS assertion
- `src/game/combat/combat-stub.ts` — createCombatStub(): client combat coordinator (**P1-05 server-authoritative → P1-06 combat feel**) — Space→cooldown gate→triggerAttack() anticipation ทันที→**online**: castSkill intent (net) + onSkillResult→damage number จาก **ผล server** (+ hit-stop/screen shake trigger เมื่อ crit/kill หรือ skill.screenShakeLevel สูง, P1 scope: skill เดียว = deps.skill); **offline**: dummy damage number (non-authoritative playground, ไม่ฆ่า) + hitbox debug wedge (shape สกิลจริง); **P1-06**: hit-stop time-scale เฉพาะ juice update (damage number/hitbox fade, ไม่แตะ cooldown/network) + screen shake offset ดันเข้า `scene.setCameraShakeOffset()` ทุก frame (real-time decay) + `spawnSyntheticDamageNumber()` (dev-only, stress harness hook). **ไม่ import formula.ts** (server-only)

## Realtime server (P0-07, แยก process — L4)

- `server/index.ts` — Colyseus Server entry: define MapRoom **+ `.filterBy(['mapId','channelId'])`** (P0-08 — map+channel = room instance) + listen ws://localhost:2567 (env PORT) — รันด้วย `npm run dev:server` (tsx)
- `server/rooms/MapRoom.ts` — MapRoom (map+channel instance): onCreate/onJoin/onMessage/onLeave; **P1-02 movement**: validateMove ทุก MSG_MOVE → snap กลับ (MSG_POSITION_CORRECTION); **P1-03 mob sim**: createMobSimulation + setSimulationInterval(10Hz) → stepMobSim → syncMobsToState (**AOI filter §18.2** = TODO); **P1-05 server combat authority**: onCreate load skills (loadSkillDefinitions WARRIOR_SKILLS) + combatBalance knob + per-player cooldown state; handleCast(MSG_CAST_SKILL) → validateCast → resolveSkillHits (maxTargets cap) → computeSkillDamage (formula server §15.2) → sim.damageMob (death→despawn+respawn) → sync + broadcast MSG_SKILL_RESULT · ปฏิเสธ → MSG_CAST_REJECTED; **P1-07 reconnect grace** (§59.1): onLeave(consented?) แยก consented (ลบทันที) vs หลุด (allowReconnection hold `graceSeconds` → reconnect ทัน = state/tracker/cooldown เดิม restore, หมด = removePlayer) · onJoin ใช้ resolveSpawnPosition snap พิกัด invalid→safe camp · graceSeconds = knob (env RECONNECT_GRACE_SECONDS override dev/test); TODO: persistence, anti-exploit death case (P2)
- `server/schema/MapRoomState.ts` — @colyseus/schema state: PlayerState{tx,ty,direction,anim} + **MobState{mobId,mobType,tx,ty,state,hp}** (hp update จริง P1-05) + MapRoomState{mapId,channelId,roomId,players,**mobs**}
- `server/tsconfig.json` — tsconfig แยกของ server (legacy decorators, node env; แยกจาก Next tsconfig)

## UI (React overlay)

- `src/ui/GameCanvas.tsx` — "use client" bridge: mount/unmount engine (กัน StrictMode double-mount); เก็บ EngineHandle ใน ref (ไม่ใช่ React state) + render `<DebugOverlay>` (P0-11)
- `src/ui/DebugOverlay.tsx` — "use client" (P0-11, P0 §4.10): panel มุมจอ poll `EngineHandle.getDebugInfo()` ทุกช่วง poll interval (config debugOverlay.pollIntervalMs, ~250ms, ไม่ per-frame) แสดง fps/player tile/pointer tile/entityCount/net(status·mapId·roomId·channelId·playerCount) + ปุ่ม toggle depth debug (เรียก `setDepthDebug`) + ซ่อน/แสดง panel (ปุ่ม + คีย์ลัด F3) — ยังไม่มี Zustand ใน P0 (ใช้ useState+setInterval; TODO P1 ย้ายเข้า Zustand bridge ตอน HUD จริง)
- `src/ui/debug-overlay-logic.ts` — **pure** (P0-11): DebugOverlayState + `isDebugToggleKey`/`toggleVisible`/`toggleDepthDebug` (reducer, แยกจาก component ให้เทสต์ได้โดยไม่ต้อง render)

## Config

- `package.json` — scripts + dependencies (npm)
- `next.config.ts` — Next.js config
- `tsconfig.json` — TypeScript config (alias `@/*` → `src/*`)
- `eslint.config.mjs` — ESLint flat config
- `postcss.config.mjs` — PostCSS (Tailwind v4)
- `vitest.config.ts` — Vitest config

## Tests

- `tests/docs-guard.test.ts` — path-guard: ไฟล์ที่อ้างใน CODEMAP/feature-map/context ต้องมีจริง
- `tests/engine-config.test.ts` — EngineConfig defaults / merge / resolveResolution
- `tests/engine-resize.test.ts` — clampSize (pure resize helper)
- `tests/engine-iso-coords.test.ts` — iso converters: known values / round-trip fuzz / snapToTile
- `tests/engine-iso-depth.test.ts` — depthKey ordering + zLayer band non-overlap
- `tests/engine-map-loader.test.ts` — map loader validation (invariants throw) + P0 Test Field passes + **P1-07** safeCamp optional (ไม่ระบุ→safeCampOf=spawnPoint · ระบุเดินได้ผ่าน · ทับ collision/หลุดขอบ→throw)
- `tests/engine-render-depth.test.ts` — DepthRegistry: sorted order ตาม depthKey + tie-break + dirty tracking + lifecycle
- `tests/engine-render-camera.test.ts` — camera math: map screen bounds (จตุรัส/ไม่จตุรัส) + clamp ขอบ 4 ด้าน + content==viewport + lerp follow + **P1-06**: applyShakeOffset (offset {0,0} no-op + บวกตรง ๆ ทั้งสองแกน)
- `tests/engine-render-placement.test.ts` — lock foot convention: entityFootToScreen = tileToScreen (ไม่ +0.5), ≠ tileCenterToScreen
- `tests/engine-input-keyboard.test.ts` — intent mapping screen→tile (W/W+D/ปล่อยหมด/ตรงข้ามหักล้าง) + basis project ถูกทิศ
- `tests/engine-movement-mover.test.ts` — stepMovement: เดินตรง/เฉียง normalize + clamp dt + collision slide แยกแกน + block หยุด
- `tests/engine-movement-direction.test.ts` — resolveDirection: 8 combo→ทิศ + มุม 45° ครบ + ขอบ 22.5° + idle คงทิศ + directionToScreenUnit
- `tests/engine-animation-manifest.test.ts` — resolveClip: 5 drawn ไม่ mirror + 3 mirror ชี้ source ถูก + ครบ 8 ทิศ×idle/walk + 8-dir override + error (unknown anim / ทิศไม่มี / mirror source ไม่วาด) + advancePlayhead timing/loop/clamp/guard
- `tests/engine-net-sync.test.ts` — net sync pure logic (P0-07, channel P0-08): coerce dir/anim + snapshotChanged + advanceSendTimer throttle/clamp + toMoveMessage + shared protocol constants + JoinOptions channelId shape + computePlayerCount
- `tests/engine-net-interpolation.test.ts` — interpolation buffer pure logic (P1-01): lerp กึ่งกลาง/สัดส่วน + ทิศ/anim จาก snapshot ใหม่ + edge ว่าง/snapshot เดียว/เกิดใหม่ clamp + extrapolate สั้น+clamp เกิน max + out-of-order/duplicate drop + overflow ring + pooling reuse
- `tests/shared-reconnect.test.ts` — reconnect pure logic (P1-07, §59.1): decideReconnect decision table (within/expired/room ปิด/pos invalid) + resolveSpawnPosition (walkable→requested · ทับ collision/non-finite→safe camp · pos เป็น copy) + reconnectBackoffMs (ลำดับ+cap+attempt ติดลบ/float) + cumulative backoff < grace + shouldRetryReconnect
- `tests/shared-movement-validation.test.ts` — validateMove pure logic (P1-02): เดินปกติผ่าน (หลาย speed/elapsed) + speed hack จับ (reason speed) + blocked จับ (correctTo=prev) + teleport จับ (absolute cap ก่อน speed) + edge elapsed 0/ติดลบ (clock skew, ไม่ divide-by-zero) + maxElapsed clamp (gap ยาวไม่บวม allowance) + non_finite + jitter tolerance ไม่ false positive
- `tests/game-mob-rng.test.ts` — createLcgRng: seed เดียวกัน→sequence เหมือนกัน, seed ต่างกัน→ต่าง, ค่าอยู่ใน [0,1); defaultRng smoke test
- `tests/game-mob-spawn.test.ts` — spawnPocketMobs/spawnAllPockets (pure): จำนวนอยู่ในช่วง packSize + clamp activeCap (หลาย seed) + deterministic ตาม seed + จุดเกิดอยู่ใน pocket.area และเดินได้จริง (ไม่บน blocked) + findWalkableSpawnPoint คืน undefined เมื่อหาไม่เจอ (ไม่ throw) + P0_TEST_FIELD จริง (3 pocket ไม่ล้นกัน)
- `tests/game-mob-wander.test.ts` — createWanderState/stepWander (pure): idle/walk สลับตาม config (ไม่ hardcode) + ระยะเดิน = speed·dt + pure (ไม่ mutate) + leash ไม่หลุด pocket.area (deterministic + seeded random หลายร้อย step) + leash เคารพ collision ของ map จริงด้วย + walkableFromMap ผูก isWalkableTile ถูก
- `tests/game-mob-ai.test.ts` — mob AI pure logic (P1-03): selectAggroTarget (nearest ในรัศมี/ขอบ/ข้ามคน pull cap เต็ม) + shouldReturnToSpawn (null/leash/deaggro) + hasReachedSpawn + stepToward (speed·dt/normalize/blocked ไถล) + isPocketActive (AOI ขอบ rect/ใน pocket) + idleTickInterval/shouldStepPocket (LOD active/idle/asleep) + isRespawnDue (clock)
- `tests/game-mob-simulation.test.ts` — createMobSimulation (P1-03, inject rng/clock): spawn ชุดแรก + aggro enter/chase (ระยะลด) + pull cap (มอน>cap → aggro ≤ cap) + leash/return (ล่อออก pocket → หนีไกล → return → กลับ pocket area) + respawn timer (kill→due→เกิดใหม่, ไม่เกิน activeCap) + AI LOD asleep (ไม่มี player + idleTickHz 0 → frozen)
- `tests/game-skill-loader.test.ts` — skill schema loader (P1-04, GS §50.1 · TA §16.1): SKILL_FIELD_NAMES ครบ 37 ตรงชื่อ/ลำดับ + loadSkillDefinitions ดีผ่าน/skillId ซ้ำ→throw/ทุก field (37 ตัว) ขาด→throw ระบุชื่อ/type ผิด (string/boolean/array)→throw/ค่าติดลบที่ไม่ควร (cooldown/range/maxTargets/unlockLevel/baseMultiplier)→throw/unknown field (รวม typo)→throw ระบุชื่อ + WARRIOR_SKILLS ทั้ง 4 ผ่าน validation จริง + serverView ครบ 37/copy ใหม่ + clientView ตัด 9 server-only field ครบทุก skill
- `tests/game-combat-formula.test.ts` — damage formula (pure, P1-05, §15.2): effectiveDef floor 0 + mitigationFactor (DEF=k→0.5/DEF=0→1.0/ตาราง proposal §1.3/guard div-by-0) + computeDamage (DEF=k ครึ่ง, Penetration, crit path, bossMod/pvpMod/tierReduction, ไม่ติดลบ, hand-calc §1.4 slime 24/mushroom 22) + computeSkillDamage (hitCount aggregate, multi-hit crit, hitCount 0)
- `tests/server-cast-validation.test.ts` — cast validation (pure, P1-05, §16.2/§16.3/§18.4): cooldown (isSkillReady/skillReadyAt) + range (isAimInRange) + skillAttackShape (cone/circle/null) + resolveSkillHits (maxTargets cap nearest-first, นอกรัศมีไม่โดน) + validateCast (unknown_skill/cooldown/out_of_range ตามลำดับ)
- `tests/game-combat-hit-test.test.ts` — findHits (pure, P0-10): ระยะ+arc รอบทิศ facing (8 ทิศ, กันชน half-arc >45° กับ boundary near-tie แยกเทสต์), หลังผู้เล่นไม่โดน, ระยะ 0 โดนเสมอ + rollDummyDamage ในช่วง (seeded RNG deterministic) + advanceCooldown/canAttack (cooldown gate เต็มรอบ) + applyDummyDamage (hp/death transition)
- `tests/engine-runtime-debug-info.test.ts` — roundTile (ปัด 2 ตำแหน่ง) + buildDebugInfo shape (fps ปัด, pointerTile null-safe) + IDLE_NET_DEBUG_INFO (P0-11, pure)
- `tests/ui-debug-overlay-logic.test.ts` — isDebugToggleKey (F3, กันชนคีย์อื่น) + toggleVisible/toggleDepthDebug reducer (pure, ไม่ mutate) (P0-11)
- `tests/engine-render-object-pool.test.ts` — createObjectPool (pure, P1-06, TA §11): acquire สร้างจนถึง capacity/เกิน cap คืน undefined (ไม่มี factory call เพิ่ม)/release+acquire reuse object เดิม (zero-alloc)/release ของแปลกปลอม+double-release = no-op ปลอดภัย (ไม่ corrupt free-list)/capacity ≤0 throw
- `tests/engine-render-screen-shake.test.ts` — screen shake pure state (P1-06, GS §17.5): trigger ตั้ง amplitude×scale/duration + level เกิน array clamp + แรงกว่าแทนที่/อ่อนกว่าไม่กลบ + advanceShake real-time decay + computeShakeOffset decay เชิงเส้น×ทิศจาก rng (deterministic) + หมดอายุ→{0,0} + array ว่าง = no-op
- `tests/game-combat-damage-aggregate.test.ts` — damage aggregate window (pure, P1-06, GS §17.10): hit เดียวยังไม่ครบ window ไม่ flush + สะสมครบ windowMs → flush ยอดรวม/hitCount/tile ล่าสุด + flush แล้วลบ bucket (window ใหม่เริ่มนับใหม่) + หลาย bucket อิสระต่อกัน + anyCrit = OR ทุก hit
- `tests/game-combat-hit-stop.test.ts` — hit-stop pure state/timescale (P1-06, GS §17.5): trigger ตั้ง remainingMs ตาม level + level เกิน/ติดลบ clamp + stacking ใช้ค่ามากสุด (ไม่บวกสะสม) + advanceHitStop real-time decay + array ว่าง = duration 0
- `tests/game-combat-stress-harness-rate.test.ts` — computeStressSpawnBatch (pure, P1-06 §5): rate/dt ตรงพอดี → spawn 1 + rate สูง (300/วิ) ≈ 4-5 ครั้ง/frame 60fps + สะสมหลาย frame ≈ rate ที่คาด (deterministic) + maxSpawnPerTick cap กัน spike dt กระโดด + rate ≤0 = ปิด + dt เล็กกว่า interval = spawn 0

## Docs

- `AI.md` — universal agent entry
- `CLAUDE.md` — orchestrator entry
- `AGENTS.md` — framework traps (Next.js 16)
- `docs/README.md` — สารบัญ docs
- `docs/current-state.md` — live state
- `docs/decision-index.md` — locked decisions
- `docs/known-traps.md` — bug classes
- `docs/feature-map.md` — feature → spec/source/tests
- `docs/token-budget.md` — read budget
- `docs/context/engine.md` — engine context pack
- `docs/context/ui.md` — ui context pack
- `docs/design/` — game spec (v15 canonical + P0 scope lock + map bibles)
- `docs/design/art-reference/` — ภาพ ref จาก owner (visual north star) + index README
- `docs/design/proposals/` — **proposal รอ owner เคาะ (ไม่ใช่ spec)** · `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` = P1 balance draft (ค่า k, stat baseline, skill 5 อาชีพ §50.1, mob Map 1) — PENDING OWNER, เข้า spec ผ่าน §59.4
- `docs/tech/` — tech spec (architecture v1.5 + decision locks)
