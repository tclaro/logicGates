import { t } from '../../i18n/i18n';
import { lampImageUrls } from '../../render/assets';
import { h, ICONS, toggleButton } from '../dom';
import type { Screen } from './Screen';

export interface MenuActions {
  /** Próxima fase a jogar, ou null se todas foram concluídas. */
  nextLevel: number | null;
  hasProgress: boolean;
  sound: boolean;
  music: boolean;
  expert: { unlocked: boolean; best: number; unlockLevel: number };
  onPlay(): void;
  onExpert(): void;
  onLevels(): void;
  onGlossary(): void;
  onSound(on: boolean): void;
  onMusic(on: boolean): void;
}

export class MenuScreen implements Screen {
  readonly el: HTMLElement;

  constructor(a: MenuActions) {
    const lamp = h('img', { class: 'menu-lamp', alt: '' });
    void lampImageUrls().then((urls) => (lamp.src = urls.on));
    const playLabel = a.nextLevel === null ? t('menu.levels') : a.hasProgress ? t('menu.continue', { level: a.nextLevel }) : t('menu.play');

    this.el = h(
      'section',
      { class: 'screen menu-screen' },
      h(
        'div',
        { class: 'menu-hero' },
        h('div', { class: 'menu-lamp-wrap' }, lamp),
        h('h1', { class: 'menu-title', text: t('app.title') }),
        h('p', { class: 'menu-subtitle', text: a.nextLevel === null ? t('menu.allDone') : t('app.subtitle') }),
      ),
      h(
        'nav',
        { class: 'menu-buttons' },
        h('button', { class: 'btn primary big', 'data-testid': 'play', html: `${ICONS.play} ${playLabel}`, onclick: a.nextLevel === null ? a.onLevels : a.onPlay }),
        h('button', { class: 'btn big', html: `${ICONS.grid} ${t('menu.levels')}`, onclick: a.onLevels }),
        expertButton(a),
        h('button', { class: 'btn big', html: `${ICONS.book} ${t('menu.glossary')}`, onclick: a.onGlossary }),
      ),
      h('div', { class: 'menu-toggles' }, toggleButton('sound', t('menu.sound'), a.sound, a.onSound), toggleButton('music', t('menu.music'), a.music, a.onMusic)),
    );
  }
}

function expertButton(a: MenuActions): HTMLButtonElement {
  const { unlocked, best, unlockLevel } = a.expert;
  const detail = !unlocked ? t('menu.expertLocked', { level: unlockLevel }) : best ? t('menu.expertBest', { level: best }) : t('menu.expertNew');
  return h(
    'button',
    { class: 'btn big expert-btn', 'data-testid': 'expert', disabled: !unlocked, onclick: a.onExpert },
    h('span', { class: 'expert-icon', html: unlocked ? ICONS.bolt : ICONS.lock }),
    h('span', { class: 'expert-text' }, h('span', { text: t('menu.expert') }), h('small', { text: detail })),
  );
}
