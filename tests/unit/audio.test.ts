import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../src/audio/AudioManager';

/**
 * Contexto de áudio falso que segue a regra dos navegadores móveis:
 * resume() só funciona se for chamado durante um gesto aceito.
 */
let inGesture = false;
const contexts: FakeContext[] = [];

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators = 0;
  gains: number[] = [];
  started = 0;
  constructor() {
    contexts.push(this);
  }
  resume(): Promise<void> {
    if (inGesture) this.state = 'running';
    return Promise.resolve();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    const node = { buffer: null, connect: (next: unknown) => next ?? node, start: () => this.started++ };
    return node;
  }
  decodeAudioData(): Promise<object> {
    return Promise.resolve({});
  }
  createOscillator() {
    this.oscillators++;
    const node = { type: '', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => node, start: () => {}, stop: () => {} };
    return node;
  }
  createGain() {
    const node = {
      gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {
        this.gains.push(node.gain.value);
        return node;
      },
    };
    return node;
  }
}

function fakeWindow() {
  const listeners = new Map<string, (() => void)[]>();
  const docListeners = new Map<string, (() => void)[]>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: () => void) => docListeners.set(type, [...(docListeners.get(type) ?? []), fn]),
  };
  const win = {
    document: doc,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
  };
  /** Dispara um evento; `gesture` diz se o navegador o considera um gesto do usuário. */
  const fire = (type: string, gesture: boolean) => {
    inGesture = gesture;
    for (const fn of listeners.get(type) ?? []) fn();
    inGesture = false;
  };
  const fireVisibility = (gesture: boolean) => {
    inGesture = gesture;
    for (const fn of docListeners.get('visibilitychange') ?? []) fn();
    inGesture = false;
  };
  return { win: win as unknown as Window, fire, fireVisibility, listeners };
}

describe('desbloqueio do áudio', () => {
  beforeEach(() => {
    contexts.length = 0;
    vi.stubGlobal('AudioContext', FakeContext);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('não escuta pointerdown, que num toque de tela não conta como gesto', () => {
    const { win, listeners } = fakeWindow();
    new AudioManager().installUnlock(win);
    expect(listeners.has('pointerdown')).toBe(false);
    expect([...listeners.keys()].sort()).toEqual(['click', 'keydown', 'pointerup', 'touchend']);
  });

  it('libera no toque e continua tentando se a primeira tentativa falhar', () => {
    const { win, fire } = fakeWindow();
    const audio = new AudioManager();
    audio.installUnlock(win);
    fire('pointerup', false); // o navegador ainda não aceitou o gesto
    expect(audio.running).toBe(false);
    fire('touchend', true);
    expect(audio.running).toBe(true);
    expect(contexts).toHaveLength(1);
  });

  it('volta a liberar depois de o sistema suspender o áudio', () => {
    const { win, fire, fireVisibility } = fakeWindow();
    const audio = new AudioManager();
    audio.installUnlock(win);
    fire('click', true);
    contexts[0]!.state = 'suspended'; // app foi para segundo plano
    fireVisibility(true);
    expect(audio.running).toBe(true);
    contexts[0]!.state = 'suspended';
    fire('pointerup', true);
    expect(audio.running).toBe(true);
  });

  it('o clique do botão que libera o áudio já toca; sons com o áudio parado são descartados', () => {
    const { win, fire } = fakeWindow();
    const audio = new AudioManager();
    audio.installUnlock(win);
    fire('click', false);
    // logo após a tentativa de liberar, o som é agendado (toca quando o contexto rodar)
    audio.play('ui_click');
    const ctx = contexts[0]!;
    expect(ctx.oscillators).toBe(1);
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 5000);
    audio.play('lamp_on');
    expect(ctx.oscillators).toBe(1);
    vi.restoreAllMocks();
    fire('click', true);
    audio.play('lamp_on');
    expect(ctx.oscillators).toBe(3);
  });

  it('respeita o som desligado', () => {
    const { win, fire } = fakeWindow();
    const audio = new AudioManager();
    audio.installUnlock(win);
    fire('click', true);
    audio.setSound(false);
    audio.play('win');
    expect(contexts[0]!.oscillators).toBe(0);
  });

  it('o som do Ativar toca 40% mais alto pelo Web Audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/energize.mp3')
          ? { ok: true, headers: new Headers({ 'content-type': 'audio/mpeg' }), arrayBuffer: async () => new ArrayBuffer(8) }
          : { ok: false, headers: new Headers() },
      ),
    );
    const { win, fire } = fakeWindow();
    const audio = new AudioManager();
    await audio.load();
    audio.installUnlock(win);
    fire('click', true);
    const ctx = contexts[0]!;
    const silentStarts = ctx.started;
    audio.play('energize');
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.oscillators).toBe(0);
    expect(ctx.started).toBe(silentStarts + 1);
    expect(ctx.gains).toEqual([1.4]);
  });
});
