import type { GateType } from '../../core/types';
import { t } from '../../i18n/i18n';
import type { Difficulty } from '../../levels/campaign';
import { h, iconButton, ICONS } from '../dom';
import type { Screen } from './Screen';

export interface LevelSelectOptions {
  levels: readonly { id: number; difficulty: Difficulty; introGate?: GateType }[];
  completed: ReadonlySet<number>;
  highestUnlocked: number;
  onPick(levelId: number): void;
  onBack(): void;
}

export class LevelSelectScreen implements Screen {
  readonly el: HTMLElement;

  constructor(o: LevelSelectOptions) {
    const grid = h('div', { class: 'level-grid' });
    for (const { id, difficulty, introGate: gate } of o.levels) {
      const done = o.completed.has(id);
      const locked = id > o.highestUnlocked;
      const label = `${locked ? t('levels.locked', { level: id }) : done ? t('levels.done', { level: id }) : t('levels.open', { level: id })}, ${t(`difficulty.${difficulty}`)}`;
      grid.append(
        h(
          'button',
          {
            class: `level-tile diff-${difficulty} ${done ? 'done' : ''} ${locked ? 'locked' : ''} ${id === o.highestUnlocked && !done ? 'current' : ''}`,
            'aria-label': gate ? `${label}. ${t('levels.newGate', { gate })}` : label,
            'data-level': id,
            'data-difficulty': difficulty,
            disabled: locked,
            onclick: () => o.onPick(id),
          },
          h('span', { class: 'level-diff', 'aria-hidden': 'true' }),
          h('span', { class: 'level-num', text: id }),
          locked ? h('span', { class: 'level-icon', html: ICONS.lock }) : done ? h('span', { class: 'level-icon', html: ICONS.check }) : null,
          gate ? h('span', { class: 'level-gate', text: gate }) : null,
        ),
      );
    }
    this.el = h(
      'section',
      { class: 'screen list-screen' },
      h(
        'header',
        { class: 'screen-header' },
        iconButton('back', t('common.back'), o.onBack),
        h('h1', { text: t('levels.title') }),
      ),
      h(
        'p',
        { class: 'difficulty-legend' },
        ...(['easy', 'medium', 'hard'] as const).map((d) => h('span', { class: `diff-${d}` }, h('span', { class: 'level-diff', 'aria-hidden': 'true' }), t(`difficulty.${d}`))),
      ),
      grid,
    );
  }
}
