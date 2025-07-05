const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

class ConnectionManager {
    constructor() {
        this.reconnectAttempts = new Map();
        this.maxReconnectAttempts = 5; // Reduzido para evitar loops
        this.baseDelay = 5000; // Aumentado para 5 segundos
        this.maxDelay = 120000; // Aumentado para 2 minutos
        this.connectionTimeouts = new Map();
        this.healthCheckIntervals = new Map();
        this.lastConnectionAttempt = new Map(); // Rate limiting
        this.connectionStates = new Map(); // Rastrear estados
        this.minDelayBetweenAttempts = 10000; // 10 segundos mínimo entre tentativas
    }

    calculateBackoffDelay(attempts) {
        // Exponential backoff com jitter
        const exponentialDelay = Math.min(this.baseDelay * Math.pow(1.5, attempts), this.maxDelay);
        const jitter = Math.random() * 2000; // Jitter de até 2 segundos
        return exponentialDelay + jitter;
    }

    shouldReconnect(lastDisconnect, instanceName) {
        if (!lastDisconnect?.error) return true;

        const statusCode = new Boom(lastDisconnect.error)?.output?.statusCode;
        const errorMessage = lastDisconnect.error?.message || '';

        // Rate limiting - verificar se não estamos tentando muito rápido
        const lastAttempt = this.lastConnectionAttempt.get(instanceName);
        const now = Date.now();
        if (lastAttempt && (now - lastAttempt) < this.minDelayBetweenAttempts) {
            console.log(`[${instanceName}] ⏱️ Rate limit ativo - aguardando ${Math.round((this.minDelayBetweenAttempts - (now - lastAttempt)) / 1000)}s`);
            return false;
        }

        // Não reconectar em casos específicos
        const noReconnectCodes = [
            DisconnectReason.loggedOut,
            DisconnectReason.multideviceMismatch,
            DisconnectReason.forbidden,
            DisconnectReason.badSession // Movido para não reconectar - evita loops
        ];

        // Casos especiais baseados na mensagem de erro
        const noReconnectMessages = [
            'Connection Closed',
            'Logged Out',
            'Multi-device mismatch',
            'Forbidden',
            'Bad Session'
        ];

        const shouldNotReconnect = noReconnectCodes.includes(statusCode) ||
            noReconnectMessages.some(msg => errorMessage.includes(msg));

        if (shouldNotReconnect) {
            console.log(`[${instanceName}] ⛔ Não reconectando - Código: ${statusCode}, Mensagem: ${errorMessage}`);
            return false;
        }

        // Casos onde devemos reconectar com cuidado
        const reconnectCodes = [
            DisconnectReason.connectionClosed,
            DisconnectReason.connectionLost,
            DisconnectReason.connectionReplaced,
            DisconnectReason.timedOut
        ];

        // Stream Error (515) - tratar com cuidado especial
        if (statusCode === 515) {
            const attempts = this.reconnectAttempts.get(instanceName) || 0;
            if (attempts >= 2) {
                console.log(`[${instanceName}] ⛔ Muitas tentativas para Stream Error - parando reconexão`);
                return false;
            }
            console.log(`[${instanceName}] 🔄 Stream Error detectado - permitindo reconexão controlada`);
            return true;
        }

        // QR timeout (408) - não reconectar automaticamente
        if (statusCode === 408 && errorMessage.includes('QR refs attempts ended')) {
            console.log(`[${instanceName}] ⛔ QR timeout - não reconectando automaticamente`);
            return false;
        }

        return reconnectCodes.includes(statusCode) || statusCode === undefined;
    }

    async handleReconnection(instanceName, restartFunction) {
        const attempts = this.reconnectAttempts.get(instanceName) || 0;

        // Verificar rate limiting
        const lastAttempt = this.lastConnectionAttempt.get(instanceName);
        const now = Date.now();
        if (lastAttempt && (now - lastAttempt) < this.minDelayBetweenAttempts) {
            console.log(`[${instanceName}] ⏱️ Rate limit ativo - ignorando tentativa de reconexão`);
            return false;
        }

        if (attempts >= this.maxReconnectAttempts) {
            console.error(`[${instanceName}] ❌ Máximo de tentativas de reconexão atingido (${attempts})`);
            this.reconnectAttempts.delete(instanceName);
            this.lastConnectionAttempt.delete(instanceName);
            this.connectionStates.delete(instanceName);
            this.clearTimeouts(instanceName);
            return false;
        }

        // Verificar se já existe uma reconexão em andamento
        if (this.connectionTimeouts.has(instanceName)) {
            console.log(`[${instanceName}] ⚠️ Reconexão já em andamento - ignorando nova tentativa`);
            return false;
        }

        const delay = this.calculateBackoffDelay(attempts);
        console.log(`[${instanceName}] 🔄 Tentativa de reconexão ${attempts + 1}/${this.maxReconnectAttempts} em ${Math.round(delay / 1000)}s`);

        this.reconnectAttempts.set(instanceName, attempts + 1);
        this.lastConnectionAttempt.set(instanceName, now);
        this.connectionStates.set(instanceName, 'reconnecting');

        const timeoutId = setTimeout(async () => {
            try {
                console.log(`[${instanceName}] 🚀 Executando reconexão...`);
                this.connectionStates.set(instanceName, 'connecting');

                await restartFunction();

                // Reset em caso de sucesso
                this.reconnectAttempts.delete(instanceName);
                this.connectionStates.set(instanceName, 'connected');
                this.clearTimeouts(instanceName);
                console.log(`[${instanceName}] ✅ Reconexão bem-sucedida`);
            } catch (err) {
                console.error(`[${instanceName}] ❌ Falha na reconexão:`, err.message);
                this.connectionStates.set(instanceName, 'failed');
                this.clearTimeouts(instanceName);

                // Não tentar novamente automaticamente - evitar loops
                console.log(`[${instanceName}] ⏹️ Parando tentativas automáticas de reconexão`);
            }
        }, delay);

        this.connectionTimeouts.set(instanceName, timeoutId);
        return true;
    }

