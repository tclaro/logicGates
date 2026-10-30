import { Assets, Texture } from 'pixi.js';
import { glowTexture, lampCanvas, lampTexture } from './textures';

/** Sprites que o jogo procura em public/assets/sprites; os ausentes usam a arte provisória. */
export const SPRITE_FILES = {
  board: 'board.png',
  lampOff: 'lamp_off.png',
  lampOn: 'lamp_on.png',
  switch0: 'switch_0.png',
  switch1: 'switch_1.png',
} as const;

export interface GameTextures {
  /** Textura emendável da placa enviada pelo usuário, se houver. */
  board: Texture | null;
  lampOff: Texture;
  lampOn: Texture;
  switch0: Texture | null;
  switch1: Texture | null;
  glow: Texture;
}

export function spriteUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/sprites/${file}`;
}

/** Carrega um sprite só se ele existir e for imagem (o servidor pode devolver HTML para caminhos ausentes). */
async function tryLoad(file: string): Promise<Texture | null> {
  const url = spriteUrl(file);
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || !(head.headers.get('content-type') ?? '').startsWith('image/')) return null;
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
}

let lampUrls: Promise<{ off: string; on: string }> | null = null;

/** URLs da lâmpada para as telas HTML: o sprite do usuário ou a arte provisória. */
export function lampImageUrls(): Promise<{ off: string; on: string }> {
  lampUrls ??= (async () => {
    const pick = async (file: string, on: boolean) => {
      try {
        const res = await fetch(spriteUrl(file), { method: 'HEAD' });
        if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) return spriteUrl(file);
      } catch {
        // usa a provisória
      }
      return lampCanvas(on).toDataURL('image/png');
    };
    const [off, on] = await Promise.all([pick(SPRITE_FILES.lampOff, false), pick(SPRITE_FILES.lampOn, true)]);
    return { off, on };
  })();
  return lampUrls;
}

let cached: Promise<GameTextures> | null = null;

export function loadTextures(): Promise<GameTextures> {
  cached ??= (async () => {
    const [board, lampOff, lampOn, switch0, switch1] = await Promise.all([
      tryLoad(SPRITE_FILES.board),
      tryLoad(SPRITE_FILES.lampOff),
      tryLoad(SPRITE_FILES.lampOn),
      tryLoad(SPRITE_FILES.switch0),
      tryLoad(SPRITE_FILES.switch1),
    ]);
    const bothSwitches = switch0 && switch1;
    return {
      board,
      lampOff: lampOff ?? lampTexture(false),
      lampOn: lampOn ?? lampTexture(true),
      switch0: bothSwitches ? switch0 : null,
      switch1: bothSwitches ? switch1 : null,
      glow: glowTexture(),
    };
  })();
  return cached;
}
