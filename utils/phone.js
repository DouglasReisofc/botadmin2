function normalizeJid(id) {
  if (!id) return '';
  id = id.toString();
  id = id.replace(/@.+$/, '');
  id = id.replace(/\D/g, '');
  if (id.startsWith('55') && id.length >= 12) {
    const ddd = id.slice(2, 4);
    let rest = id.slice(4);
    if (rest.length === 9 && (rest[0] === '9' || rest[0] === '0')) {
      rest = rest.slice(1);
    } else if (rest.length > 8) {
      rest = rest.slice(-8);
    }
    return `55${ddd}${rest}`;
  }
  return id;
}

module.exports = { normalizeJid };
