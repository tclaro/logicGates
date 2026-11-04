import type { GateType, LevelDef, UltimateLevelDef } from '../core/types';

const modules = import.meta.glob<LevelDef>('./data/*.json', { eager: true, import: 'default' });

/** Todas as fases, ordenadas pelo id. */
export const LEVELS: readonly LevelDef[] = Object.values(modules).sort((a, b) => a.id - b.id);

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

const ultimateModules = import.meta.glob<UltimateLevelDef>('./ultimate/*.json', { eager: true, import: 'default' });

/** Fases do modo Ultimate, ordenadas pelo id. */
export const ULTIMATE_LEVELS: readonly UltimateLevelDef[] = Object.values(ultimateModules).sort((a, b) => a.id - b.id);

export function getUltimateLevel(id: number): UltimateLevelDef | undefined {
  return ULTIMATE_LEVELS.find((l) => l.id === id);
}

/** Peças que aparecem pela primeira vez nesta fase do Ultimate. */
export function newPiecesIn(levelId: number): GateType[] {
  const before = new Set(ULTIMATE_LEVELS.filter((l) => l.id < levelId).flatMap((l) => Object.keys(l.pieces)));
  const level = getUltimateLevel(levelId);
  return level ? (Object.keys(level.pieces) as GateType[]).filter((g) => !before.has(g)) : [];
}

export function levelFileName(id: number): string {
  return `${String(id).padStart(2, '0')}.json`;
}
