import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function puzzleEditorPlugin(): Plugin {
  const savedDir = path.resolve(__dirname, 'src/data/puzzles/saved');

  return {
    name: 'puzzle-editor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__api/puzzles')) return next();

        if (req.method === 'GET') {
          if (!fs.existsSync(savedDir)) {
            fs.mkdirSync(savedDir, { recursive: true });
          }
          const files = fs.readdirSync(savedDir)
            .filter(f => f.endsWith('.json'))
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
              if (!fs.existsSync(savedDir)) {
                fs.mkdirSync(savedDir, { recursive: true });
              }
              const filepath = path.join(savedDir, safeName);

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
  base: '/gridlocked/',
  plugins: [puzzleEditorPlugin()],
});
