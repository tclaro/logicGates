import { describe, expect, it } from 'vitest';
import type { GateType } from '../../src/core/types';
import { CAMPAIGN, LEVELS, ULTIMATE_LEVELS } from '../../src/levels';
import { CAMPAIGN_STEPS } from '../../src/levels/campaign';
import { t } from '../../src/i18n/i18n';

const ids = (d: string) => CAMPAIGN.filter((l) => l.difficulty === d).map((l) => l.source);

describe('campanha', () => {
  it('ids em sequência a partir de 1, com a definição usando o id da campanha', () => {
    expect(CAMPAIGN.map((l) => l.id)).toEqual(CAMPAIGN.map((_, i) => i + 1));
    for (const level of CAMPAIGN) expect(level.def.id).toBe(level.id);
    expect(CAMPAIGN.length).toBe(CAMPAIGN_STEPS.length);
  });

  it('usa cada fase de origem exatamente uma vez', () => {
    const classic = [...ids('easy'), ...ids('medium')].sort((a, b) => a - b);
    expect(classic).toEqual(LEVELS.map((l) => l.id));
    expect(ids('hard').sort((a, b) => a - b)).toEqual(ULTIMATE_LEVELS.map((l) => l.id));
  });

  it('não altera as fases de origem', () => {
    for (const level of CAMPAIGN) {
      const source = level.difficulty === 'hard' ? ULTIMATE_LEVELS[level.source - 1]! : LEVELS[level.source - 1]!;
      expect(source.id).toBe(level.source);
      expect({ ...level.def, id: source.id }).toEqual(source);
    }
  });

  it('começa como combinado: AND e OR fáceis, uma média, NOT fácil, uma média e uma difícil', () => {
    expect(CAMPAIGN.slice(0, 6).map((l) => [l.difficulty, l.introGate ?? null])).toEqual([
      ['easy', 'AND'],
      ['easy', 'OR'],
      ['medium', null],
      ['easy', 'NOT'],
      ['medium', null],
      ['hard', null],
    ]);
  });

  it('apresenta cada porta uma vez, numa fase fácil que só usa a porta nova', () => {
    const intros = CAMPAIGN.filter((l) => l.introGate);
    expect(intros.map((l) => l.introGate)).toEqual(['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR']);
    for (const level of intros) {
      expect(level.difficulty, `fase ${level.id}`).toBe('easy');
      expect(level.gates, `fase ${level.id}`).toEqual([level.introGate]);
    }
  });

  it('nenhuma fase usa porta ainda não apresentada', () => {
    const seen = new Set<GateType>();
    for (const level of CAMPAIGN) {
      if (level.introGate) seen.add(level.introGate);
      for (const gate of level.gates) expect(seen.has(gate), `fase ${level.id} usa ${gate}`).toBe(true);
    }
  });

  it('intercala as dificuldades: nunca duas difíceis seguidas nem três iguais seguidas', () => {
    for (let i = 1; i < CAMPAIGN.length; i++) {
      const [a, b] = [CAMPAIGN[i - 1]!.difficulty, CAMPAIGN[i]!.difficulty];
      expect(a === 'hard' && b === 'hard', `fases ${i} e ${i + 1}`).toBe(false);
      if (i >= 2) expect(CAMPAIGN[i - 2]!.difficulty === a && a === b, `fases ${i - 1} a ${i + 1}`).toBe(false);
    }
  });

  it('dentro de cada dificuldade, as fases de origem seguem quase em ordem', () => {
    // Recuos de até 2 são aceitos (ex.: o NOT estreia antes da fase clássica 4), mas nada salta muito à frente.
    for (const d of ['easy', 'medium', 'hard']) {
      const order = ids(d);
      for (let i = 1; i < order.length; i++) expect(order[i]!, `${d}: ${order.join(',')}`).toBeGreaterThanOrEqual(order[i - 1]! - 2);
    }
  });

  it('a primeira difícil mostra a energia, e só há chave automática depois da primeira difícil escondida', () => {
    const hard = CAMPAIGN.filter((l) => l.difficulty === 'hard').map((l) => ULTIMATE_LEVELS[l.source - 1]!);
    expect(hard[0]!.hidden).toBeFalsy();
    const firstHidden = hard.findIndex((l) => l.hidden);
    const firstClock = hard.findIndex((l) => l.clock);
    expect(firstHidden).toBeGreaterThan(0);
    expect(firstClock).toBeGreaterThan(firstHidden);
  });

  it('as dicas caem nas fases que estreiam cada novidade', () => {
    const first = (pred: (l: (typeof CAMPAIGN)[number]) => boolean) => CAMPAIGN.find(pred)!.id;
    const hardDef = (l: (typeof CAMPAIGN)[number]) => ULTIMATE_LEVELS[l.source - 1]!;
    const tips = {
      medium: first((l) => l.difficulty === 'medium'),
      hard: first((l) => l.difficulty === 'hard'),
      hardHidden: first((l) => l.difficulty === 'hard' && !!hardDef(l).hidden),
      clock: first((l) => l.difficulty === 'hard' && !!hardDef(l).clock),
    };
    expect(t(`game.tip.${tips.medium}`)).toMatch(/Ativar/);
    expect(t(`game.tip.${tips.hard}`)).toMatch(/encaixe/);
    expect(t(`game.tip.${tips.hardHidden}`)).toMatch(/Ativar/);
    expect(t(`game.tip.${tips.clock}`)).toMatch(/relógio/);
  });
});
