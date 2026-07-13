import type { TilePoint } from "@/engine/iso/coords";
import type { MobRank } from "@/game/mob/name-catalog";

export interface MobNameplateCandidate {
  readonly id: string;
  readonly rank: MobRank;
  readonly position: Readonly<TilePoint>;
  readonly damaged: boolean;
}

export interface MobNameplateDensityConfig {
  readonly normalRevealRadiusTiles: number;
  readonly normalVisibleLimit: number;
}

interface RankedNormalNameplate {
  readonly id: string;
  readonly distanceSquared: number;
  readonly damaged: boolean;
}

/**
 * Keeps high-value targets readable while limiting visual noise from normal mobs.
 * Damaged normal mobs are prioritised so combat feedback does not disappear.
 */
export function selectVisibleMobNameplateIds(
  candidates: readonly MobNameplateCandidate[],
  playerPosition: Readonly<TilePoint>,
  config: MobNameplateDensityConfig,
): ReadonlySet<string> {
  const visibleIds = new Set<string>();
  const rankedNormals: RankedNormalNameplate[] = [];
  const radius = Math.max(0, config.normalRevealRadiusTiles);
  const radiusSquared = radius * radius;
  const normalLimit = Math.max(0, Math.floor(config.normalVisibleLimit));

  for (const candidate of candidates) {
    if (candidate.rank !== "normal") {
      visibleIds.add(candidate.id);
      continue;
    }

    const dx = candidate.position.tx - playerPosition.tx;
    const dy = candidate.position.ty - playerPosition.ty;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) continue;

    rankedNormals.push({
      id: candidate.id,
      distanceSquared,
      damaged: candidate.damaged,
    });
  }

  rankedNormals.sort(
    (a, b) =>
      Number(b.damaged) - Number(a.damaged) ||
      a.distanceSquared - b.distanceSquared ||
      a.id.localeCompare(b.id),
  );

  for (const candidate of rankedNormals.slice(0, normalLimit)) {
    visibleIds.add(candidate.id);
  }

  return visibleIds;
}
