import type { GateType } from '../core/types';
import ptBR from './pt-BR.json';

export type Messages = Record<string, string>;

const catalogs: Record<string, Messages> = { 'pt-BR': ptBR };
let current: Messages = ptBR;

export function setLocale(locale: string): void {
  current = catalogs[locale] ?? ptBR;
}

export function availableKeys(): string[] {
  return Object.keys(ptBR);
}

/** Texto traduzido; `{nome}` é substituído pelos parâmetros. Chaves ausentes aparecem entre colchetes. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = current[key] ?? ptBR[key as keyof typeof ptBR];
  if (template === undefined) return `[${key}]`;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Como cada porta aparece em matemática e em programação (não traduzível). */
export const GATE_NOTATIONS: Record<GateType, string[]> = {
  AND: ['A · B', 'A ∧ B', 'A && B', 'A & B', 'A and B'],
  OR: ['A + B', 'A ∨ B', 'A || B', 'A | B', 'A or B'],
  NOT: ['¬A', '!A', 'Ā', '~A', 'not A'],
  NAND: ['¬(A ∧ B)', 'A ↑ B', '!(A && B)', '~(A & B)'],
  NOR: ['¬(A ∨ B)', 'A ↓ B', '!(A || B)', '~(A | B)'],
  XOR: ['A ⊕ B', 'A ^ B', 'A != B', 'A xor B'],
  XNOR: ['¬(A ⊕ B)', 'A ⊙ B', 'A == B', '~(A ^ B)'],
};
