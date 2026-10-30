/// <reference types="vitest/config" />
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Só no `vite dev`: o editor salva fases em src/levels/data/NN.json. */
function levelSaver(): Plugin {
  return {
    name: 'level-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__levels/save', (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'use POST' });
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          try {
            const level = JSON.parse(body);
            if (!Number.isInteger(level.id) || level.id < 1 || level.id > 99) throw new Error('id da fase deve ser um inteiro entre 1 e 99');
            if (!Array.isArray(level.inputs) || !Array.isArray(level.gates) || typeof level.output !== 'string') throw new Error('formato de fase inválido');
            const file = resolve(root, 'src/levels/data', `${String(level.id).padStart(2, '0')}.json`);
            writeFileSync(file, JSON.stringify(level, null, 2) + '\n');
            reply(200, { ok: true, file });
          } catch (e) {
            reply(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [levelSaver()],
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
