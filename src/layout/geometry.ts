/** Dimensões em coordenadas lógicas da placa (retrato 9:16). */
export const BOARD_W = 900;
export const BOARD_H = 1600;

export const LAMP_X = BOARD_W / 2;
export const LAMP_Y = 190;
export const LAMP_SIZE = 230;
/** Ponto onde a trilha encontra a lâmpada. */
export const LAMP_PIN_Y = 318;

export const SWITCH_Y = 1478;
export const SWITCH_W = 92;
export const SWITCH_H = 118;
export const SWITCH_PIN_Y = SWITCH_Y - SWITCH_H / 2 - 18;
export const SWITCH_MAX_SPACING = 190;

export const GATE_W = 100;
export const GATE_BODY_H = 96;
/** Distância do centro da porta até a ponta de cada pino. */
export const GATE_PIN_REACH = 72;
export const GATE_PIN_OFFSET = 25;

export const GATE_LAYER_TOP = 445;
export const GATE_LAYER_BOTTOM = 1272;
export const GATE_LAYER_MAX_SPACING = 270;

export const SIDE_MARGIN = 64;
/** Meia-largura ocupada por uma porta ao separar nós da mesma camada. */
export const GATE_HALF_SPAN = 76;
/** Meia-largura ocupada por uma trilha que atravessa uma camada. */
export const TRACE_HALF_SPAN = 13;
