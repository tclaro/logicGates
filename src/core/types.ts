export type Bit = 0 | 1;

export type GateType = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';

export interface InputDef {
  id: string;
  initial: Bit;
}

export interface GateDef {
  id: string;
  type: GateType;
  in: string[];
}

export interface Point {
  x: number;
  y: number;
}

/** Ajustes manuais de layout salvos pelo editor. */
export interface LayoutOverrides {
  /** Ordem das chaves da esquerda para a direita. */
  order?: string[];
  /** Posição horizontal fixa (coordenadas da placa) por porta. */
  x?: Record<string, number>;
}

export interface LevelDef {
  id: number;
  inputs: InputDef[];
  gates: GateDef[];
  /** Id da porta ligada à lâmpada. */
  output: string;
  layout?: LayoutOverrides;
}

/** Peças disponíveis no modo Ultimate: quantas de cada porta. */
export type Pieces = Partial<Record<GateType, number>>;

/** Fase do modo Ultimate: as chaves são fixas e o jogador escolhe o tipo das portas marcadas como encaixe. */
export interface UltimateLevelDef extends LevelDef {
  /** Portas que começam vazias; o `type` gravado nelas é a solução de referência. */
  slots: string[];
  pieces: Pieces;
  /** Energia escondida até o jogador ativar, com 3 vidas (obrigatório com `clock`). */
  hidden?: boolean;
  /** Chave que alterna sozinha: a lâmpada precisa ficar acesa nos dois valores dela. */
  clock?: string;
}

/** Peça colocada em cada encaixe (null = vazio). */
export type SlotFill = Record<string, GateType | null>;

export type InputState = Record<string, Bit>;
export type NodeValues = Record<string, Bit>;
