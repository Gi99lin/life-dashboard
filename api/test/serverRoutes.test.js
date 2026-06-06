import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('server wires infrastructure topology route', () => {
  assert.match(server, /collectTopology/);
  assert.match(server, /\/api\/infra\/topology/);
});
