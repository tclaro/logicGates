import type { GateType } from '../../core/types';
import { t } from '../../i18n/i18n';
import { introGateFor } from '../../levels/chapters';
import { h, iconButton, ICONS } from '../dom';
import type { Screen } from './Screen';

export interface LevelSelectOptions {
  /** Título da tela (padrão: "Fases"). */
  title?: string;
  /** Porta nova de cada fase, mostrada no quadrinho (padrão: a do modo normal). */
  gateFor?(levelId: number): GateType | undefined;
  total: number;
  completed: ReadonlySet<number>;
  highestUnlocked: number;
  onPick(levelId: number): void;
  onBack(): void;
}

export class LevelSelectScreen implements Screen {
  readonly el: HTMLElement;

  constructor(o: LevelSelectOptions) {
    const grid = h('div', { class: 'level-grid' });
    for (let id = 1; id <= o.total; id++) {
      const done = o.completed.has(id);
      const locked = id > o.highestUnlocked;
      const gate = (o.gateFor ?? introGateFor)(id);
      const label = locked ? t('levels.locked', { level: id }) : done ? t('levels.done', { level: id }) : t('levels.open', { level: id });
      grid.append(
        h(
          'button',
          {
            class: `level-tile ${done ? 'done' : ''} ${locked ? 'locked' : ''} ${id === o.highestUnlocked && !done ? 'current' : ''}`,
            'aria-label': gate ? `${label}. ${t('levels.newGate', { gate })}` : label,
            'data-level': id,
            disabled: locked,
            onclick: () => o.onPick(id),
          },
          h('span', { class: 'level-num', text: id }),
          locked ? h('span', { class: 'level-icon', html: ICONS.lock }) : done ? h('span', { class: 'level-icon', html: ICONS.check }) : null,
          gate ? h('span', { class: 'level-gate', text: gate }) : null,
        ),
      );
    }
    this.el = h(
      'section',
      { class: 'screen list-screen' },
      h('header', { class: 'screen-header' }, iconButton('back', t('common.back'), o.onBack), h('h1', { text: o.title ?? t('levels.title') })),
      grid,
    );
  }
}
