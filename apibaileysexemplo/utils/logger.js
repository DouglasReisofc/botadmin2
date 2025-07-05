const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    return JSON.stringify(logEntry);
  }

  writeToFile(filename, content) {
    try {
      const filePath = path.join(this.logDir, filename);
      fs.appendFileSync(filePath, content + '\n');
    } catch (err) {
      console.error('Erro ao escrever log:', err.message);
    }
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [api] ${message}`;

    console.log(formattedMessage);

    if (data) {
      console.log('Data:', data);
    }

    // Salvar em arquivo
    const logContent = this.formatMessage('INFO', message, data);
    this.writeToFile('app.log', logContent);
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [api] ❌ ERROR: ${message}`;

    console.error(formattedMessage);

    if (error) {
      console.error('Error details:', error);
    }

    // Salvar em arquivo de erro
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : null;

    const logContent = this.formatMessage('ERROR', message, errorData);
    this.writeToFile('error.log', logContent);
  }

  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [api] ⚠️ WARN: ${message}`;

    console.warn(formattedMessage);

    if (data) {
      console.warn('Data:', data);
    }

    const logContent = this.formatMessage('WARN', message, data);
    this.writeToFile('app.log', logContent);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [api] 🐛 DEBUG: ${message}`;

      console.log(formattedMessage);

      if (data) {
        console.log('Debug data:', data);
      }

      const logContent = this.formatMessage('DEBUG', message, data);
      this.writeToFile('debug.log', logContent);
    }
  }

  connection(instanceName, event, data = null) {
    const message = `[${instanceName}] Connection event: ${event}`;
    this.log(message, data);

    // Log específico para conexões
    const connectionLog = this.formatMessage('CONNECTION', message, {
      instance: instanceName,
      event,
      data
    });
    this.writeToFile('connections.log', connectionLog);
  }

  message(instanceName, direction, target, type = 'text', success = true) {
    const status = success ? '✅' : '❌';
    const message = `[${instanceName}] ${status} Message ${direction} ${target} (${type})`;

    this.log(message);

    // Log específico para mensagens
    const messageLog = this.formatMessage('MESSAGE', message, {
      instance: instanceName,
      direction,
      target,
      type,
      success
    });
    this.writeToFile('messages.log', messageLog);
  }

  pairCode(instanceName, number, code, success = true) {
    const status = success ? '✅' : '❌';
    const message = `[${instanceName}] ${status} Pair code for ${number}: ${code}`;

    this.log(message);

    // Log específico para códigos de pareamento
    const pairLog = this.formatMessage('PAIR_CODE', message, {
      instance: instanceName,
      number,
      code,
      success
    });
    this.writeToFile('pairing.log', pairLog);
  }

  // Método para limpeza de logs antigos
  cleanOldLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`Log antigo removido: ${file}`);
        }
      });
    } catch (err) {
      console.error('Erro ao limpar logs antigos:', err.message);
    }
  }
}

const logger = new Logger();

// Limpar logs antigos na inicialização
logger.cleanOldLogs();

// Função de compatibilidade com o código existente
function log(message, data = null) {
  logger.log(message, data);
}

module.exports = {
  log,
  logger,
  Logger
};
