import { Howl, Howler } from 'howler';

export type SoundName = 'switch_on' | 'switch_off' | 'energize' | 'lamp_on' | 'win' | 'ui_click' | 'burn' | 'game_over';
const SOUNDS: SoundName[] = ['switch_on', 'switch_off', 'energize', 'lamp_on', 'win', 'ui_click', 'burn', 'game_over'];

/** Ganho acima de 1 para efeitos que soam baixos; o Howler não passa de 1, então eles tocam pelo Web Audio. */
const BOOST: Partial<Record<SoundName, number>> = { energize: 1.4 };

function audioUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/audio/${name}.mp3`;
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('audio/');
  } catch {
    return false;
  }
}

/**
 * Efeitos em public/assets/audio/<nome>.mp3 e música em music.mp3.
 * Enquanto um arquivo não existir, o efeito é sintetizado com Web Audio.
 */
export class AudioManager {
  private readonly howls = new Map<SoundName, Howl>();
  private readonly boosted = new Map<SoundName, { data: ArrayBuffer; buffer?: Promise<AudioBuffer> }>();
  private music: Howl | null = null;
  private ctx: AudioContext | null = null;
  private unlockAt = -Infinity;
  soundOn = true;
  private musicOn = true;

  async load(): Promise<void> {
    await Promise.all(
      SOUNDS.map(async (name) => {
        if (!(await exists(audioUrl(name)))) return;
        if (BOOST[name]) {
          const res = await fetch(audioUrl(name)).catch(() => null);
          if (res?.ok) this.boosted.set(name, { data: await res.arrayBuffer() });
        } else this.howls.set(name, new Howl({ src: [audioUrl(name)], preload: true }));
      }),
    );
    if (await exists(audioUrl('music'))) {
      this.music = new Howl({ src: [audioUrl('music')], loop: true, volume: 0.2, html5: true });
      if (this.musicOn) this.startMusic();
    }
  }

  setSound(on: boolean): void {
    this.soundOn = on;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.music?.pause();
  }

  /**
   * Navegadores só liberam áudio dentro de um gesto do usuário. Num toque de tela,
   * o gesto vale quando o dedo sai (pointerup/touchend/click), não no pointerdown.
   * Os ouvintes continuam ativos até o áudio realmente começar a rodar e, se o
   * sistema suspender o áudio (troca de app, tela bloqueada), voltam a funcionar.
   */
  installUnlock(target: Window = window): void {
    const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
    const onGesture = () => this.unlock();
    for (const e of events) target.addEventListener(e, onGesture, { capture: true, passive: true });
    target.document.addEventListener('visibilitychange', () => {
      if (target.document.visibilityState === 'visible') this.unlock();
    });
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  unlock(): void {
    this.unlockAt = performance.now();
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') {
        void this.ctx.resume().catch(() => {});
        // Um som mudo tocado dentro do gesto completa o desbloqueio em alguns navegadores móveis.
        const silent = this.ctx.createBufferSource();
        silent.buffer = this.ctx.createBuffer(1, 1, 22050);
        silent.connect(this.ctx.destination);
        silent.start(0);
      }
    } catch {
      this.ctx = null;
    }
    if (Howler.ctx && Howler.ctx.state !== 'running') void Howler.ctx.resume().catch(() => {});
    if (this.musicOn) this.startMusic();
  }

  private startMusic(): void {
    if (this.music && !this.music.playing()) this.music.play();
  }

  play(name: SoundName): void {
    if (!this.soundOn) return;
    const howl = this.howls.get(name);
    if (howl) {
      howl.play();
      return;
    }
    if (this.boosted.has(name)) {
      this.playBoosted(name);
      return;
    }
    this.synth(name);
  }

  /**
   * Logo após um gesto o contexto ainda está retomando: o som agendado toca assim que ele rodar.
   * Fora disso, um contexto parado descarta o som (senão vários tocariam juntos depois).
   */
  private canPlay(ctx: AudioContext): boolean {
    const resuming = ctx.state === 'suspended' && performance.now() - this.unlockAt < 400;
    return ctx.state === 'running' || resuming;
  }

  private playBoosted(name: SoundName): void {
    const ctx = this.ctx;
    const entry = this.boosted.get(name)!;
    if (!ctx || !this.canPlay(ctx)) return;
    entry.buffer ??= ctx.decodeAudioData(entry.data.slice(0));
    void entry.buffer
      .then((buffer) => {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buffer;
        gain.gain.value = BOOST[name] ?? 1;
        src.connect(gain).connect(ctx.destination);
        src.start();
      })
      .catch(() => {});
  }

  private synth(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.canPlay(ctx)) return;
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur);
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(gain, now + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };
    switch (name) {
      case 'switch_on':
        tone(1400, 0, 0.04, 'square', 0.05);
        tone(900, 0.012, 0.05, 'triangle', 0.06);
        break;
      case 'switch_off':
        tone(1100, 0, 0.04, 'square', 0.05);
        tone(520, 0.012, 0.05, 'triangle', 0.06);
        break;
      case 'energize':
        tone(220, 0, 0.18, 'sawtooth', 0.025, 660);
        break;
      case 'lamp_on':
        tone(880, 0, 0.35, 'sine', 0.09);
        tone(1320, 0.07, 0.4, 'sine', 0.06);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.09));
        break;
      case 'ui_click':
        tone(620, 0, 0.03, 'sine', 0.05);
        break;
      case 'burn':
        tone(2400, 0, 0.05, 'square', 0.05, 900);
        tone(180, 0.04, 0.3, 'sawtooth', 0.06, 60);
        break;
      case 'game_over':
        [392, 329.63, 261.63, 196].forEach((f, i) => tone(f, i * 0.18, 0.4, 'triangle', 0.08));
        break;
    }
  }
}

export const audio = new AudioManager();
