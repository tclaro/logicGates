import { describe, expect, it } from 'vitest';
import { GATE_TYPES } from '../../src/core/logic';
import { availableKeys, GATE_NOTATIONS, t } from '../../src/i18n/i18n';
import { chapterStart, gatesInIntroOrder } from '../../src/levels/chapters';
import { gateShape, gateSvg, toSvgPath } from '../../src/render/gateShapes';
import {
  defaultProgress,
  EXPERT_UNLOCK_LEVEL,
  isExpertUnlocked,
  recordExpert,
  highestUnlocked,
  isUnlocked,
  loadProgress,
  markCompleted,
  markIntroSeen,
  saveProgress,
} from '../../src/storage/progress';

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
    store.setItem('portas-logicas:progress', JSON.stringify({ version: 1, completed: [], seenIntros: [] }));
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

  it('modo Expert: libera ao concluir a fase 10 e guarda o recorde', () => {
    let p = defaultProgress();
    expect(p.expertBest).toBe(0);
    for (let id = 1; id < EXPERT_UNLOCK_LEVEL; id++) p = markCompleted(p, id);
    expect(isExpertUnlocked(p)).toBe(false);
    p = markCompleted(p, EXPERT_UNLOCK_LEVEL);
    expect(isExpertUnlocked(p)).toBe(true);
    p = recordExpert(p, 5);
    expect(recordExpert(p, 3)).toBe(p);
    expect(recordExpert(p, 7).expertBest).toBe(7);
    // Progresso salvo antes do modo Expert existir continua válido.
    const old = JSON.stringify({ version: 1, completed: [1], seenIntros: [], sound: true, music: true });
    expect(loadProgress({ getItem: () => old }).expertBest).toBe(0);
  });

  it('modo Expert: o fim de jogo volta ao início do capítulo', () => {
    expect([1, 2, 3, 5, 6, 10, 11, 15, 16, 20, 21, 26, 27, 36].map(chapterStart)).toEqual([1, 2, 2, 2, 6, 6, 11, 11, 16, 16, 21, 21, 27, 27]);
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
