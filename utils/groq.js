const DEFAULT_KEY = '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';

function parseGroqKeys(str='') {
  return str
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(k => k.length);
}

function randomGroqKey(str='') {
  const keys = parseGroqKeys(str);
  if (!keys.length) return DEFAULT_KEY;
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx];
}

module.exports = {
  DEFAULT_KEY,
  parseGroqKeys,
  randomGroqKey
};
