function formatPairCode(code) {
  try {
    // Validar se o código existe
    if (!code) {
      console.warn('⚠️ Código de pareamento vazio recebido');
      return null;
    }

    // Converter para string se necessário
    const codeStr = String(code).trim();

    // Remover caracteres não numéricos
    const cleanCode = codeStr.replace(/\D/g, '');

    // Validar comprimento
    if (cleanCode.length !== 8) {
      console.warn(`⚠️ Código de pareamento com comprimento inválido: ${cleanCode.length} (esperado: 8)`);
      return codeStr; // Retorna o código original se não for 8 dígitos
    }

    // Formatar com hífen
    const formatted = cleanCode.slice(0, 4) + '-' + cleanCode.slice(4);

    console.log(`✅ Código formatado: ${cleanCode} -> ${formatted}`);
    return formatted;

  } catch (error) {
    console.error('❌ Erro ao formatar código de pareamento:', error.message);
    return code; // Retorna o código original em caso de erro
  }
}

function validatePairCode(code) {
  if (!code) return false;

  const cleanCode = String(code).replace(/\D/g, '');
  return cleanCode.length === 8 && /^\d{8}$/.test(cleanCode);
}

function generatePairCodeRegex() {
  // Regex para detectar códigos de pareamento em diferentes formatos
  return /\b\d{4}[-\s]?\d{4}\b/g;
}

function extractPairCodeFromText(text) {
  if (!text) return null;

  const regex = generatePairCodeRegex();
  const matches = text.match(regex);

  if (matches && matches.length > 0) {
    return formatPairCode(matches[0]);
  }

  return null;
}

function isPairCodeExpired(timestamp, expirationMinutes = 5) {
  if (!timestamp) return true;

  const now = new Date();
  const codeTime = new Date(timestamp);
  const diffMinutes = (now - codeTime) / (1000 * 60);

  return diffMinutes > expirationMinutes;
}

module.exports = {
  formatPairCode,
  validatePairCode,
  generatePairCodeRegex,
  extractPairCodeFromText,
  isPairCodeExpired
};
