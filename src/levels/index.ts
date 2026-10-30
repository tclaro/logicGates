import type { LevelDef } from '../core/types';

const modules = import.meta.glob<LevelDef>('./data/*.json', { eager: true, import: 'default' });

/** Todas as fases, ordenadas pelo id. */
export const LEVELS: readonly LevelDef[] = Object.values(modules).sort((a, b) => a.id - b.id);

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelFileName(id: number): string {
  return `${String(id).padStart(2, '0')}.json`;
}
