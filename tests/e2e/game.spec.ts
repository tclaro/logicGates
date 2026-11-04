import { expect, test, type Page } from '@playwright/test';

type Bit = 0 | 1;
interface GameState {
  level: number;
  inputs: Record<string, Bit>;
  lampOn: boolean;
  animating: boolean;
  won: boolean;
  lives: number | null;
  slots: Record<string, string | null>;
}

declare global {
  interface Window {
    __game: {
      pointOf(id: string): { x: number; y: number } | null;
      solution(levelId: number): Bit[] | null;
      ultimateSolution(levelId: number): Record<string, string> | null;
      app: { startExpert(id: number): void };
      ultimateLevels: number;
      state(): GameState | null;
    };
  }
}

const state = (page: Page) => page.evaluate(() => window.__game?.state() ?? null);

async function waitForBoard(page: Page, level: number): Promise<void> {
  await expect.poll(async () => (await state(page))?.level).toBe(level);
}

/** Toca numa chave ou porta da placa, pelo centro calculado no jogo. */
async function tap(page: Page, id: string): Promise<void> {
  const p = await page.evaluate((nodeId) => window.__game.pointOf(nodeId), id);
  expect(p, `posição de ${id}`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}

/** Alterna as chaves que diferem da solução mais próxima. */
async function solve(page: Page, level: number): Promise<void> {
  const best = await page.evaluate((id) => window.__game.solution(id), level);
  const s = (await state(page))!;
  const ids = Object.keys(s.inputs).sort();
  for (const [i, id] of ids.entries()) {
    if (s.inputs[id] !== best![i]) await tap(page, id);
  }
}

async function seedProgress(page: Page, completed: number[], seenIntros: string[] = [], extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([c, s, e]) => localStorage.setItem('portas-logicas:progress', JSON.stringify({ version: 1, completed: c, seenIntros: s, sound: false, music: false, ...e })),
    [completed, seenIntros, extra] as const,
  );
}

const ALL_GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
const ALL_BUT_LAST = Array.from({ length: 35 }, (_, i) => i + 1);

test('primeira jogada: introdução, fase 1, vitória e progresso salvo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play').click();
  await expect(page.getByRole('heading', { name: /AND/ })).toBeVisible();
  await expect(page.locator('.truth-table tr.current')).toHaveCount(1);
  await page.getByRole('button', { name: 'Começar fase 1' }).click();
  await waitForBoard(page, 1);
  await expect(page.getByTestId('level-title')).toHaveText('Fase 1');

  await tap(page, 'b');
  expect((await state(page))!.inputs).toEqual({ a: 1, b: 1 });
  // A lâmpada só acende depois que a energia percorre as trilhas.
  expect((await state(page))!.lampOn).toBe(false);
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('next')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.completed).toEqual([1]);
  expect(saved.seenIntros).toEqual(['AND']);

  // Fase 2 apresenta o OR antes de começar.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: /OR/ })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('play')).toHaveText(/Continuar — fase 2/);
});

