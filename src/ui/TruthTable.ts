import { truthRowIndex, truthTable } from '../core/logic';
import type { Bit, GateType } from '../core/types';
import { t } from '../i18n/i18n';
import { h } from './dom';

/** Tabela verdade com a linha atual destacada (atualizável sem recriar). */
export class TruthTableView {
  readonly el: HTMLTableElement;
  private readonly rows: HTMLTableRowElement[] = [];
  private current = -1;

  constructor(readonly type: GateType) {
    const table = truthTable(type);
    const names = type === 'NOT' ? ['A'] : ['A', 'B'];
    this.el = h(
      'table',
      { class: 'truth-table' },
      h('thead', {}, h('tr', {}, ...names.map((n) => h('th', { text: n })), h('th', { class: 'out', text: t('intro.output') }))),
    );
    const body = h('tbody');
    for (const row of table) {
      const tr = h('tr', {}, ...row.inputs.map((b) => h('td', { text: b })), h('td', { class: `out bit-${row.output}`, text: row.output }));
      this.rows.push(tr);
      body.append(tr);
    }
    this.el.append(body);
  }

  highlight(inputs: readonly Bit[] | null): void {
    const index = inputs ? truthRowIndex(inputs) : -1;
    if (index === this.current) return;
    this.rows[this.current]?.classList.remove('current');
    this.rows[index]?.classList.add('current');
    this.current = index;
  }
}
