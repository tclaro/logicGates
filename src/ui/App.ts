import { audio } from '../audio/AudioManager';
import type { Bit, GateType, UltimateLevelDef } from '../core/types';
import { CAMPAIGN, getCampaignLevel } from '../levels';
import type { Stage } from '../render/Stage';
import { solve } from '../core/solver';
import {
  energyCapacity,
  highestUnlocked,
  isUnlocked,
  loadProgress,
  loseLife,
  markCompleted,
  markIntroSeen,
  saveProgress,
  type Progress,
} from '../storage/progress';
import { GameScreen, type GameHooks } from './screens/GameScreen';
import { GlossaryScreen } from './screens/GlossaryScreen';
import { IntroScreen } from './screens/IntroScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { MenuScreen } from './screens/MenuScreen';
import type { Screen } from './screens/Screen';

/** Som da chave: um para ligar, outro para desligar. */
const toggleSound = (value: Bit) => audio.play(value ? 'switch_on' : 'switch_off');

/** Navegação entre telas e regras de progresso. */
export class App {
  progress: Progress = loadProgress();
  private base: Screen | null = null;
  private readonly overlays: Screen[] = [];

  constructor(
    readonly stage: Stage,
    private readonly root: HTMLElement,
  ) {
    audio.setSound(this.progress.sound);
    audio.setMusic(this.progress.music);
    audio.installUnlock();
    root.addEventListener('click', (e) => {
      if ((e.target as Element).closest('button')) audio.play('ui_click');
    });
  }

  get total(): number {
    return CAMPAIGN.length;
  }

  get game(): GameScreen | null {
    return this.base instanceof GameScreen ? this.base : null;
  }

  private setProgress(p: Progress): void {
    this.progress = p;
    saveProgress(p);
  }

  private show(screen: Screen): void {
    while (this.overlays.length) this.closeOverlay();
    this.base?.destroy?.();
    this.base?.el.remove();
    this.base = screen;
    this.root.append(screen.el);
    screen.mount?.();
    screen.el.querySelector<HTMLElement>('h1, button')?.focus({ preventScroll: true });
  }

  private openOverlay(screen: Screen): void {
    screen.el.classList.add('overlay');
    this.overlays.push(screen);
    this.root.append(screen.el);
    screen.mount?.();
  }

  private closeOverlay(): void {
    const top = this.overlays.pop();
    top?.destroy?.();
    top?.el.remove();
  }

  /** Próxima fase a jogar: a primeira não concluída, ou null se todas foram. */
  nextLevel(): number | null {
    const done = new Set(this.progress.completed);
    return CAMPAIGN.find((l) => !done.has(l.id))?.id ?? null;
  }

  private setSound(on: boolean): void {
    audio.setSound(on);
    this.setProgress({ ...this.progress, sound: on });
  }

  private setMusic(on: boolean): void {
    audio.setMusic(on);
    this.setProgress({ ...this.progress, music: on });
  }

  showMenu(): void {
    this.show(
      new MenuScreen({
        nextLevel: this.nextLevel(),
        hasProgress: this.progress.completed.length > 0,
        sound: this.progress.sound,
        music: this.progress.music,
        onPlay: () => this.startLevel(this.nextLevel() ?? 1),
        onLevels: () => this.showLevels(),
        onGlossary: () => this.openGlossary(),
        onSound: (on) => this.setSound(on),
        onMusic: (on) => this.setMusic(on),
      }),
    );
  }

  showLevels(): void {
    this.show(
      new LevelSelectScreen({
        levels: CAMPAIGN,
        completed: new Set(this.progress.completed),
        highestUnlocked: highestUnlocked(this.progress, this.total),
        onPick: (id) => this.startLevel(id),
        onBack: () => this.showMenu(),
      }),
    );
  }

  openGlossary(): void {
    this.openOverlay(
      new GlossaryScreen({
        seen: new Set(this.progress.seenIntros),
        onOpen: (gate) => this.openOverlay(new IntroScreen({ gate, onDone: () => this.closeOverlay(), onClick: toggleSound })),
        onBack: () => this.closeOverlay(),
      }),
    );
  }

  /** Começa uma fase, passando antes pela apresentação da porta nova, se houver. */
  startLevel(id: number): void {
    const level = getCampaignLevel(id);
    if (!level || !isUnlocked(this.progress, id, this.total)) return;
    if (level.introGate) this.showIntro(level.introGate, id);
    else this.playLevel(id);
  }

  showIntro(gate: GateType, levelId: number): void {
    this.setProgress(markIntroSeen(this.progress, gate));
    this.show(new IntroScreen({ gate, levelId, onDone: () => this.playLevel(levelId), onClick: toggleSound }));
  }

  playLevel(id: number): void {
    const level = getCampaignLevel(id);
    if (!level) return;
    const last = id === this.total;
    // Barra de energia nas fases com energia visível: a fácil gasta por toque numa chave,
    // a difícil sem "Ativar" gasta por peça encaixada. Continua de onde parou se o jogador
    // saiu no meio da fase.
    let energy: GameHooks['energy'];
    const minMoves =
      level.difficulty === 'easy'
        ? solve(level.def).minClicks
        : level.difficulty === 'hard' && !(level.def as UltimateLevelDef).hidden
          ? (level.def as UltimateLevelDef).slots.length
          : 0;
    if (minMoves > 0) {
      const capacity = energyCapacity(minMoves);
      const saved = this.progress.energy;
      energy = { capacity, left: saved?.level === id && saved.left > 0 ? Math.min(saved.left, capacity) : capacity };
    }
    const hooks: GameHooks = {
      difficulty: level.difficulty,
      isLast: last,
      total: this.total,
      lives: this.progress.lives,
      energy,
      onLifeLost: () => this.setProgress(loseLife(this.progress).progress),
      onEnergy: (left) => this.setProgress({ ...this.progress, energy: { level: id, left } }),
      sound: this.progress.sound,
      music: this.progress.music,
      onSound: (on) => this.setSound(on),
      onMusic: (on) => this.setMusic(on),
      onMenu: () => this.showMenu(),
      onGlossary: () => this.openGlossary(),
      onNext: () => this.startLevel(id + 1),
      onLevels: () => this.showLevels(),
      onWin: () => {
        this.setProgress({ ...markCompleted(this.progress, id), energy: null });
        // A vinheta de vitória fica reservada para a última fase.
        if (last) audio.play('win');
      },
      onLampOn: () => audio.play('lamp_on'),
      onToggle: toggleSound,
      onRestart: () => {},
      onPlace: () => audio.play('switch_on'),
      onActivate: () => audio.play('energize'),
      onBurn: () => audio.play('burn'),
      onGameOver: () => audio.play('game_over'),
      // Fim de jogo recomeça a mesma fase, com as 3 lâmpadas renovadas (já salvas por loseLife).
      onRetry: () => this.playLevel(id),
    };
    this.show(new GameScreen(this.stage, level.def, hooks));
  }
}
