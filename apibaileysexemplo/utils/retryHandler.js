class RetryHandler {
    constructor() {
        this.defaultOptions = {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
            jitter: true
        };
    }

    async executeWithRetry(fn, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        let lastError;

        for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
            try {
                const result = await fn(attempt);
                return result;
            } catch (error) {
                lastError = error;

                if (attempt === opts.maxAttempts) {
                    throw new Error(`Falha após ${opts.maxAttempts} tentativas: ${error.message}`);
                }

                const delay = this.calculateDelay(attempt, opts);
                console.warn(`Tentativa ${attempt} falhou: ${error.message}. Tentando novamente em ${delay}ms...`);

                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    calculateDelay(attempt, options) {
        let delay = options.baseDelay * Math.pow(options.backoffFactor, attempt - 1);
        delay = Math.min(delay, options.maxDelay);

        if (options.jitter) {
            delay += Math.random() * 1000;
        }

        return Math.floor(delay);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async retryPairingCode(requestFunction, number, options = {}) {
        const opts = {
            maxAttempts: 3,
            baseDelay: 2000,
            ...options
        };

        return this.executeWithRetry(async (attempt) => {
            console.log(`[PairingCode] Tentativa ${attempt} para número ${number}`);

            try {
                const code = await requestFunction(number);
                if (!code || typeof code !== 'string') {
                    throw new Error('Código de pareamento inválido recebido');
                }
                return code;
            } catch (error) {
                if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
                    throw new Error('Rate limit atingido - aguarde antes de tentar novamente');
                }
                throw error;
            }
        }, opts);
    }

    async retryMessageSend(sendFunction, options = {}) {
        const opts = {
            maxAttempts: 2,
            baseDelay: 1000,
            ...options
        };

        return this.executeWithRetry(async (attempt) => {
            try {
                return await sendFunction();
            } catch (error) {
                if (error.message.includes('not_connected') || error.message.includes('connection')) {
                    throw new Error('Conexão perdida - reconectando...');
                }
                throw error;
            }
        }, opts);
    }

    async retryConnection(connectFunction, options = {}) {
        const opts = {
            maxAttempts: 5,
            baseDelay: 3000,
            maxDelay: 30000,
            ...options
        };

        return this.executeWithRetry(async (attempt) => {
            console.log(`[Connection] Tentativa de conexão ${attempt}`);
            return await connectFunction();
        }, opts);
    }
}

module.exports = new RetryHandler();
