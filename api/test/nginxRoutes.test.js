import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNginx } from '../nginxRoutes.js';

const CONF = `
server { server_name chat.gigglin.tech;
  location / { proxy_pass http://librechat:3080; } }
server { server_name omni.gigglin.tech;
  location / { proxy_pass http://omniroute:8080; } }
`;

test('parseNginx maps host -> {url, upstreamHost, upstreamPort}', () => {
  const routes = parseNginx(CONF);
  const chat = routes.find((r) => r.upstreamHost === 'librechat');
  assert.equal(chat.url, 'https://chat.gigglin.tech');
  assert.equal(chat.upstreamPort, '3080');
  assert.equal(routes.length, 2);
});

test('parseNginx tolerates empty/garbage', () => {
  assert.deepEqual(parseNginx(''), []);
  assert.deepEqual(parseNginx('not nginx'), []);
});
