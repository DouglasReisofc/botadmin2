const assert = require('assert');
const { normalizeJid } = require('../utils/phone');

assert.strictEqual(normalizeJid('5561987654321'), '556187654321');
assert.strictEqual(normalizeJid('559912345678'), '559912345678');
console.log('All tests passed');