    resetReconnectAttempts(instanceName) {
        this.reconnectAttempts.delete(instanceName);
        this.lastConnectionAttempt.delete(instanceName);
        this.connectionStates.set(instanceName, 'connected');
        this.clearTimeouts(instanceName);
        console.log(`[${instanceName}] 🔄 Contador de reconexão resetado`);
    }

    clearTimeouts(instanceName) {
        const timeoutId = this.connectionTimeouts.get(instanceName);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.connectionTimeouts.delete(instanceName);
        }

        const intervalId = this.healthCheckIntervals.get(instanceName);
        if (intervalId) {
            clearInterval(intervalId);
            this.healthCheckIntervals.delete(instanceName);
        }
    }

    getConnectionHealth(sock) {
        if (!sock) return 'disconnected';

        try {
            // Verificações mais detalhadas
            const wsState = sock.ws?.readyState;
            const hasUser = sock.user?.id;
            const isAuthenticated = sock.authState?.creds?.registered;

            if (wsState === 1 && hasUser && isAuthenticated) {
                return 'healthy';
            } else if (wsState === 0) {
                return 'connecting';
            } else if (wsState === 2) {
                return 'closing';
            } else if (wsState === 3) {
                return 'closed';
            } else {
                return 'unhealthy';
            }
        } catch (err) {
            console.error('Erro ao verificar saúde da conexão:', err.message);
            return 'error';
        }
    }

    async waitForConnection(sock, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let checkCount = 0;

            const checkConnection = () => {
                checkCount++;
                const elapsed = Date.now() - startTime;

                if (elapsed > timeout) {
                    reject(new Error(`Timeout aguardando conexão após ${timeout}ms (${checkCount} verificações)`));
                    return;
                }

                const health = this.getConnectionHealth(sock);
                console.log(`Verificação ${checkCount}: Saúde da conexão = ${health}`);

                if (health === 'healthy') {
                    resolve(true);
                } else if (health === 'error' || health === 'closed') {
                    reject(new Error(`Conexão falhou - Status: ${health}`));
                } else {
                    // Continuar verificando
                    setTimeout(checkConnection, 1000); // Verificar a cada segundo
                }
            };

            checkConnection();
        });
    }

    // Função para monitorar saúde da conexão continuamente
    startHealthMonitoring(instanceName, sock, onUnhealthy) {
        this.clearTimeouts(instanceName); // Limpar monitoramento anterior

        const intervalId = setInterval(() => {
            const health = this.getConnectionHealth(sock);

            if (health === 'unhealthy' || health === 'error' || health === 'closed') {
                console.warn(`[${instanceName}] ⚠️ Conexão não saudável detectada: ${health}`);
                this.clearTimeouts(instanceName);
                if (onUnhealthy) {
                    onUnhealthy(health);
                }
            }
        }, 30000); // Verificar a cada 30 segundos

        this.healthCheckIntervals.set(instanceName, intervalId);
    }

    // Função para obter estatísticas de reconexão
    getReconnectionStats() {
        const stats = {
            activeReconnections: this.reconnectAttempts.size,
            totalAttempts: 0,
            instances: {}
        };

        for (const [instanceName, attempts] of this.reconnectAttempts) {
            stats.totalAttempts += attempts;
            stats.instances[instanceName] = {
                attempts,
                maxAttempts: this.maxReconnectAttempts,
                hasTimeout: this.connectionTimeouts.has(instanceName)
            };
        }

        return stats;
    }

    // Verificar se instância está em estado válido para reconexão
    canReconnect(instanceName) {
        const state = this.connectionStates.get(instanceName);
        const hasTimeout = this.connectionTimeouts.has(instanceName);
        const lastAttempt = this.lastConnectionAttempt.get(instanceName);
        const now = Date.now();

        // Não permitir se já está reconectando
        if (state === 'reconnecting' || state === 'connecting' || hasTimeout) {
            return false;
        }

        // Rate limiting
        if (lastAttempt && (now - lastAttempt) < this.minDelayBetweenAttempts) {
            return false;
        }

        return true;
    }

    // Obter estado atual da conexão
    getConnectionState(instanceName) {
        return this.connectionStates.get(instanceName) || 'unknown';
    }

    // Cleanup completo para uma instância
    cleanup(instanceName) {
        this.reconnectAttempts.delete(instanceName);
        this.lastConnectionAttempt.delete(instanceName);
        this.connectionStates.delete(instanceName);
        this.clearTimeouts(instanceName);
        console.log(`[${instanceName}] 🧹 ConnectionManager cleanup concluído`);
    }
}

module.exports = new ConnectionManager();
