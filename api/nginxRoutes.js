import { readFileSync } from 'fs';

// Pure nginx config parser: extract server_name -> proxy_pass upstreams.
export function parseNginx(conf = '') {
  const routes = [];
  const blocks = String(conf).split(/server\s*\{/).slice(1);

  for (const block of blocks) {
    const name = block.match(/server_name\s+([^;]+);/)?.[1];
    const pass = block.match(/proxy_pass\s+https?:\/\/([a-z0-9_.-]+):(\d+)/i);
    if (!name || !pass?.[1]) continue;

    const host = name.trim().split(/\s+/)[0];
    routes.push({
      url: `https://${host}`,
      host,
      upstreamHost: pass[1],
      upstreamPort: pass[2],
    });
  }

  return routes;
}

export function readNginxRoutes(path = process.env.NGINX_CONF_PATH) {
  if (!path) return [];
  try {
    return parseNginx(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}
