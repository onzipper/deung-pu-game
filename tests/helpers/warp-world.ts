// FakeWorld — a multi-room in-memory harness for the D-069/D-070 town-trip warp handoff (PR5 Phase C).
//
// Models N fake MapRoom hosts (each with its own players Set + seat counter) over ONE shared, character-scoped
// economy (gold ledger + bag + storage). Every seam the trip controller drives is honest and observable:
//   • warp seams (reserve/export/attach/rebind) move the single actor between hosts, one at a time;
//   • town seams (sell/deposit/buy) mutate the shared bag/gold with idempotency-key replay dedupe;
//   • acquireHostForMap resolves an existing solo host or "creates" a new one (registry insert).
// The factory wires a real BotRuntime to the world so tests drive the true tickPaid → tickTrip path.

import {
  BotRuntime,
  type BotAttackOutcome,
  type BotBagItemView,
  type BotHost,
  type BotPotionOutcome,
  type BotTownTxResult,
  type BotWarpExport,
} from "../../server/bot/runtime";
import type { SessionRepo } from "../../server/bot/store";
import type { AgentMob, Vec2 } from "../../server/bot/agent";
import type { BotRulesV1 } from "../../server/bot/types";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../../server/config/bot";
import { MSG_BOT_STOPPED, type BotStoppedMessage } from "../../src/shared/net-protocol";

const EMPTY_OUTCOME: BotAttackOutcome = {
  killed: 0,
  gold: 0,
  exp: 0,
  loot: [],
  bagOverflowed: false,
  overflow: [],
  leveledUp: false,
};
const UNAVAILABLE_POTION: BotPotionOutcome = { status: "unavailable", hpFraction: 1, cooldownUntilMs: 0 };

export interface FakeHostSpec {
  roomId: string;
  mapId: string;
  partyId?: string;
  capacity?: number;
  safeCamp?: Vec2;
  /** scriptable warp failures (per host). */
  reserveFails?: boolean;
  attachFails?: boolean;
  exportReturnsNull?: boolean;
  /** scriptable farm mobs this host reports (drives the bag-full divert farm loop). */
  mobs?: () => AgentMob[];
  /** scriptable attack outcome (the bag-full divert path drives an overflow through here). */
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
}

/** Per-host recorded seam calls (which host actually handled a transaction — the rebind proof). */
interface HostCalls {
  reserve: number;
  release: number;
  export: number;
  attach: number;
  persist: number;
  step: number;
  attack: number;
  sell: string[];
  deposit: string[];
  buy: string[];
}

export class FakeHost implements BotHost {
  readonly roomId: string;
  readonly mapId: string;
  readonly partyId: string;
  readonly capacity: number;
  readonly safeCamp: Vec2;
  reserveFails: boolean;
  attachFails: boolean;
  exportReturnsNull: boolean;
  /** actorIds materialized in this room (players.has = "this host contains the actor"). */
  readonly players = new Set<string>();
  /** pending warp-seat reservations, actor-keyed (mirrors MapRoom.pendingActorSeats). */
  private readonly pending = new Map<string, number>();
  readonly calls: HostCalls = { reserve: 0, release: 0, export: 0, attach: 0, persist: 0, step: 0, attack: 0, sell: [], deposit: [], buy: [] };
  private pos: Vec2 = { tx: 0, ty: 0 };
  private readonly scriptMobs: () => AgentMob[];
  private readonly scriptAttack: (target: Vec2) => Promise<BotAttackOutcome>;

  constructor(
    spec: FakeHostSpec,
    private readonly world: FakeWorld,
  ) {
    this.roomId = spec.roomId;
    this.mapId = spec.mapId;
    this.partyId = spec.partyId ?? "";
    this.capacity = spec.capacity ?? 8;
    this.safeCamp = spec.safeCamp ?? { tx: 0, ty: 0 };
    this.reserveFails = spec.reserveFails ?? false;
    this.attachFails = spec.attachFails ?? false;
    this.exportReturnsNull = spec.exportReturnsNull ?? false;
    this.scriptMobs = spec.mobs ?? (() => []);
    this.scriptAttack = spec.attack ?? (async () => EMPTY_OUTCOME);
  }

