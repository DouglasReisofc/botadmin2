const path = require('path');

const settings = {
    // Configurações de conexão
    connection: {
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        maxReconnectAttempts: 5,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay: 30000,
        pairingCodeTimeout: 300000, // 5 minutos
        qrCodeTimeout: 60000 // 1 minuto
    },

    // Configurações de mensagens
    messaging: {
        maxRetryAttempts: 2,
        retryBaseDelay: 1000,
        maxFileSize: 64 * 1024 * 1024, // 64MB
        supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        supportedVideoTypes: ['video/mp4', 'video/webm', 'video/avi', 'video/mov'],
        supportedAudioTypes: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac'],
        supportedDocumentTypes: ['application/pdf', 'application/msword', 'text/plain'],
        maxPollOptions: 12,
        minPollOptions: 2
    },

    // Configurações de sessão
    session: {
        browser: ['BotAdmin', 'Chrome', '120.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        sessionCleanupOnError: true
    },

    // Configurações de logging
    logging: {
        enableFileLogging: true,
        logRetentionDays: 7,
        logLevel: process.env.LOG_LEVEL || 'info',
        enableDebugMode: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
    },

    // Configurações de API
    api: {
        port: process.env.PORT || 3000,
        requestSizeLimit: '50mb',
        enableCors: true,
        corsOrigins: '*',
        enableRequestLogging: true,
        healthCheckPath: '/health',
        statusPath: '/status'
    },

    // Configurações de segurança
    security: {
        validatePhoneNumbers: true,
        sanitizeInputs: true,
        enableRateLimiting: false,
        maxRequestsPerMinute: 60
    },

    // Configurações de paths
    paths: {
        sessions: path.join(__dirname, '..', 'auth'),
        stores: path.join(__dirname, '..', 'data', 'stores'),
        logs: path.join(__dirname, '..', 'logs'),
        temp: path.join(__dirname, '..', 'temp')
    },

    // Configurações de webhook
    webhook: {
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 2000
    }
};

// Função para validar configurações
function validateSettings() {
    const errors = [];

    // Validar timeouts
    if (settings.connection.connectTimeoutMs < 10000) {
        errors.push('connectTimeoutMs deve ser pelo menos 10000ms');
    }

    // Validar tamanho máximo de arquivo
    if (settings.messaging.maxFileSize > 100 * 1024 * 1024) {
        errors.push('maxFileSize não deve exceder 100MB');
    }

    // Validar porta
    if (settings.api.port < 1 || settings.api.port > 65535) {
        errors.push('Porta deve estar entre 1 e 65535');
    }

    if (errors.length > 0) {
        throw new Error(`Configurações inválidas: ${errors.join(', ')}`);
    }

    return true;
}

// Função para obter configuração específica
function getSetting(path) {
    const keys = path.split('.');
    let value = settings;

    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return undefined;
        }
    }

    return value;
}

// Função para definir configuração específica
function setSetting(path, newValue) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = settings;

    for (const key of keys) {
        if (!(key in target)) {
            target[key] = {};
        }
        target = target[key];
    }

    target[lastKey] = newValue;
}

// Validar configurações na inicialização
try {
    validateSettings();
    console.log('✅ Configurações validadas com sucesso');
} catch (error) {
    console.error('❌ Erro nas configurações:', error.message);
    process.exit(1);
}

module.exports = {
    settings,
    validateSettings,
    getSetting,
    setSetting
};
