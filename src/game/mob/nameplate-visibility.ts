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
  readonly normalMinProjectedSpacingTiles: number;
}

interface RankedNormalNameplate {
  readonly id: string;
  readonly position: Readonly<TilePoint>;
  readonly distanceSquared: number;
  readonly damaged: boolean;
}

function projectedDistanceSquared(a: Readonly<TilePoint>, b: Readonly<TilePoint>): number {
  const dtx = a.tx - b.tx;
  const dty = a.ty - b.ty;
  const projectedX = dtx - dty;
  const projectedY = (dtx + dty) * 0.5;
  return projectedX * projectedX + projectedY * projectedY;
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
  const minSpacing = Math.max(0, config.normalMinProjectedSpacingTiles);
  const minSpacingSquared = minSpacing * minSpacing;
  const occupiedPositions: Readonly<TilePoint>[] = [];

  for (const candidate of candidates) {
    if (candidate.rank !== "normal") {
      visibleIds.add(candidate.id);
      occupiedPositions.push(candidate.position);
      continue;
    }

    const dx = candidate.position.tx - playerPosition.tx;
    const dy = candidate.position.ty - playerPosition.ty;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) continue;

    rankedNormals.push({
      id: candidate.id,
      position: candidate.position,
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

  let selectedNormalCount = 0;
  for (const candidate of rankedNormals) {
    if (selectedNormalCount >= normalLimit) break;
    const overlapsVisibleLabel = occupiedPositions.some(
      (position) => projectedDistanceSquared(candidate.position, position) < minSpacingSquared,
    );
    if (overlapsVisibleLabel) continue;

    visibleIds.add(candidate.id);
    occupiedPositions.push(candidate.position);
    selectedNormalCount += 1;
  }

  return visibleIds;
}

/** Advances a label opacity without overshoot; zero duration intentionally snaps. */
export function stepNameplateAlpha(
  currentAlpha: number,
  targetVisible: boolean,
  dtSeconds: number,
  fadeDurationMs: number,
): number {
  const current = Math.max(0, Math.min(1, currentAlpha));
  if (fadeDurationMs <= 0) return targetVisible ? 1 : 0;

  const step = (Math.max(0, dtSeconds) * 1000) / fadeDurationMs;
  return targetVisible ? Math.min(1, current + step) : Math.max(0, current - step);
}