  private pendingSum(): number {
    let n = 0;
    for (const c of this.pending.values()) n += c;
    return n;
  }

  // ── warp seams ──
  botReserveWarpSeat(actorId: string): boolean {
    this.calls.reserve += 1;
    if (this.reserveFails) return false;
    const current = this.pending.get(actorId) ?? 0;
    if (current === 0 && this.players.size + this.pendingSum() >= this.capacity) return false;
    this.pending.set(actorId, current + 1);
    return true;
  }
  botReleaseWarpSeat(actorId: string): void {
    this.calls.release += 1;
    const current = this.pending.get(actorId) ?? 0;
    if (current <= 1) this.pending.delete(actorId);
    else this.pending.set(actorId, current - 1);
  }
  botExportActor(actorId: string): BotWarpExport | null {
    this.calls.export += 1;
    if (this.exportReturnsNull) return null; // death raced — the actor is not exportable (stays put).
    if (!this.players.has(actorId)) return null;
    this.players.delete(actorId);
    return { actorId } as unknown as BotWarpExport; // attach only round-trips actorId in the FakeWorld.
  }
  botAttachWarpedActor(exported: BotWarpExport): boolean {
    this.calls.attach += 1;
    if (this.attachFails) return false;
    if (this.players.has(exported.actorId)) return false; // invariant breach guard (mirrors MapRoom).
    this.players.add(exported.actorId);
    return true;
  }
  botPersistNow(): void {
    this.calls.persist += 1;
  }
  botSafeCampAnchor(): Vec2 {
    return { tx: this.safeCamp.tx, ty: this.safeCamp.ty };
  }

  // ── town seams (delegate to the shared world economy; record which host handled it) ──
  async botBagItems(): Promise<BotBagItemView[]> {
    return this.world.bagView();
  }
  async botTownSell(
    _actorId: string,
    instanceId: string,
    expectedVersion: number,
    quantity: number,
    idemKey: string,
  ): Promise<BotTownTxResult> {
    this.calls.sell.push(idemKey);
    return this.world.sell(instanceId, expectedVersion, quantity, idemKey);
  }
  async botTownDeposit(
    _actorId: string,
    instanceId: string,
    expectedVersion: number,
    idemKey: string,
  ): Promise<BotTownTxResult> {
    this.calls.deposit.push(idemKey);
    return this.world.deposit(instanceId, expectedVersion, idemKey);
  }
  async botTownBuy(_actorId: string, itemId: string, quantity: number, idemKey: string): Promise<BotTownTxResult> {
    this.calls.buy.push(idemKey);
    return this.world.buy(itemId, quantity, idemKey);
  }
  async botGoldBalance(): Promise<number | null> {
    return this.world.gold;
  }

  // ── farm seams (only used after the actor lands home to walk back to the pocket) ──
  botClaimAuthority(): string | null {
    return this.world.actorId;
  }
  botReleaseAuthority(): void {}
  botMobs(): AgentMob[] {
    return this.scriptMobs();
  }
  botPos(actorId: string): Vec2 | null {
    return this.players.has(actorId) ? { tx: this.pos.tx, ty: this.pos.ty } : null;
  }
  botHpFraction(): number {
    return 1;
  }
  botAttackRange(): number {
    return 1;
  }
  botBaseCooldownSeconds(): number {
    return 1;
  }
  botStepToward(): boolean {
    this.calls.step += 1;
    return false;
  }
  async botAttack(_actorId: string, target: Vec2): Promise<BotAttackOutcome> {
    this.calls.attack += 1;
    return this.scriptAttack(target);
  }
  botOwnerSend(_accountId: string, type: string, message: unknown): boolean {
    this.world.messages.push({ type, message });
    return true; // one host records; world.ownerSend stops fanning after the first true.
  }
  isForbiddenTargetType(): boolean {
    return false;
  }
  pocketExists(): boolean {
    return true;
  }
  async botUsePotion(): Promise<BotPotionOutcome> {
    return UNAVAILABLE_POTION;
  }
  botPlanPath(): Vec2[] | null {
    return []; // empty route = already at the pocket anchor → recovery settles `arrived` next tick.
  }
  botPocketAnchor(): Vec2 | null {
    return { tx: 0, ty: 0 };
  }
}

