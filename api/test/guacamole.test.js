import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapGuacConnections } from '../guacamole.js';

test('mapGuacConnections extracts name, protocol, hostname and port', () => {
  const out = mapGuacConnections({
    '1': {
      name: 'work-vm',
      protocol: 'vnc',
      parameters: { hostname: '10.0.0.9', port: '5900' },
    },
    '2': {
      name: '',
      protocol: 'rdp',
      parameters: { hostname: '10.0.0.10', port: '3389' },
    },
  });

  assert.deepEqual(out, [
    { name: 'work-vm', protocol: 'vnc', hostname: '10.0.0.9', port: '5900' },
  ]);
});
