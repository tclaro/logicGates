import { describe, expect, it } from 'vitest';
import { GATE_TYPES } from '../../src/core/logic';
import { availableKeys, GATE_NOTATIONS, t } from '../../src/i18n/i18n';
import { gatesInIntroOrder } from '../../src/levels/chapters';
import { gateShape, gateSvg, toSvgPath } from '../../src/render/gateShapes';
import {
  defaultProgress,
  energyCapacity,
  highestUnlocked,
  isUnlocked,
  loadProgress,
  loseLife,
  markCompleted,
  markIntroSeen,
  MAX_LIVES,
  migrateV1,
  saveProgress,
} from '../../src/storage/progress';
import { solve } from '../../src/core/solver';
import { CAMPAIGN } from '../../src/levels';
import type { UltimateLevelDef } from '../../src/core/types';
import { CAMPAIGN_STEPS } from '../../src/levels/campaign';

describe('i18n', () => {
  it('substitui parâmetros e sinaliza chaves ausentes', () => {
    expect(t('game.level', { level: 7 })).toBe('Fase 7');
    expect(t('nao.existe')).toBe('[nao.existe]');
  });

  it('todas as portas têm nome, resumo, analogia e notações', () => {
    const keys = new Set(availableKeys());
    for (const gate of GATE_TYPES) {
      for (const part of ['name', 'summary', 'analogy']) expect(keys.has(`gate.${gate}.${part}`), `gate.${gate}.${part}`).toBe(true);
      expect(GATE_NOTATIONS[gate].length).toBeGreaterThanOrEqual(3);
    }
    expect(gatesInIntroOrder()).toEqual(['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR']);
  });
});

