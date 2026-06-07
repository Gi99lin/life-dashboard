// Offline design/preview harness — renders the dashboard with fake data so it
// can be worked on without the API/backend. Run: npx vite --config vite.mock.config.js
import { defineConfig } from 'vite';
import {
  buildForecast,
  buildMetrics,
  buildSchedule,
  buildServerMetrics,
  buildTopology,
  scriptedAnalyze,
} from './src/demo/demoData.js';

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const mockApi = () => ({
  name: 'mock-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url.split('?')[0];
      const json = (obj) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
      };

      if (url === '/api/auth-check') { res.statusCode = 200; return res.end('ok'); }
      if (url === '/api/sync' || url === '/api/metrics') return json(buildMetrics());
      if (url === '/api/analyze') return json(scriptedAnalyze(await readJsonBody(req)));
      if (url === '/api/forecast') return json(buildForecast());
      if (url === '/api/schedule') return json(buildSchedule());
      if (url.startsWith('/api/infra/topology')) return json(buildTopology());
      if (url === '/api/metrics/server') return json(buildServerMetrics());
      if (url.startsWith('/socket.io')) { res.statusCode = 200; return res.end(''); }
      next();
    });
  },
});

export default defineConfig({
  root: '.',
  plugins: [mockApi()],
  server: { port: 5174, open: false },
});
