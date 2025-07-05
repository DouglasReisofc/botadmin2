// Handler para eventos de connection.update do Baileys
const { BotApi } = require('../botApi');
const moment = require('moment-timezone');

// Rate limiting para atualizações do banco - evitar spam de updates
const updateLimiter = new Map();
const UPDATE_COOLDOWN = 2000; // 2 segundos entre atualizações do mesmo tipo

module.exports = async function handleConnectionUpdate({ event, data, server_url, apikey, instance }) {
    try {
        // Validação básica dos dados
        if (!instance || !data) {
            console.warn('⚠️ Dados inválidos recebidos no connection.update handler');
            return;
        }

        console.log(`[${instance}] 🔗 Processando connection.update:`, {
            connection: data.connection,
            lastDisconnect: data.lastDisconnect?.error?.message,
            qr: data.qr ? 'QR disponível' : 'Sem QR',
            pairingCode: data.pairingCode ? 'Código disponível' : 'Sem código'
        });

        // Rate limiting para atualizações do banco
        const limitKey = `${instance}_${data.connection}`;
        const lastUpdate = updateLimiter.get(limitKey);
        const now = Date.now();

        if (lastUpdate && (now - lastUpdate) < UPDATE_COOLDOWN) {
            console.log(`[${instance}] ⏱️ Rate limit ativo para connection.update - ignorando atualização duplicada`);
            return;
        }

        // Atualizar status da instância no banco
        if (instance) {
            try {
                const updateData = {
                    lastSeen: new Date(),
                    sessionStatus: data.connection || 'unknown'
                };

                // Se conectou com sucesso, salvar informações adicionais
                if (data.connection === 'open') {
                    updateData.sessionStatus = 'conectado';
                    updateData.lastConnected = new Date();
                    updateData.lastError = null; // Limpar erro anterior

                    console.log(`[${instance}] ✅ Conexão estabelecida com sucesso!`);
                }

                // Se desconectou, atualizar status
                if (data.connection === 'close') {
                    updateData.sessionStatus = 'desconectado';
                    updateData.lastDisconnected = new Date();

                    if (data.lastDisconnect?.error) {
                        updateData.lastError = data.lastDisconnect.error.message;

                        // Log específico para diferentes tipos de erro
                        const errorCode = data.lastDisconnect.error.output?.statusCode;
                        if (errorCode) {
                            updateData.lastErrorCode = errorCode;
                            console.log(`[${instance}] ❌ Conexão encerrada - Código: ${errorCode}`);
                        }
                    }

                    console.log(`[${instance}] ❌ Conexão encerrada`);
                }

                // Se está conectando
                if (data.connection === 'connecting') {
                    updateData.sessionStatus = 'conectando';
                    console.log(`[${instance}] 🔄 Conectando...`);
                }

                // Atualizar rate limiter
                updateLimiter.set(limitKey, now);

                // Tentar atualizar o banco com retry
                await updateDatabaseWithRetry(instance, updateData);

                console.log(`[${instance}] 💾 Status atualizado no banco: ${updateData.sessionStatus}`);

            } catch (dbErr) {
                console.error(`[${instance}] ❌ Erro ao atualizar banco:`, dbErr.message);
            }
        }

        // Log detalhado para diferentes tipos de conexão
        if (data.qr) {
            console.log(`[${instance}] 📱 QR Code gerado - aguardando escaneamento`);
        }

        if (data.pairingCode) {
            console.log(`[${instance}] 🔑 Código de pareamento: ${data.pairingCode}`);
        }

        if (data.connection === 'open') {
            console.log(`[${instance}] 🎉 WhatsApp conectado com sucesso!`);

            // Log adicional se for um novo login
            if (data.isNewLogin) {
                console.log(`[${instance}] 🆕 Novo login detectado`);
            }
        }

        if (data.connection === 'close' && data.lastDisconnect) {
            const reason = data.lastDisconnect.error?.message || 'Motivo desconhecido';
            const errorCode = data.lastDisconnect.error?.output?.statusCode;

            if (errorCode) {
                console.log(`[${instance}] 🚪 Conexão encerrada: ${reason} (Código: ${errorCode})`);
            } else {
                console.log(`[${instance}] 🚪 Conexão encerrada: ${reason}`);
            }
        }

    } catch (err) {
        console.error(`[${instance}] ❌ Erro no handler connection.update:`, err.message);
    }
};

// Função auxiliar para atualizar banco com retry
async function updateDatabaseWithRetry(instance, updateData, maxRetries = 3) {
    let retries = 0;

    while (retries < maxRetries) {
        try {
            await BotApi.updateOne({ instance }, updateData, { upsert: true });
            return; // Sucesso
        } catch (err) {
            retries++;
            console.warn(`[${instance}] ⚠️ Tentativa ${retries}/${maxRetries} falhou ao atualizar banco:`, err.message);

            if (retries >= maxRetries) {
                throw err; // Re-throw após esgotar tentativas
            }

            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
    }
}

// Limpeza periódica do rate limiter para evitar vazamento de memória
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of updateLimiter.entries()) {
        if (now - timestamp > UPDATE_COOLDOWN * 5) { // Limpar entradas antigas
            updateLimiter.delete(key);
        }
    }
}, 60000); // Limpeza a cada minuto
