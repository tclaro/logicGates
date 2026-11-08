import type { GateType, LevelDef, UltimateLevelDef } from '../core/types';
import { CAMPAIGN_STEPS, type Difficulty } from './campaign';

const modules = import.meta.glob<LevelDef>('./data/*.json', { eager: true, import: 'default' });

/** Fases com circuito pronto (fonte das fases fáceis e médias), ordenadas pelo id. */
export const LEVELS: readonly LevelDef[] = Object.values(modules).sort((a, b) => a.id - b.id);

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

const ultimateModules = import.meta.glob<UltimateLevelDef>('./ultimate/*.json', { eager: true, import: 'default' });

/** Fases de montagem (fonte das fases difíceis), ordenadas pelo id. */
export const ULTIMATE_LEVELS: readonly UltimateLevelDef[] = Object.values(ultimateModules).sort((a, b) => a.id - b.id);

export function getUltimateLevel(id: number): UltimateLevelDef | undefined {
  return ULTIMATE_LEVELS.find((l) => l.id === id);
}

/** Peças que aparecem pela primeira vez nesta fase de montagem, na ordem das próprias fases de montagem. */
export function newPiecesIn(levelId: number): GateType[] {
  const before = new Set(ULTIMATE_LEVELS.filter((l) => l.id < levelId).flatMap((l) => Object.keys(l.pieces)));
  const level = getUltimateLevel(levelId);
  return level ? (Object.keys(level.pieces) as GateType[]).filter((g) => !before.has(g)) : [];
}

export function levelFileName(id: number): string {
  return `${String(id).padStart(2, '0')}.json`;
}

/** Fase da campanha: uma fase de origem com o id e a dificuldade da sequência única. */
export interface CampaignLevel {
  id: number;
  difficulty: Difficulty;
  /** Id na pasta de origem (`data` para fácil e médio, `ultimate` para difícil). */
  source: number;
  /** Definição já com o id da campanha. */
  def: LevelDef | UltimateLevelDef;
  /** Portas que o jogador encontra na fase: as do circuito e, na difícil, as da bandeja. */
  gates: GateType[];
  /** Porta apresentada antes desta fase, se ela estreia aqui. */
  introGate?: GateType;
}

function buildCampaign(): CampaignLevel[] {
  const seen = new Set<GateType>();
  return CAMPAIGN_STEPS.map((step, i) => {
    const id = i + 1;
    const source: LevelDef | UltimateLevelDef | undefined = step.difficulty === 'hard' ? getUltimateLevel(step.source) : getLevel(step.source);
    if (!source) throw new Error(`Campanha: fase de origem ${step.difficulty} ${step.source} não existe`);
    const types = new Set<GateType>(source.gates.map((g) => g.type));
    if (step.difficulty === 'hard') for (const piece of Object.keys((source as UltimateLevelDef).pieces) as GateType[]) types.add(piece);
    const gates = [...types];
    const introGate = gates.find((g) => !seen.has(g));
    for (const g of gates) seen.add(g);
    const def = structuredClone(source);
    def.id = id;
    return { id, difficulty: step.difficulty, source: step.source, def, gates, introGate };
  });
}

/** A sequência única de fases, com fácil, médio e difícil intercalados. */
export const CAMPAIGN: readonly CampaignLevel[] = buildCampaign();

export function getCampaignLevel(id: number): CampaignLevel | undefined {
  return CAMPAIGN[id - 1];
}