describe('progresso', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('salva e carrega', () => {
    const store = memory();
    const p = markIntroSeen(markCompleted(defaultProgress(), 3), 'AND');
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
  });

  it('a música começa desligada, mas respeita quem já a ligou', () => {
    const store = memory();
    expect(defaultProgress().music).toBe(false);
    expect(loadProgress(store).music).toBe(false);
    store.setItem('portas-logicas:progress', JSON.stringify({ version: 2, completed: [], seenIntros: [] }));
    expect(loadProgress(store).music).toBe(false);
    saveProgress({ ...defaultProgress(), music: true }, store);
    expect(loadProgress(store).music).toBe(true);
  });

  it('volta ao padrão com storage quebrado ou dados inválidos', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadProgress(broken)).toEqual(defaultProgress());
    expect(() => saveProgress(defaultProgress(), broken)).not.toThrow();
    expect(loadProgress({ getItem: () => '{nope' })).toEqual(defaultProgress());
    expect(loadProgress({ getItem: () => '{"version":3}' })).toEqual(defaultProgress());
    expect(loadProgress({ getItem: () => '{"version":2}' })).toEqual(defaultProgress());
    expect(loadProgress(null)).toEqual(defaultProgress());
  });

  it('libera fases em sequência', () => {
    let p = defaultProgress();
    expect(highestUnlocked(p, 36)).toBe(1);
    expect(isUnlocked(p, 2, 36)).toBe(false);
    p = markCompleted(p, 1);
    expect(isUnlocked(p, 2, 36)).toBe(true);
    expect(isUnlocked(p, 3, 36)).toBe(false);
    p = markCompleted(p, 36);
    expect(highestUnlocked(p, 36)).toBe(36);
    expect(markCompleted(p, 1)).toBe(p);
  });

  it('vidas: passam de uma fase para a outra e o fim de jogo renova as 3', () => {
    let p = defaultProgress();
    expect(p.lives).toBe(MAX_LIVES);
    p = { ...p, energy: { level: 4, left: 1 } };
    let r = loseLife(p);
    expect([r.progress.lives, r.gameOver]).toEqual([2, false]);
    expect(r.progress.energy).toEqual({ level: 4, left: 1 });
    r = loseLife(loseLife(r.progress).progress);
    expect([r.progress.lives, r.gameOver, r.progress.energy]).toEqual([MAX_LIVES, true, null]);

    // Vidas e barra sobrevivem a recarregar a página; valores estranhos voltam ao padrão.
    const store = new Map<string, string>();
    saveProgress({ ...defaultProgress(), lives: 1, energy: { level: 7, left: 2 } }, { setItem: (k, v) => store.set(k, v) });
    const loaded = loadProgress({ getItem: (k) => store.get(k) ?? null });
    expect([loaded.lives, loaded.energy]).toEqual([1, { level: 7, left: 2 }]);
    for (const lives of [0, -1, 4, 1.5, 'x']) {
      const raw = JSON.stringify({ version: 2, completed: [], seenIntros: [], lives, energy: { level: 'a', left: 1 } });
      expect(loadProgress({ getItem: () => raw })).toMatchObject({ lives: MAX_LIVES, energy: null });
    }
  });

  it('barra de energia: 50% acima do mínimo de cliques, arredondando para cima', () => {
    expect([1, 2, 3, 4, 5, 7].map(energyCapacity)).toEqual([2, 3, 5, 6, 8, 11]);
    // Difíceis sem "Ativar" usam a barra por peça encaixada: 1, 2 e 3 encaixes → 2, 3 e 5 jogadas.
    const visibleHard = CAMPAIGN.filter((l) => l.difficulty === 'hard' && !(l.def as UltimateLevelDef).hidden);
    expect(visibleHard.map((l) => [l.id, energyCapacity((l.def as UltimateLevelDef).slots.length)])).toEqual([
      [6, 2],
      [8, 3],
      [11, 5],
    ]);
    for (const level of CAMPAIGN.filter((l) => l.difficulty === 'easy')) {
      const min = solve(level.def).minClicks;
      expect(min, `fase ${level.id}`).toBeGreaterThanOrEqual(1);
      expect(energyCapacity(min), `fase ${level.id}`).toBeGreaterThan(min);
    }
  });

  it('progresso dos três modos antigos vira progresso da campanha', () => {
    const steps = [
      { difficulty: 'easy', source: 1 },
      { difficulty: 'medium', source: 3 },
      { difficulty: 'hard', source: 1 },
      { difficulty: 'easy', source: 2 },
      { difficulty: 'medium', source: 5 },
      { difficulty: 'hard', source: 2 },
    ] as const;
    // Modo normal até a 2, Expert vencido até a 4 (em sequência), Ultimate só a 2.
    expect(migrateV1({ version: 1, completed: [1, 2], expertBest: 4, ultimateCompleted: [2] }, steps)).toEqual([1, 2, 4, 6]);
    expect(migrateV1({ version: 1 }, steps)).toEqual([]);
    expect(migrateV1({ version: 1, completed: 'x', expertBest: 'y', ultimateCompleted: null }, steps)).toEqual([]);

    // Pela campanha real: quem só jogou o modo normal inteiro continua na primeira fase média.
    const old = JSON.stringify({ version: 1, completed: Array.from({ length: 36 }, (_, i) => i + 1), seenIntros: ['AND'], sound: false, music: true, expertBest: 0, expertPlayed: true, ultimateCompleted: [] });
    const p = loadProgress({ getItem: () => old });
    expect(p.version).toBe(2);
    expect(p.seenIntros).toEqual(['AND']);
    expect([p.sound, p.music]).toEqual([false, true]);
    expect(p.completed).toEqual(CAMPAIGN_STEPS.flatMap((s, i) => (s.difficulty === 'easy' ? [i + 1] : [])));
    expect(Math.min(...CAMPAIGN_STEPS.map((s, i) => (s.difficulty === 'easy' ? Infinity : i + 1)))).toBe(3);
    expect(p).not.toHaveProperty('expertBest');
  });
});

describe('símbolos das portas', () => {
  it('portas negadas têm bolinha e XOR/XNOR têm a curva dupla', () => {
    for (const gate of GATE_TYPES) {
      const s = gateShape(gate);
      expect(s.bubble !== null, gate).toBe(['NOT', 'NAND', 'NOR', 'XNOR'].includes(gate));
      expect(s.extras.length, gate).toBe(gate === 'XOR' || gate === 'XNOR' ? 1 : 0);
      expect(s.stubs.length, gate).toBe(gate === 'NOT' ? 2 : 3);
    }
  });

  it('gera SVG válido', () => {
    expect(toSvgPath(gateShape('AND').body)).toMatch(/^M-50 40 L-50 0 A50 50 0 0 1 50 0 L50 40 Z$/);
    const svg = gateSvg('XNOR');
    expect(svg).toContain('<circle');
    expect(svg).toContain('>XNOR</text>');
  });
});
