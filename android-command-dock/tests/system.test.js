'use strict';
const test = require('node:test');
const assert = require('node:assert');
const system = require('../server/services/system');

test('riga di nvidia-smi (csv) -> dati della GPU', function () {
  assert.deepStrictEqual(system._parseNvidia('NVIDIA GeForce RTX 4070, 36, 50.4, 2048, 12282'),
    { name: 'NVIDIA GeForce RTX 4070', usage: 36, temp: 50, memUsedMb: 2048, memTotalMb: 12282 });
  assert.strictEqual(system._parseNvidia(''), null);
  assert.strictEqual(system._parseNvidia('[N/A]'), null);
  system.stop();
});