export interface BagSeed {
  instanceId: string;
  itemId: string;
  quantity?: number;
  version?: number;
  rarity?: string;
  equipped?: boolean;
  sellPrice?: number | null;
  deliverable?: boolean;
}

export class FakeWorld {
  readonly actorId: string;
  gold: number;
  buyPrice: number;
  readonly bag: BotBagItemView[] = [];
  readonly storage: BotBagItemView[] = [];
  readonly messages: { type: string; message: unknown }[] = [];
  /** maps that acquireHostForMap must refuse (simulate creation failure / no solo host). */
  readonly blockAcquire = new Set<string>();
  /** every idempotency key applied exactly once (replay = no-op). */
  private readonly applied = new Set<string>();
  private readonly registry: FakeHost[] = [];
  readonly acquireCalls: string[] = [];
  private createdSeq = 0;

  constructor(opts: { actorId: string; gold: number; buyPrice: number; bag?: BagSeed[] }) {
    this.actorId = opts.actorId;
    this.gold = opts.gold;
    this.buyPrice = opts.buyPrice;
    for (const s of opts.bag ?? []) {
      this.bag.push({
        instanceId: s.instanceId,
        itemId: s.itemId,
        quantity: s.quantity ?? 1,
        version: s.version ?? 1,
        rarity: s.rarity ?? "common",
        equipped: s.equipped ?? false,
        sellPrice: s.sellPrice ?? null,
        deliverable: s.deliverable ?? false,
      });
    }
  }

  addHost(spec: FakeHostSpec): FakeHost {
    const host = new FakeHost(spec, this);
    this.registry.push(host);
    return host;
  }

  /** remove a host from the registry (simulate a disposed MapRoom) so acquireHostForMap skips it. */
  disposeHost(host: FakeHost): void {
    const idx = this.registry.indexOf(host);
    if (idx >= 0) this.registry.splice(idx, 1);
  }

  hostsContaining(actorId: string): FakeHost[] {
    return this.registry.filter((h) => h.players.has(actorId));
  }
  actorCount(): number {
    return this.hostsContaining(this.actorId).length;
  }

  acquireHostForMap = async (mapId: string): Promise<BotHost | null> => {
    this.acquireCalls.push(mapId);
    if (this.blockAcquire.has(mapId)) return null;
    const existing = this.registry.find((h) => h.mapId === mapId && h.partyId === "");
    if (existing) return existing;
    return this.addHost({ roomId: `${mapId}-created-${++this.createdSeq}`, mapId });
  };

  ownerSend = (_accountId: string, type: string, message: unknown): boolean => {
    for (const h of this.registry) {
      if (h.botOwnerSend(_accountId, type, message)) return true;
    }
    return false;
  };

  // ── shared economy ──
  bagView(): BotBagItemView[] {
    return this.bag.map((r) => ({ ...r }));
  }

  sell(instanceId: string, _expectedVersion: number, _quantity: number, idemKey: string): BotTownTxResult {
    if (this.applied.has(idemKey)) return { ok: true, goldDelta: 0 };
    const idx = this.bag.findIndex((r) => r.instanceId === instanceId);
    if (idx < 0) return { ok: false, reason: "ITEM_NOT_FOUND", goldDelta: 0 };
    const row = this.bag[idx];
    if (row.sellPrice == null) return { ok: false, reason: "NOT_SELLABLE", goldDelta: 0 };
    const proceeds = row.sellPrice * row.quantity;
    this.bag.splice(idx, 1);
    this.gold += proceeds;
    this.applied.add(idemKey);
    return { ok: true, goldDelta: proceeds };
  }

