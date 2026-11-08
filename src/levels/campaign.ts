/**
 * Dificuldade de uma fase da campanha:
 * - fácil: circuito pronto e energia visível;
 * - médio: circuito pronto, energia escondida até "Ativar" e 3 vidas;
 * - difícil: chaves fixas e o jogador monta o circuito com as peças.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CampaignStep {
  difficulty: Difficulty;
  /** Fase de origem: em `levels/data` para fácil e médio, em `levels/ultimate` para difícil. */
  source: number;
}

const easy = (source: number): CampaignStep => ({ difficulty: 'easy', source });
const medium = (source: number): CampaignStep => ({ difficulty: 'medium', source });
const hard = (source: number): CampaignStep => ({ difficulty: 'hard', source });

/**
 * Ordem da campanha. Cada fase de origem aparece uma única vez; as portas novas
 * são apresentadas sempre numa fase fácil, e as difíceis nunca vêm em sequência.
 */
export const CAMPAIGN_STEPS: readonly CampaignStep[] = [
  // AND e OR
  easy(1),
  easy(2),
  medium(3),
  // NOT
  easy(6),
  medium(7),
  hard(1),
  easy(4),
  hard(2),
  easy(8),
  medium(5),
  hard(3),
  easy(9),
  hard(4),
  medium(10),
  hard(5),
  // NAND
  easy(11),
  medium(12),
  hard(6),
  easy(13),
  hard(8),
  medium(14),
  hard(7),
  easy(15),
  hard(9),
  // NOR
  easy(16),
  medium(17),
  easy(18),
  hard(10),
  medium(19),
  easy(20),
  hard(11),
  // XOR
  easy(21),
  medium(22),
  hard(12),
  easy(23),
  medium(24),
  hard(13),
  easy(25),
  medium(26),
  // XNOR
  easy(27),
  medium(28),
  hard(14),
  easy(29),
  medium(30),
  easy(31),
  medium(32),
  easy(33),
  medium(34),
  easy(35),
  medium(36),
  hard(15),
];