test('menu: Modo Iniciante e Fases lado a lado', async ({ page }) => {
  await page.goto('/');
  const play = page.getByTestId('play');
  await expect(play).toContainText('Modo Iniciante');
  await expect(play).toContainText('Comece pela fase 1');
  const levels = page.getByRole('button', { name: 'Fases' });
  // Espera a animação de entrada da tela terminar antes de medir.
  await expect.poll(async () => Math.abs((await play.boundingBox())!.y - (await levels.boundingBox())!.y)).toBeLessThan(1);
  const a = (await play.boundingBox())!;
  const b = (await levels.boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
});

test('última fase sem ter jogado o Expert convida para o modo Expert', async ({ page }) => {
  await seedProgress(page, ALL_BUT_LAST, ALL_GATES);
  await page.goto('/');
  await page.getByTestId('play').click();
  await waitForBoard(page, 36);
  await solve(page, 36);
  await expect(page.getByTestId('win-text')).toHaveText('Você provou ser um excelente iniciante. Por que não tenta o Modo Expert?');
});

test('última fase depois de jogar o Expert mantém o texto de sempre', async ({ page }) => {
  await seedProgress(page, ALL_BUT_LAST, ALL_GATES, { expertPlayed: true });
  await page.goto('/');
  await page.getByTestId('play').click();
  await waitForBoard(page, 36);
  await solve(page, 36);
  await expect(page.getByTestId('win-text')).toHaveText('Completou todas as 36 fases.');
});

test('reiniciar volta as chaves ao estado inicial', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);
  const initial = (await state(page))!.inputs;
  await tap(page, 'a');
  await tap(page, 'c');
  expect((await state(page))!.inputs).not.toEqual(initial);
  await page.getByRole('button', { name: 'Reiniciar fase' }).click();
  expect((await state(page))!.inputs).toEqual(initial);
  await page.keyboard.press('1');
  expect((await state(page))!.inputs).not.toEqual(initial);
  await page.keyboard.press('r');
  expect((await state(page))!.inputs).toEqual(initial);

  // Com o cartão de vitória aberto, os botões do topo continuam clicáveis.
  await solve(page, 3);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar fase' }).click();
  await expect(page.getByTestId('next')).toBeHidden();
  expect((await state(page))!.inputs).toEqual(initial);
  await solve(page, 3);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.getByRole('button', { name: 'Som e música' }).click();
  await expect(page.getByRole('group', { name: 'Som e música' })).toBeVisible();
  await page.getByRole('button', { name: 'Glossário' }).click();
  await expect(page.locator('.glossary-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('play')).toBeVisible();
});

test('no jogo, o som se configura e o botão de menu volta ao menu principal', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);

  const audioBtn = page.getByRole('button', { name: 'Som e música' });
  const panel = page.getByRole('group', { name: 'Som e música' });
  await audioBtn.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: 'Efeitos sonoros' }).click();
  await panel.getByRole('button', { name: 'Música' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect([saved.sound, saved.music]).toEqual([true, true]);
  // Um toque na placa fecha o painel.
  await tap(page, 'a');
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute('aria-pressed', 'true');
});

test('modo Expert: liberado na fase 10, energia escondida, vidas e fim de jogo', async ({ page: before }) => {
  await seedProgress(before, [1, 2, 3, 4, 5, 6, 7, 8, 9], ['AND', 'OR', 'NOT']);
  await before.goto('/');
  await expect(before.getByTestId('expert')).toHaveAttribute('aria-disabled', 'true');
  await expect(before.getByTestId('expert')).toContainText('Conclua a fase 10');
  // Tocar no modo bloqueado explica como liberar, sem abrir nada.
  // force: o botão bloqueado tem aria-disabled, mas continua tocável.
  await before.getByTestId('expert').click({ force: true });
  await expect(before.getByTestId('menu-notice')).toContainText('Conclua a fase 10 do Modo Iniciante');
  await expect(before.getByTestId('play')).toBeVisible();

  // Vencer a fase 10 mostra o aviso de liberação; rejogá-la não mostra de novo.
  await before.getByTestId('play').click();
  await waitForBoard(before, 10);
  await solve(before, 10);
  await expect(before.getByTestId('expert-unlocked')).toContainText('Modo Expert liberado!');
  await before.getByRole('button', { name: 'Jogar de novo' }).click();
  await solve(before, 10);
  await expect(before.getByTestId('next')).toBeVisible();
  await expect(before.getByTestId('expert-unlocked')).toHaveCount(0);

  // Outra aba, porque o seedProgress regravaria o progresso ao recarregar.
  const page = await before.context().newPage();
  await page.goto('/');
  await page.getByTestId('expert').click();
  await waitForBoard(page, 1);
  await expect(page.getByTestId('level-title')).toHaveText('ExpertFase 1');
  await expect(page.getByTestId('activate')).toHaveText(/Ativar/);
  const lit = page.locator('.life:not(.burnt)');
  await expect(lit).toHaveCount(3);

  // Fase 1: AND(a, b) com a=1, b=0. Ligar b não acende nada até ativar.
  await tap(page, 'b');
  await page.waitForTimeout(800);
  expect((await state(page))!.lampOn).toBe(false);
  await tap(page, 'b');

  const activate = page.getByTestId('activate');
  for (let left = 2; left >= 0; left--) {
    await activate.click();
    await expect(lit).toHaveCount(left, { timeout: 5000 });
    if (left > 0) {
      // Depois do erro é preciso mudar alguma chave antes de ativar de novo.
      await expect(activate).toBeDisabled();
      await expect(page.getByText('Mude alguma chave')).toBeVisible();
      await tap(page, 'a');
      await expect(activate).toBeEnabled();
    }
  }
  await expect(page.getByTestId('retry')).toHaveText(/Recomeçar da fase 1/);
  await page.getByTestId('retry').click();
  await waitForBoard(page, 1);
  await expect(lit).toHaveCount(3);

  await tap(page, 'b');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await page.getByTestId('next').click();
  await waitForBoard(page, 2);
  await expect(lit).toHaveCount(3);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.expertBest).toBe(1);
  expect(saved.expertPlayed).toBe(true);

  // Sair encerra a partida; o menu mostra o recorde e recomeça da fase 1.
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('expert')).toContainText('Recorde: fase 1');
  await page.getByTestId('expert').click();
  await waitForBoard(page, 1);
});

