# Portas Lógicas

Jogo educacional de navegador para ensinar portas lógicas a iniciantes. O aluno alterna as chaves 0/1 na base da placa até a lâmpada no topo acender. São 36 fases, com AND, OR, NOT, NAND, NOR, XOR e XNOR, e uma tela de apresentação antes da primeira fase de cada porta.

## Comandos

```bash
npm install
npm run dev          # jogo em http://localhost:5173 (?level=N abre uma fase direto)
npm test             # testes de unidade (lógica, solver, validador, layout, propagação)
npm run test:e2e     # testes no navegador (usa o Chrome instalado)
npm run build        # build estático em dist/
```

Editor de fases (só em desenvolvimento): `http://localhost:5173/editor/`.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/core` | Portas, avaliação do circuito, solver (força bruta) e validador de fases |
| `src/levels/data` | Uma fase por arquivo (`NN.json`) |
| `src/levels/chapters.ts` | Fase em que cada porta é apresentada |
| `src/layout` | Layout automático em camadas e roteamento das trilhas (0°/45°/90°) |
| `src/render` | Placa em PixiJS: trilhas, brilho, portas, lâmpada, chaves, propagação animada |
| `src/ui` | Telas em HTML/CSS: menu, fases, introdução, glossário, HUD, tabela verdade |
| `src/i18n/pt-BR.json` | Todos os textos do jogo |
| `editor/` | Editor visual de fases |

## Formato de uma fase

```json
{
  "id": 7,
  "inputs": [{ "id": "a", "initial": 0 }, { "id": "b", "initial": 1 }],
  "gates": [
    { "id": "g1", "type": "NOT", "in": ["b"] },
    { "id": "g2", "type": "AND", "in": ["a", "g1"] }
  ],
  "output": "g2",
  "layout": { "order": ["a", "b"], "x": { "g2": 450 } }
}
```

`layout` é opcional (o editor preenche ao arrastar portas). O teste `tests/unit/levels.test.ts` exige que toda fase:
- comece com a lâmpada apagada e tenha solução;
- tenha todas as chaves e portas ligadas à lâmpada;
- só use portas já apresentadas;
- tenha layout sem portas sobrepostas e sem trilhas atravessando portas ou se sobrepondo.

Para ver as estatísticas de dificuldade de cada fase, rode o comando abaixo:

```bash
LEVEL_REPORT=1 npx vitest run tests/unit/levels.test.ts --silent=false
```

## Sprites (opcionais)

Coloque arquivos PNG com fundo transparente em `public/assets/sprites/`. Os que não existirem continuam com a arte provisória desenhada por código.

| Arquivo | Tamanho | Observação |
|---|---|---|
| `board.png` | 1024×1024 | Textura da placa, emendável (tileable) |
| `lamp_off.png` | 512×512 | Lâmpada apagada; base da rosca na parte de baixo, centralizada |
| `lamp_on.png` | 512×512 | Mesmo enquadramento da apagada |
| `switch_0.png` | 256×256 | Chave desligada, **sem número** (o jogo desenha o 0/1 por cima) |
| `switch_1.png` | 256×256 | Chave ligada; só é usada se as duas existirem |

## Sons (opcionais)

Arquivos MP3 em `public/assets/audio/`. Enquanto um efeito não existir, o jogo toca um som sintetizado no lugar.

| Arquivo | Quando toca |
|---|---|
| `switch.mp3` | Chave desligada |
| `energize.mp3` | Chave ligada |
| `lamp_on.mp3` | Lâmpada acende |
| `win.mp3` | Fase concluída |
| `ui_click.mp3` | Botões das telas |
| `music.mp3` | Música de fundo (em loop) |
