import { Howl, Howler } from 'howler';

export type SoundName = 'switch' | 'energize' | 'lamp_on' | 'win' | 'ui_click';
const SOUNDS: SoundName[] = ['switch', 'energize', 'lamp_on', 'win', 'ui_click'];

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
  private music: Howl | null = null;
  private ctx: AudioContext | null = null;
  soundOn = true;
  private musicOn = true;

  async load(): Promise<void> {
    await Promise.all(
      SOUNDS.map(async (name) => {
        if (await exists(audioUrl(name))) this.howls.set(name, new Howl({ src: [audioUrl(name)], preload: true }));
      }),
    );
    if (await exists(audioUrl('music'))) {
      this.music = new Howl({ src: [audioUrl('music')], loop: true, volume: 0.35, html5: true });
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

  /** Navegadores só liberam áudio depois de um gesto do usuário. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    if (Howler.ctx?.state === 'suspended') void Howler.ctx.resume();
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
    this.synth(name);
  }

  private synth(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
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
      case 'switch':
        tone(1400, 0, 0.04, 'square', 0.05);
        tone(700, 0.012, 0.05, 'triangle', 0.06);
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
    }
  }
}

export const audio = new AudioManager();