test('tocar numa porta mostra a tabela verdade com a linha atual', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);
  // Fase 3: AND(OR(a, b), c) com a=0, b=0, c=1. O OR (g1) recebe 0 e 0.
  await tap(page, 'g1');
  const popover = page.locator('.popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('strong')).toHaveText('OR');
  await expect(popover.locator('tr.current td')).toHaveText(['0', '0', '0']);
  await tap(page, 'a');
  // A linha muda quando a energia chega à porta.
  await expect(popover.locator('tr.current td')).toHaveText(['1', '0', '1'], { timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

test('fases bloqueadas não abrem e o glossário mostra só portas vistas', async ({ page }) => {
  await seedProgress(page, [1], ['AND']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await expect(page.locator('[data-level="2"]')).toBeEnabled();
  await expect(page.locator('[data-level="3"]')).toBeDisabled();
  await expect(page.locator('[data-level="36"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Glossário' }).click();
  await expect(page.locator('[data-gate="AND"]')).toBeEnabled();
  await expect(page.locator('[data-gate="OR"]')).toBeDisabled();
  await page.locator('[data-gate="AND"]').click();
  await expect(page.locator('.intro-screen .chip').first()).toHaveText('A · B');
});

test('todas as 36 fases podem ser vencidas pela solução do solver', async ({ page }) => {
  test.setTimeout(240_000);
  for (let level = 1; level <= 36; level++) {
    await page.goto(`/?level=${level}`);
    await waitForBoard(page, level);
    expect((await state(page))!.lampOn, `fase ${level} começa apagada`).toBe(false);
    await solve(page, level);
    await expect.poll(async () => (await state(page))!.won, { timeout: 8000, message: `fase ${level}` }).toBe(true);
  }
});

/** Monta a solução do solver tocando na peça e depois no encaixe. */
async function assemble(page: Page, level: number): Promise<void> {
  const fill = await page.evaluate((id) => window.__game.ultimateSolution(id), level);
  for (const [slot, piece] of Object.entries(fill!)) {
    // Com estoque sobrando a peça continua escolhida depois de encaixar; tocar de novo a desmarcaria.
    const btn = page.getByTestId(`piece-${piece}`);
    if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
    await tap(page, slot);
  }
  await expect.poll(async () => (await state(page))!.slots).toEqual(fill);
}

test('modo Ultimate bloqueado explica como liberar', async ({ page }) => {
  await seedProgress(page, ALL_BUT_LAST, ALL_GATES, { expertBest: 3 });
  await page.goto('/');
  const ultimate = page.getByTestId('ultimate');
  await expect(ultimate).toHaveAttribute('aria-disabled', 'true');
  await expect(ultimate).toContainText('Vença a fase 10 do Expert');
  await ultimate.click({ force: true });
  await expect(page.getByTestId('menu-notice')).toContainText('vence a fase 10 do Modo Expert');
  await expect(ultimate).toBeVisible();
});

test('vencer a fase 10 do Expert libera o Ultimate', async ({ page }) => {
  await seedProgress(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ALL_GATES, { expertBest: 9 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() => window.__game.app.startExpert(10));
  await waitForBoard(page, 10);
  await solve(page, 10);
  await page.getByTestId('activate').click();
  await expect(page.getByTestId('ultimate-unlocked')).toContainText('Modo Ultimate liberado!', { timeout: 8000 });
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('ultimate')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('ultimate')).toContainText('Monte o circuito com as peças');
});

test('Ultimate: arrastar a peça até o encaixe, com energia visível', async ({ page }) => {
  await seedProgress(page, [], ALL_GATES, { expertBest: 10 });
  await page.goto('/');
  await page.getByTestId('ultimate').click();
  await waitForBoard(page, 1);
  await expect(page.getByTestId('level-title')).toHaveText('UltimateFase 1');
  // Chaves fixas: tocar nelas não muda nada.
  const before = (await state(page))!.inputs;
  await tap(page, 'a');
  expect((await state(page))!.inputs).toEqual(before);

  // Peça errada primeiro: a lâmpada não acende e a peça volta à bandeja com um toque.
  const piece = (await page.getByTestId('piece-AND').boundingBox())!;
  const slot = (await page.evaluate(() => window.__game.pointOf('g1')))!;
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x, slot.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: 'AND' });
  await expect(page.getByTestId('piece-AND')).toBeDisabled();
  await page.waitForTimeout(800);
  expect((await state(page))!.won).toBe(false);
  await tap(page, 'g1');
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: null });

  await assemble(page, 1);
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('win-text')).toHaveText('Você montou o circuito da fase 1.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.ultimateCompleted).toEqual([1]);
  await page.getByTestId('next').click();
  await waitForBoard(page, 2);
});

