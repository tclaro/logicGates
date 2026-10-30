import type { Bit, GateType, Point } from '../core/types';
import { t } from '../i18n/i18n';
import { gateSvg } from '../render/gateShapes';
import { h, iconButton } from './dom';
import { TruthTableView } from './TruthTable';

/** Balão com a tabela verdade de uma porta da placa e a linha atual destacada. */
export class GatePopover {
  readonly el: HTMLElement;
  private readonly table: TruthTableView;

  constructor(
    readonly gateId: string,
    readonly type: GateType,
    onClose: () => void,
  ) {
    this.table = new TruthTableView(type);
    this.el = h(
      'div',
      { class: 'popover', role: 'dialog', 'aria-label': t('popover.title', { gate: type }) },
      h(
        'div',
        { class: 'popover-head' },
        h('span', { class: 'popover-symbol', html: gateSvg(type, { className: 'gate-svg tiny', label: false }) }),
        h('strong', { text: type }),
        h('span', { class: 'muted', text: t(`gate.${type}.name`) }),
        iconButton('close', t('popover.close'), onClose, 'small'),
      ),
      h('p', { class: 'popover-summary', text: t(`gate.${type}.summary`) }),
      this.table.el,
    );
  }

  /** Atualiza a linha destacada com as entradas que chegaram ao pino (A = esquerda). */
  update(inputs: readonly Bit[]): void {
    this.table.highlight(inputs);
  }

  /** Posiciona acima ou abaixo do ponto, dentro da janela. */
  place(anchor: Point, gap: number): void {
    const { el } = this;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(vw - w - 8, anchor.x - w / 2));
    const below = anchor.y + gap;
    const top = below + hgt < vh - 8 ? below : Math.max(8, anchor.y - gap - hgt);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
}
