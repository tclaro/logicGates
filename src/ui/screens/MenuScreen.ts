import { t } from '../../i18n/i18n';
import { lampImageUrls } from '../../render/assets';
import { h, ICONS } from '../dom';
import type { Screen } from './Screen';

export interface MenuActions {
  /** Próxima fase a jogar, ou null se todas foram concluídas. */
  nextLevel: number | null;
  hasProgress: boolean;
  sound: boolean;
  music: boolean;
  onPlay(): void;
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
    const toggle = (icon: 'sound' | 'music', label: string, value: boolean, cb: (on: boolean) => void) => {
      const btn = h('button', {
        class: `toggle ${value ? 'on' : ''}`,
        'aria-pressed': String(value),
        html: `${ICONS[icon]}<span>${label}</span>`,
      });
      btn.addEventListener('click', () => {
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        cb(on);
      });
      return btn;
    };
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
        h('button', { class: 'btn big', html: `${ICONS.book} ${t('menu.glossary')}`, onclick: a.onGlossary }),
      ),
      h('div', { class: 'menu-toggles' }, toggle('sound', t('menu.sound'), a.sound, a.onSound), toggle('music', t('menu.music'), a.music, a.onMusic)),
    );
  }
}