  deposit(instanceId: string, _expectedVersion: number, idemKey: string): BotTownTxResult {
    if (this.applied.has(idemKey)) return { ok: true, goldDelta: 0 };
    const idx = this.bag.findIndex((r) => r.instanceId === instanceId);
    if (idx < 0) return { ok: false, reason: "ITEM_NOT_FOUND", goldDelta: 0 };
    const row = this.bag[idx];
    if (!row.deliverable) return { ok: false, reason: "ITEM_BOUND", goldDelta: 0 };
    this.bag.splice(idx, 1);
    this.storage.push(row);
    this.applied.add(idemKey);
    return { ok: true, goldDelta: 0 };
  }

  buy(itemId: string, quantity: number, idemKey: string): BotTownTxResult {
    if (this.applied.has(idemKey)) return { ok: true, goldDelta: 0 };
    const cost = this.buyPrice * quantity;
    if (this.gold < cost) return { ok: false, reason: "INSUFFICIENT_GOLD", goldDelta: 0 };
    this.gold -= cost;
    const stack = this.bag.find((r) => r.itemId === itemId && !r.equipped);
    if (stack) stack.quantity += quantity;
    else
      this.bag.push({
        instanceId: `buy-${idemKey}`,
        itemId,
        quantity,
        version: 1,
        rarity: "common",
        equipped: false,
        sellPrice: this.buyPrice,
        deliverable: true,
      });
    this.applied.add(idemKey);
    return { ok: true, goldDelta: -cost };
  }

  /** non-equipped bag instance count = used slots. */
  usedSlots(): number {
    return this.bag.filter((r) => !r.equipped).length;
  }

  stoppedMessage(): BotStoppedMessage | undefined {
    return this.messages.find((m) => m.type === MSG_BOT_STOPPED)?.message as BotStoppedMessage | undefined;
  }
}

export interface WarpHarnessOptions {
  world: FakeWorld;
  /** the host the runtime starts on (the farm) — must already contain the actor. */
  farmHost: FakeHost;
  tier?: BotTier;
  config?: BotConfig;
  rules?: BotRulesV1;
  resolveTier?: () => Promise<BotTier>;
  /** proactive preflight: open a town trip on the first paid tick before farming (D-069/D-070). */
  initialTownTrip?: boolean;
}

const NO_POTION_RULES: BotRulesV1 = { skillSlots: [0], potionThresholdPct: null, lootAll: true };

export function createWarpHarness(options: WarpHarnessOptions) {
  let clock = 100_000;
  let stoppedCount = 0;
  const { world, farmHost } = options;

  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async () => undefined,
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };

  const runtime = new BotRuntime({
    host: farmHost,
    config: options.config ?? warpConfig(),
    sessionRepo,
    rarityOf: () => undefined,
    sessionRowId: "run-warp",
    accountId: "account-a",
    characterId: "character-a",
    profileId: "profile-a",
    actorId: world.actorId,
    mapId: farmHost.mapId,
    pocketId: "A",
    rules: options.rules ?? NO_POTION_RULES,
    tier: options.tier ?? "plus",
    resolveTier: options.resolveTier ?? (async () => options.tier ?? "plus"),
    baseCooldownSeconds: 1,
    startedAtMs: clock,
    now: () => clock,
    onStopped: () => {
      stoppedCount += 1;
    },
    onTakeoverSettled: () => undefined,
    acquireHostForMap: world.acquireHostForMap,
    ownerSend: world.ownerSend,
    initialTownTrip: options.initialTownTrip,
  });

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  return {
    runtime,
    world,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    stoppedCount: () => stoppedCount,
    state: () => runtime.continuitySnapshot.state,
    revision: () => runtime.continuitySnapshot.revision,
    /** one sim tick + a microtask/macrotask flush so the pumped async step resolves. */
    tickAndSettle: async (dtMs = 2_000) => {
      runtime.tick(dtMs);
      await flush();
    },
    flush,
  };
}

/** Town-trip config keyed to map1 (farm) + city-hub (town), with the D-070 knobs. */
export function warpConfig(over: Partial<BotConfig["townTrip"]> = {}): BotConfig {
  return {
    ...DEFAULT_BOT_CONFIG,
    botAllowedPockets: { map1: ["A"] },
    townTrip: { ...DEFAULT_BOT_CONFIG.townTrip, ...over },
  };
}
