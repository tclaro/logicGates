export interface Screen {
  readonly el: HTMLElement;
  /** Chamado depois de o elemento entrar no DOM. */
  mount?(): void;
  destroy?(): void;
}
