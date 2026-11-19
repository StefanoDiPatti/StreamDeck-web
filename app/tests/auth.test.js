const test = require('node:test');
const assert = require('node:assert');
const auth = require('../server/auth');

test('solo IP di rete locale', function () {
  ['192.168.1.20', '10.0.0.5', '172.16.3.4', '172.31.255.1', '127.0.0.1', '::1', '::ffff:192.168.0.9'].forEach(function (ip) {
    assert.ok(auth.isPrivateIp(ip), ip);
  });
  ['8.8.8.8', '172.32.0.1', '151.12.4.5', '::ffff:93.184.216.34'].forEach(function (ip) {
    assert.ok(!auth.isPrivateIp(ip), ip);
  });
});

test('lettura cookie', function () {
  assert.deepStrictEqual(auth.parseCookies('a=1; dock_token=AB%20C'), { a: '1', dock_token: 'AB C' });
});

test('codice generato: 8 caratteri senza ambigui', function () {
  const t = auth.generateToken();
  assert.match(t, /^[A-HJ-NP-Z2-9]{8}$/);
});