test('Ultimate: chave automática, erro queima vida e acerto vence', async ({ page }) => {
  await seedProgress(page, [], ALL_GATES, { expertBest: 10, ultimateCompleted: [1, 2, 3, 4, 5, 6] });
  await page.goto('/');
  await page.getByTestId('ultimate').click();
  // Fase 7: OR(a, NOT a) com a chave a alternando sozinha.
  await waitForBoard(page, 7);
  const activate = page.getByTestId('activate');
  await expect(activate).toHaveText('Preencha todos os encaixes');
  await expect(activate).toBeDisabled();
  await page.getByTestId('piece-NOT').click();
  await tap(page, 'g1');
  await page.getByTestId('piece-AND').click();
  await tap(page, 'g2');
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect.poll(async () => (await state(page))!.lives, { timeout: 8000 }).toBe(2);
  await expect(activate).toHaveText('Troque alguma peça para tentar de novo');

  // OR no lugar do AND: a lâmpada aguenta a chave alternando e a fase é vencida.
  await page.getByTestId('piece-OR').click();
  await tap(page, 'g2');
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: 'NOT', g2: 'OR' });
  await activate.click();
  const seen = new Set<number>();
  await expect
    .poll(
      async () => {
        const s = (await state(page))!;
        seen.add(s.inputs.a!);
        return s.won;
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true);
  expect([...seen].sort()).toEqual([0, 1]);
  expect((await state(page))!.lives).toBe(2);
});

test('todas as fases do Ultimate podem ser vencidas pela montagem do solver', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  const total = await page.evaluate(() => window.__game.ultimateLevels);
  expect(total).toBeGreaterThan(0);
  for (let level = 1; level <= total; level++) {
    await page.goto(`/?ultimate=${level}`);
    await waitForBoard(page, level);
    expect((await state(page))!.lampOn, `fase ${level} começa apagada`).toBe(false);
    await assemble(page, level);
    if ((await state(page))!.lives !== null) await page.getByTestId('activate').click();
    await expect.poll(async () => (await state(page))!.won, { timeout: 10000, message: `fase ${level}` }).toBe(true);
  }
});
