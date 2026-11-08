import type { GateType } from '../core/types';
import { CAMPAIGN_STEPS, type CampaignStep } from '../levels/campaign';

export interface Progress {
  version: 2;
  /** Fases da campanha concluídas. */
  completed: number[];
  /** Portas cuja introdução já foi vista. */
  seenIntros: GateType[];
  sound: boolean;
  music: boolean;
  /** Lâmpadas de vida: valem para a campanha inteira e só se renovam no fim de jogo. */
  lives: number;
  /** Fase com barra de energia em andamento: quanto resta dela (sair e voltar não a enche). */
  energy: { level: number; left: number } | null;
}

/** Lâmpadas de vida de uma partida nova ou depois do fim de jogo. */
export const MAX_LIVES = 3;

/** Formato salvo enquanto o jogo tinha três modos separados. */
interface ProgressV1 {
  version: 1;
  /** Modo normal: fases concluídas. */
  completed?: unknown;
  /** Modo Expert: maior fase vencida (as fases eram jogadas em sequência). */
  expertBest?: unknown;
  /** Modo Ultimate: fases concluídas. */
  ultimateCompleted?: unknown;
}

const KEY = 'portas-logicas:progress';

export function defaultProgress(): Progress {
  return { version: 2, completed: [], seenIntros: [], sound: true, music: false, lives: MAX_LIVES, energy: null };
}

const integers = (value: unknown): number[] => (Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)) : []);

/**
 * Converte o progresso dos três modos antigos para a campanha: uma fase conta como
 * concluída se a fase de origem foi vencida no modo que corresponde à dificuldade dela.
 */
export function migrateV1(data: ProgressV1, steps: readonly CampaignStep[] = CAMPAIGN_STEPS): number[] {
  const normal = new Set(integers(data.completed));
  const expertBest = Number.isInteger(data.expertBest) ? (data.expertBest as number) : 0;
  const ultimate = new Set(integers(data.ultimateCompleted));
  const done: number[] = [];
  steps.forEach((step, i) => {
    const won = step.difficulty === 'easy' ? normal.has(step.source) : step.difficulty === 'medium' ? step.source <= expertBest : ultimate.has(step.source);
    if (won) done.push(i + 1);
  });
  return done;
}

/** Lê o progresso salvo; qualquer problema (storage bloqueado, JSON inválido) volta ao padrão. */
export function loadProgress(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return defaultProgress();
    const data = JSON.parse(raw) as Partial<Omit<Progress, 'version'>> & { version?: unknown };
    if (data.version !== 1 && data.version !== 2) return defaultProgress();
    return {
      version: 2,
      completed: data.version === 1 ? migrateV1(data as ProgressV1) : integers(data.completed),
      seenIntros: Array.isArray(data.seenIntros) ? data.seenIntros : [],
      sound: data.sound !== false,
      music: data.music === true,
      lives: Number.isInteger(data.lives) && data.lives! >= 1 && data.lives! <= MAX_LIVES ? data.lives! : MAX_LIVES,
      energy: validEnergy(data.energy),
    };
  } catch {
    return defaultProgress();
  }
}

function validEnergy(value: unknown): Progress['energy'] {
  if (typeof value !== 'object' || value === null) return null;
  const { level, left } = value as Record<string, unknown>;
  return Number.isInteger(level) && Number.isInteger(left) && (left as number) >= 0 ? { level: level as number, left: left as number } : null;
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

/** Perde uma lâmpada; a última leva ao fim de jogo, que renova as 3 e zera a barra guardada. */
export function loseLife(progress: Progress): { progress: Progress; gameOver: boolean } {
  const lives = progress.lives - 1;
  if (lives <= 0) return { progress: { ...progress, lives: MAX_LIVES, energy: null }, gameOver: true };
  return { progress: { ...progress, lives }, gameOver: false };
}

/**
 * Barra de energia: 50% a mais que o mínimo de jogadas, arredondando para cima.
 * Na fase fácil a jogada é um toque numa chave; na difícil sem "Ativar", uma peça
 * encaixada (o mínimo é o número de encaixes). Ex.: mínimo 3 → 5 jogadas.
 */
export function energyCapacity(minMoves: number): number {
  return Math.ceil(minMoves * 1.5);
}

export function markIntroSeen(progress: Progress, gate: GateType): Progress {
  if (progress.seenIntros.includes(gate)) return progress;
  return { ...progress, seenIntros: [...progress.seenIntros, gate] };
}
