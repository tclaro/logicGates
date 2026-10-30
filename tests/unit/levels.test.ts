import { afterAll, describe, expect, it } from 'vitest';
import { validateLevel, type LevelStats } from '../../src/core/validator';
import { allowedGatesFor, GATE_INTRO_LEVEL, introGateFor } from '../../src/levels/chapters';
import { LEVELS } from '../../src/levels';
import { layoutLevel } from '../../src/layout/autoLayout';
import { checkLayout } from './layoutChecks';

const statsById = new Map<number, LevelStats & { crossings: number }>();

describe('fases', () => {
  it('existem 36 fases com ids 1..36', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  for (const level of LEVELS) {
    it(`fase ${level.id} é válida e tem layout limpo`, () => {
      const result = validateLevel(level, { allowedGates: allowedGatesFor(level.id) });
      expect(result.errors).toEqual([]);
      const report = checkLayout(layoutLevel(level));
      expect(report.problems).toEqual([]);
      statsById.set(level.id, { ...result.stats!, crossings: report.crossings });
    });
  }

  it('cada fase de introdução usa a porta nova', () => {
    for (const [gate, id] of Object.entries(GATE_INTRO_LEVEL)) {
      const level = LEVELS.find((l) => l.id === id)!;
      expect(level.gates.some((g) => g.type === gate), `fase ${id} deveria usar ${gate}`).toBe(true);
      expect(introGateFor(id)).toBe(gate);
    }
  });

  it('fases de introdução usam apenas a porta nova', () => {
    for (const [gate, id] of Object.entries(GATE_INTRO_LEVEL)) {
      const level = LEVELS.find((l) => l.id === id)!;
      expect(new Set(level.gates.map((g) => g.type))).toEqual(new Set([gate]));
    }
  });

  it('a dificuldade não despenca dentro de cada bloco de fases', () => {
    const starts = Object.values(GATE_INTRO_LEVEL).sort((a, b) => a - b);
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const cur = statsById.get(i + 1)!;
      const next = statsById.get(i + 2)!;
      if (starts.includes(i + 2)) continue; // a introdução de uma porta nova recomeça simples
      const size = (s: LevelStats) => s.gates + s.inputs;
      expect(size(next), `fase ${i + 2} menor que a ${i + 1}`).toBeGreaterThanOrEqual(size(cur) - 1);
      expect(next.minClicks, `fase ${i + 2} mais fácil que a ${i + 1}`).toBeGreaterThanOrEqual(cur.minClicks - 1);
    }
  });
});

afterAll(() => {
  if (process.env.LEVEL_REPORT) console.table(Object.fromEntries([...statsById].sort((a, b) => a[0] - b[0])));
});
