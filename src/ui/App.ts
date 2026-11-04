import { audio } from '../audio/AudioManager';
import type { Bit, GateType } from '../core/types';
import { chapterStart, introGateFor } from '../levels/chapters';
import { t } from '../i18n/i18n';
import { getLevel, getUltimateLevel, LEVELS, newPiecesIn, ULTIMATE_LEVELS } from '../levels';
import type { Stage } from '../render/Stage';
import {
  EXPERT_UNLOCK_LEVEL,
  highestUltimateUnlocked,
  highestUnlocked,
  isExpertUnlocked,
  isUltimateUnlocked,
  isUnlocked,
  loadProgress,
  markCompleted,
  markExpertPlayed,
  markIntroSeen,
  markUltimateCompleted,
  recordExpert,
  saveProgress,
  ULTIMATE_UNLOCK_LEVEL,
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

  /** Próxima fase do Ultimate: a primeira não concluída, ou null se todas foram. */
  nextUltimate(): number | null {
    const done = new Set(this.progress.ultimateCompleted);
    return ULTIMATE_LEVELS.find((l) => !done.has(l.id))?.id ?? null;
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
        ultimate: {
          unlocked: isUltimateUnlocked(this.progress),
          next: this.nextUltimate(),
          started: this.progress.ultimateCompleted.length > 0,
          unlockLevel: ULTIMATE_UNLOCK_LEVEL,
        },
        onPlay: () => this.startLevel(this.nextLevel() ?? 1),
        onExpert: () => this.startExpert(1),
        onUltimate: () => {
          const next = this.nextUltimate();
          if (next === null) this.showUltimateLevels();
          else this.startUltimate(next);
        },
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

  showUltimateLevels(): void {
    this.show(
      new LevelSelectScreen({
        title: t('ultimate.levels'),
        gateFor: (id) => newPiecesIn(id)[0],
        total: ULTIMATE_LEVELS.length,
        completed: new Set(this.progress.ultimateCompleted),
        highestUnlocked: highestUltimateUnlocked(this.progress, ULTIMATE_LEVELS.length),
        onPick: (id) => this.startUltimate(id),
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
    if (!isUnlocked(this.progress, id, this.total)) return;
    const gate = introGateFor(id);
    if (gate) this.showIntro(gate, id);
    else this.playLevel(id);
  }

  showIntro(gate: GateType, levelId: number): void {
    this.setProgress(markIntroSeen(this.progress, gate));
    this.show(new IntroScreen({ gate, levelId, onDone: () => this.playLevel(levelId), onClick: toggleSound }));
  }

  /** A vinheta de vitória fica reservada para a última fase, em qualquer modo. */
  private playWin(id: number): void {
    if (id === this.total) audio.play('win');
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
        this.playWin(id);
        return !wasUnlocked && isExpertUnlocked(this.progress);
      },
      onLampOn: () => audio.play('lamp_on'),
      onToggle: toggleSound,
      onRestart: () => {},
    };
  }

  playLevel(id: number): void {
    const level = getLevel(id);
    if (!level) return;
    this.show(new GameScreen(this.stage, level, { ...this.baseHooks(id), suggestExpert: !this.progress.expertPlayed }));
  }

  /**
   * Modo Expert: as fases vêm em sequência, sem escolha. A introdução de uma porta
   * só aparece se o aluno ainda não a viu. Sair da partida a encerra.
   */
  startExpert(id: number): void {
    if (!isExpertUnlocked(this.progress) || !getLevel(id)) return;
    this.setProgress(markExpertPlayed(this.progress));
    const gate = introGateFor(id);
    if (gate && !this.progress.seenIntros.includes(gate)) {
      this.setProgress(markIntroSeen(this.progress, gate));
      this.show(new IntroScreen({ gate, levelId: id, onDone: () => this.playExpert(id), onClick: toggleSound }));
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
          const wasUnlocked = isUltimateUnlocked(this.progress);
          this.setProgress(recordExpert(this.progress, id));
          this.playWin(id);
          return !wasUnlocked && isUltimateUnlocked(this.progress);
        },
        onActivate: () => audio.play('energize'),
        onBurn: () => audio.play('burn'),
        onGameOver: () => audio.play('game_over'),
        onRetry: () => this.startExpert(chapterStart(id)),
      }),
    );
  }

  /**
   * Modo Ultimate: antes da fase aparecem as introduções das peças que o aluno
   * ainda não viu, uma de cada vez.
   */
  startUltimate(id: number): void {
    const level = getUltimateLevel(id);
    if (!level || !isUltimateUnlocked(this.progress) || id > highestUltimateUnlocked(this.progress, ULTIMATE_LEVELS.length)) return;
    const gate = (Object.keys(level.pieces) as GateType[]).find((g) => !this.progress.seenIntros.includes(g));
    if (gate) {
      this.setProgress(markIntroSeen(this.progress, gate));
      this.show(new IntroScreen({ gate, levelId: id, onDone: () => this.startUltimate(id), onClick: toggleSound }));
    } else this.playUltimate(id);
  }

  playUltimate(id: number): void {
    const level = getUltimateLevel(id);
    if (!level) return;
    const last = id === ULTIMATE_LEVELS.length;
    this.show(
      new GameScreen(this.stage, level, {
        ...this.baseHooks(id),
        isLast: last,
        ultimate: true,
        onNext: () => this.startUltimate(id + 1),
        onLevels: () => this.showUltimateLevels(),
        onWin: () => {
          this.setProgress(markUltimateCompleted(this.progress, id));
          if (last) audio.play('win');
        },
        onPlace: () => audio.play('switch_on'),
        onActivate: () => audio.play('energize'),
        onBurn: () => audio.play('burn'),
        onGameOver: () => audio.play('game_over'),
        onRetry: () => this.playUltimate(id),
      }),
    );
  }
}
