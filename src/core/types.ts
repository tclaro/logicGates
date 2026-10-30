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

export type InputState = Record<string, Bit>;
export type NodeValues = Record<string, Bit>;
