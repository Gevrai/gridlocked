import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function puzzleEditorPlugin(): Plugin {
  const puzzlesDir = path.resolve(__dirname, 'src/data/puzzles');

  return {
    name: 'puzzle-editor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__api/puzzles')) return next();

        if (req.method === 'GET') {
          const files = fs.readdirSync(puzzlesDir)
            .filter(f => f.endsWith('.json') && f.startsWith('puzzle-'))
            .sort();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files }));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => body += chunk.toString());
          req.on('end', () => {
            try {
              const { filename, puzzle } = JSON.parse(body);
              const safeName = filename.replace(/[^a-zA-Z0-9\-_.]/g, '');
              const filepath = path.join(puzzlesDir, safeName);

              fs.writeFileSync(filepath, JSON.stringify(puzzle, null, 2) + '\n');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filename: safeName }));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (err as Error).message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: '/rush-hour/',
  plugins: [puzzleEditorPlugin()],
});
