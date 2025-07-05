const { startInstance, shutdownAllInstances, getInstancesStats, getSession, getInstanceStatus } = require('./sessions/sessionManager');

// Configurações do teste
const TEST_CONFIG = {
    instanceName: 'test',
    usePairingCode: false,
    phoneNumber: null, // Definir se usar pairing code
    timeout: 300000 // 5 minutos para conectar
};

let isShuttingDown = false;

async function testStart() {
    try {
        console.log('🚀 Iniciando teste da instância WhatsApp...');
        console.log('━'.repeat(60));
        console.log(`📋 Configurações do teste:`);
        console.log(`   • Nome da instância: ${TEST_CONFIG.instanceName}`);
        console.log(`   • Usar pairing code: ${TEST_CONFIG.usePairingCode}`);
        console.log(`   • Número (se pairing): ${TEST_CONFIG.phoneNumber || 'N/A'}`);
        console.log(`   • Timeout: ${TEST_CONFIG.timeout / 1000}s`);
        console.log('━'.repeat(60));

        // Iniciar instância
        console.log(`\n[${TEST_CONFIG.instanceName}] 🚀 Iniciando instância de teste...`);

        const session = await startInstance(
            TEST_CONFIG.instanceName,
            TEST_CONFIG.usePairingCode,
            TEST_CONFIG.phoneNumber
        );

        if (TEST_CONFIG.usePairingCode && TEST_CONFIG.phoneNumber) {
            console.log(`\n[${TEST_CONFIG.instanceName}] 🔑 Modo pairing code ativado`);
            console.log(`[${TEST_CONFIG.instanceName}] 📱 Aguarde o código de pareamento aparecer...`);
        } else {
            console.log(`\n[${TEST_CONFIG.instanceName}] 📱 Modo QR Code ativado`);
            console.log(`[${TEST_CONFIG.instanceName}] 📱 Escaneie o QR Code com seu WhatsApp`);
        }

        // Monitorar status da conexão
        console.log(`\n[${TEST_CONFIG.instanceName}] ⏱️ Aguardando conexão (timeout: ${TEST_CONFIG.timeout / 1000}s)...`);

        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (isShuttingDown) {
                clearInterval(checkInterval);
                return;
            }

            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, TEST_CONFIG.timeout - elapsed);

            if (remaining === 0) {
                clearInterval(checkInterval);
                console.log(`\n[${TEST_CONFIG.instanceName}] ⏰ Timeout atingido!`);
                console.log(`[${TEST_CONFIG.instanceName}] ❌ Não foi possível conectar em ${TEST_CONFIG.timeout / 1000}s`);
                gracefulExit();
                return;
            }

            const currentSession = getSession(TEST_CONFIG.instanceName);
            const status = currentSession?.status || getInstanceStatus(TEST_CONFIG.instanceName);
            console.log(`[${TEST_CONFIG.instanceName}] ⏳ Aguardando... (${Math.round(remaining / 1000)}s restantes) - Status: ${status}`);

            if (status === 'open') {
                clearInterval(checkInterval);
                console.log(`\n🎉 [${TEST_CONFIG.instanceName}] ✅ CONEXÃO ESTABELECIDA COM SUCESSO! 🎉`);
                console.log(`[${TEST_CONFIG.instanceName}] ⏱️ Tempo para conectar: ${Math.round((Date.now() - startTime) / 1000)}s`);

                // Mostrar informações da sessão
                const finalSession = getSession(TEST_CONFIG.instanceName);
                if (finalSession?.number) {
                    console.log(`[${TEST_CONFIG.instanceName}] 📞 Número: ${finalSession.number}`);
                }
                if (finalSession?.sock?.user?.name) {
                    console.log(`[${TEST_CONFIG.instanceName}] 👤 Usuário: ${finalSession.sock.user.name}`);
                }

                console.log(`\n[${TEST_CONFIG.instanceName}] 🔄 Teste concluído! Pressione Ctrl+C para encerrar.`);
            }
        }, 5000); // Verificar a cada 5 segundos

        // Timeout geral
        setTimeout(() => {
            if (!isShuttingDown) {
                clearInterval(checkInterval);
                console.log(`\n[${TEST_CONFIG.instanceName}] ⏰ Timeout geral atingido!`);
                gracefulExit();
            }
        }, TEST_CONFIG.timeout);

    } catch (err) {
        console.error(`\n❌ Erro ao iniciar instância de teste:`, err.message);
        console.error('Stack trace:', err.stack);
        gracefulExit();
    }
}

async function gracefulExit() {
    if (isShuttingDown) {
        console.log('⚠️ Shutdown já em andamento...');
        return;
    }

    isShuttingDown = true;
    console.log('\n🛑 Encerrando teste...');

    try {
        await shutdownAllInstances();
        console.log('✅ Teste encerrado com sucesso');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro durante encerramento:', err.message);
        process.exit(1);
    }
}

// Tratamento de sinais para encerramento graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Recebido SIGINT (Ctrl+C)');
    gracefulExit();
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Recebido SIGTERM');
    gracefulExit();
});

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('\n❌ Exceção não capturada:', err);
    gracefulExit();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ Promise rejeitada não tratada:', reason);
    gracefulExit();
});

// Função para alterar configurações via argumentos da linha de comando
function parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--pairing':
            case '-p':
                TEST_CONFIG.usePairingCode = true;
                if (args[i + 1] && !args[i + 1].startsWith('-')) {
                    TEST_CONFIG.phoneNumber = args[i + 1];
                    i++; // Pular o próximo argumento
                }
                break;
            case '--instance':
            case '-i':
                if (args[i + 1] && !args[i + 1].startsWith('-')) {
                    TEST_CONFIG.instanceName = args[i + 1];
                    i++;
                }
                break;
            case '--timeout':
            case '-t':
                if (args[i + 1] && !args[i + 1].startsWith('-')) {
                    TEST_CONFIG.timeout = parseInt(args[i + 1]) * 1000;
                    i++;
                }
                break;
            case '--help':
            case '-h':
                console.log('Uso: node testStartInstance.js [opções]');
                console.log('');
                console.log('Opções:');
                console.log('  -p, --pairing [número]    Usar pairing code (opcionalmente com número)');
                console.log('  -i, --instance <nome>     Nome da instância (padrão: test)');
                console.log('  -t, --timeout <segundos>  Timeout em segundos (padrão: 300)');
                console.log('  -h, --help               Mostrar esta ajuda');
                console.log('');
                console.log('Exemplos:');
                console.log('  node testStartInstance.js                    # QR Code');
                console.log('  node testStartInstance.js -p 5511999999999   # Pairing code');
                console.log('  node testStartInstance.js -i meubot -t 600   # Instância personalizada');
                process.exit(0);
        }
    }
}

// Iniciar teste
console.log('🧪 Teste de Instância WhatsApp - Baileys API');
console.log('═'.repeat(60));

parseArgs();
testStart();
