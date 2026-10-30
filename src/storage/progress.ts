import type { GateType } from '../core/types';

export interface Progress {
  version: 1;
  /** Fases concluídas. */
  completed: number[];
  /** Portas cuja introdução já foi vista. */
  seenIntros: GateType[];
  sound: boolean;
  music: boolean;
}

const KEY = 'portas-logicas:progress';

export function defaultProgress(): Progress {
  return { version: 1, completed: [], seenIntros: [], sound: true, music: true };
}

/** Lê o progresso salvo; qualquer problema (storage bloqueado, JSON inválido) volta ao padrão. */
export function loadProgress(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return defaultProgress();
    const data = JSON.parse(raw) as Partial<Progress>;
    if (data.version !== 1) return defaultProgress();
    return {
      version: 1,
      completed: Array.isArray(data.completed) ? data.completed.filter((n) => Number.isInteger(n)) : [],
      seenIntros: Array.isArray(data.seenIntros) ? data.seenIntros : [],
      sound: data.sound !== false,
      music: data.music !== false,
    };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: Progress, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Sem armazenamento disponível: o progresso vale só nesta sessão.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Maior fase liberada: a seguinte à maior concluída, respeitando o total. */
export function highestUnlocked(progress: Progress, total: number): number {
  const best = progress.completed.length ? Math.max(...progress.completed) : 0;
  return Math.min(total, best + 1);
}

export function isUnlocked(progress: Progress, levelId: number, total: number): boolean {
  return levelId >= 1 && levelId <= highestUnlocked(progress, total);
}

export function markCompleted(progress: Progress, levelId: number): Progress {
  if (progress.completed.includes(levelId)) return progress;
  return { ...progress, completed: [...progress.completed, levelId].sort((a, b) => a - b) };
}

export function markIntroSeen(progress: Progress, gate: GateType): Progress {
  if (progress.seenIntros.includes(gate)) return progress;
  return { ...progress, seenIntros: [...progress.seenIntros, gate] };
}
