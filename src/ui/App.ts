import { audio } from '../audio/AudioManager';
import type { GateType } from '../core/types';
import { chapterStart, introGateFor } from '../levels/chapters';
import { getLevel, LEVELS } from '../levels';
import type { Stage } from '../render/Stage';
import {
  EXPERT_UNLOCK_LEVEL,
  highestUnlocked,
  isExpertUnlocked,
  isUnlocked,
  loadProgress,
  markCompleted,
  markIntroSeen,
  recordExpert,
  saveProgress,
  type Progress,
} from '../storage/progress';
import { GameScreen, type GameHooks } from './screens/GameScreen';
import { GlossaryScreen } from './screens/GlossaryScreen';
import { IntroScreen } from './screens/IntroScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { MenuScreen } from './screens/MenuScreen';
import type { Screen } from './screens/Screen';

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
    return LEVELS.length;
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
    return LEVELS.find((l) => !done.has(l.id))?.id ?? null;
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
        expert: { unlocked: isExpertUnlocked(this.progress), best: this.progress.expertBest, unlockLevel: EXPERT_UNLOCK_LEVEL },
        onPlay: () => this.startLevel(this.nextLevel() ?? 1),
        onExpert: () => this.startExpert(1),
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
        total: this.total,
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
        onOpen: (gate) => this.openOverlay(new IntroScreen({ gate, onDone: () => this.closeOverlay() })),
        onBack: () => this.closeOverlay(),
      }),
    );
  }

  /** Começa uma fase, passando antes pela apresentação da porta nova, se houver. */
  startLevel(id: number): void {
    if (!isUnlocked(this.progress, id, this.total)) return;
    const gate = introGateFor(id);
    if (gate) this.showIntro(gate, id);
    else this.playLevel(id);
  }

  showIntro(gate: GateType, levelId: number): void {
    this.setProgress(markIntroSeen(this.progress, gate));
    this.show(new IntroScreen({ gate, levelId, onDone: () => this.playLevel(levelId), onClick: () => audio.play('switch') }));
  }

  /** Ganchos comuns aos dois modos de jogo. */
  private baseHooks(id: number): GameHooks {
    return {
      isLast: id === this.total,
      sound: this.progress.sound,
      music: this.progress.music,
      onSound: (on) => this.setSound(on),
      onMusic: (on) => this.setMusic(on),
      onMenu: () => this.showMenu(),
      onGlossary: () => this.openGlossary(),
      onNext: () => this.startLevel(id + 1),
      onLevels: () => this.showLevels(),
      onWin: () => {
        const wasUnlocked = isExpertUnlocked(this.progress);
        this.setProgress(markCompleted(this.progress, id));
        audio.play('win');
        return !wasUnlocked && isExpertUnlocked(this.progress);
      },
      onLampOn: () => audio.play('lamp_on'),
      onToggle: (value) => audio.play(value ? 'energize' : 'switch'),
      onRestart: () => {},
    };
  }

  playLevel(id: number): void {
    const level = getLevel(id);
    if (!level) return;
    this.show(new GameScreen(this.stage, level, this.baseHooks(id)));
  }

  /**
   * Modo Expert: as fases vêm em sequência, sem escolha. A introdução de uma porta
   * só aparece se o aluno ainda não a viu. Sair da partida a encerra.
   */
  startExpert(id: number): void {
    if (!isExpertUnlocked(this.progress) || !getLevel(id)) return;
    const gate = introGateFor(id);
    if (gate && !this.progress.seenIntros.includes(gate)) {
      this.setProgress(markIntroSeen(this.progress, gate));
      this.show(new IntroScreen({ gate, levelId: id, onDone: () => this.playExpert(id), onClick: () => audio.play('switch') }));
    } else this.playExpert(id);
  }

  playExpert(id: number): void {
    const level = getLevel(id);
    if (!level) return;
    this.show(
      new GameScreen(this.stage, level, {
        ...this.baseHooks(id),
        expert: true,
        retryLevel: chapterStart(id),
        onNext: () => this.startExpert(id + 1),
        onWin: () => {
          this.setProgress(recordExpert(this.progress, id));
          audio.play('win');
        },
        onToggle: () => audio.play('switch'),
        onActivate: () => audio.play('energize'),
        onBurn: () => audio.play('burn'),
        onGameOver: () => audio.play('game_over'),
        onRetry: () => this.startExpert(chapterStart(id)),
      }),
    );
  }
}
