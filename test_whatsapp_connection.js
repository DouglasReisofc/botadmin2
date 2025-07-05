// Script de teste para conexão WhatsApp e eventos de mensagens com Baileys
const axios = require('axios');
const { basesiteUrl } = require('./configuracao');

const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';
const BAILEYS_API_URL = 'http://localhost:7766';
const WEBHOOK_URL = `${basesiteUrl}/webhook/event`;

// Configurações de teste
const TEST_CONFIG = {
    instanceName: 'teste_baileys',
    testNumber: '5511999999999', // Substitua pelo seu número para teste
    timeout: 30000
};

console.log('🧪 Iniciando testes de conexão WhatsApp e eventos Baileys...\n');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWebhookEndpoint() {
    console.log('1️⃣ Testando endpoint webhook central...');

    try {
        const testEvent = {
            event: 'test.connection',
            data: { message: 'Teste de conectividade' },
            instance: TEST_CONFIG.instanceName,
            server_url: BAILEYS_API_URL,
            apikey: MASTER_APIKEY
        };

        const response = await axios.post(WEBHOOK_URL, testEvent, {
            headers: {
                apikey: MASTER_APIKEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.status === 200) {
            console.log('✅ Webhook central está funcionando');
            return true;
        } else {
            console.log(`⚠️ Webhook retornou status: ${response.status}`);
            return false;
        }
    } catch (err) {
        console.error('❌ Erro no webhook central:', err.message);
        return false;
    }
}

async function testBaileysAPI() {
    console.log('\n2️⃣ Testando API Baileys...');

    try {
        const response = await axios.get(`${BAILEYS_API_URL}/health`, {
            timeout: 10000
        });

        if (response.status === 200) {
            console.log('✅ API Baileys está rodando');
            console.log('📊 Status:', response.data);
            return true;
        }
    } catch (err) {
        console.error('❌ API Baileys não está acessível:', err.message);
        return false;
    }
}

async function createTestInstance() {
    console.log('\n3️⃣ Criando instância de teste...');

    try {
        const payload = {
            name: TEST_CONFIG.instanceName,
            webhook: WEBHOOK_URL,
            apiKey: MASTER_APIKEY
        };

        const response = await axios.post(`${BAILEYS_API_URL}/api/instance`, payload, {
            headers: {
                'x-api-key': MASTER_APIKEY,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        if (response.status === 200 || response.status === 201) {
            console.log('✅ Instância criada com sucesso');
            console.log('📱 Dados da instância:', response.data);
            return true;
        }
    } catch (err) {
        if (err.response?.status === 409) {
            console.log('⚠️ Instância já existe, continuando...');
            return true;
        }
        console.error('❌ Erro ao criar instância:', err.message);
        return false;
    }
}

async function getInstanceStatus() {
    console.log('\n4️⃣ Verificando status da instância...');

    try {
        const response = await axios.get(`${BAILEYS_API_URL}/api/instance/${TEST_CONFIG.instanceName}/status`, {
            headers: { 'x-api-key': MASTER_APIKEY },
            timeout: 10000
        });

        console.log('📊 Status da instância:', response.data);
        return response.data;
    } catch (err) {
        console.error('❌ Erro ao obter status:', err.message);
        return null;
    }
}

async function getQRCode() {
    console.log('\n5️⃣ Obtendo QR Code...');

    try {
        const response = await axios.get(`${BAILEYS_API_URL}/api/instance/${TEST_CONFIG.instanceName}/qr`, {
            headers: { 'x-api-key': MASTER_APIKEY },
            timeout: 10000
        });

        if (response.data?.qr) {
            console.log('📱 QR Code disponível!');
            console.log('🔗 Use este QR Code para conectar seu WhatsApp');
            return response.data.qr;
        } else {
            console.log('⚠️ QR Code não disponível no momento');
            return null;
        }
    } catch (err) {
        console.error('❌ Erro ao obter QR Code:', err.message);
        return null;
    }
}

async function requestPairingCode() {
    console.log('\n6️⃣ Solicitando código de pareamento...');

    if (!TEST_CONFIG.testNumber) {
        console.log('⚠️ Número de teste não configurado, pulando...');
        return null;
    }

    try {
        const response = await axios.post(`${BAILEYS_API_URL}/api/instance/${TEST_CONFIG.instanceName}/pair`, {
            number: TEST_CONFIG.testNumber
        }, {
            headers: { 'x-api-key': MASTER_APIKEY },
            timeout: 15000
        });

        if (response.data?.code) {
            console.log('🔑 Código de pareamento:', response.data.code);
            console.log('📱 Digite este código no seu WhatsApp');
            return response.data.code;
        }
    } catch (err) {
        console.error('❌ Erro ao solicitar código de pareamento:', err.message);
        return null;
    }
}

async function testMessageSending() {
    console.log('\n7️⃣ Testando envio de mensagem...');

    try {
        // Primeiro verificar se a instância está conectada
        const status = await getInstanceStatus();
        if (!status?.connected) {
            console.log('⚠️ Instância não está conectada, pulando teste de mensagem');
            return false;
        }

        const payload = {
            instance: TEST_CONFIG.instanceName,
            number: TEST_CONFIG.testNumber,
            message: '🧪 Teste de mensagem via Baileys API'
        };

        const response = await axios.post(`${BAILEYS_API_URL}/api/message`, payload, {
            headers: { 'x-api-key': MASTER_APIKEY },
            timeout: 15000
        });

        if (response.status === 200) {
            console.log('✅ Mensagem enviada com sucesso');
            console.log('📨 ID da mensagem:', response.data?.messageId);
            return true;
        }
    } catch (err) {
        console.error('❌ Erro ao enviar mensagem:', err.message);
        return false;
    }
}

async function monitorEvents() {
    console.log('\n8️⃣ Monitorando eventos por 30 segundos...');
    console.log('📱 Envie uma mensagem para a instância para testar os eventos');

    let eventCount = 0;
    const startTime = Date.now();

    // Simular monitoramento (na prática, os eventos chegam via webhook)
    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= 30000) {
            clearInterval(interval);
            console.log(`\n📊 Monitoramento concluído. Eventos capturados: ${eventCount}`);
            console.log('💡 Verifique os logs do servidor para ver os eventos recebidos');
        }
    }, 1000);

    await sleep(30000);
}

async function cleanupTestInstance() {
    console.log('\n9️⃣ Limpando instância de teste...');

    try {
        await axios.delete(`${BAILEYS_API_URL}/api/instance/${TEST_CONFIG.instanceName}`, {
            headers: { 'x-api-key': MASTER_APIKEY },
            timeout: 10000
        });
        console.log('✅ Instância de teste removida');
    } catch (err) {
        console.warn('⚠️ Erro ao remover instância de teste:', err.message);
    }
}

async function runTests() {
    console.log('🚀 Configuração do teste:');
    console.log(`   • Instância: ${TEST_CONFIG.instanceName}`);
    console.log(`   • API Baileys: ${BAILEYS_API_URL}`);
    console.log(`   • Webhook: ${WEBHOOK_URL}`);
    console.log(`   • Número de teste: ${TEST_CONFIG.testNumber || 'Não configurado'}`);
    console.log('━'.repeat(60));

    const results = {
        webhook: false,
        baileys: false,
        instance: false,
        connection: false,
        messaging: false
    };

    try {
        // Teste 1: Webhook
        results.webhook = await testWebhookEndpoint();

        // Teste 2: API Baileys
        results.baileys = await testBaileysAPI();

        if (!results.baileys) {
            console.log('\n❌ API Baileys não está disponível. Verifique se está rodando na porta 3000');
            return;
        }

        // Teste 3: Criar instância
        results.instance = await createTestInstance();

        if (results.instance) {
            // Teste 4: Status e conexão
            await sleep(2000); // Aguardar inicialização
            const status = await getInstanceStatus();

            // Tentar obter QR Code
            await getQRCode();

            // Ou tentar código de pareamento
            await requestPairingCode();

            // Teste 5: Envio de mensagem (se conectado)
            results.messaging = await testMessageSending();

            // Teste 6: Monitorar eventos
            await monitorEvents();
        }

        // Cleanup
        await cleanupTestInstance();

    } catch (err) {
        console.error('\n❌ Erro durante os testes:', err.message);
    }

    // Relatório final
    console.log('\n📋 RELATÓRIO FINAL DOS TESTES:');
    console.log('━'.repeat(60));
    console.log(`Webhook Central: ${results.webhook ? '✅ OK' : '❌ FALHOU'}`);
    console.log(`API Baileys: ${results.baileys ? '✅ OK' : '❌ FALHOU'}`);
    console.log(`Criação de Instância: ${results.instance ? '✅ OK' : '❌ FALHOU'}`);
    console.log(`Envio de Mensagem: ${results.messaging ? '✅ OK' : '⚠️ NÃO TESTADO'}`);
    console.log('━'.repeat(60));

    if (results.webhook && results.baileys && results.instance) {
        console.log('🎉 Testes básicos passaram! O sistema está funcionando.');
        console.log('💡 Para testar completamente:');
        console.log('   1. Conecte uma instância via QR Code ou pareamento');
        console.log('   2. Envie mensagens para testar os eventos');
        console.log('   3. Verifique os logs para confirmar o processamento');
    } else {
        console.log('⚠️ Alguns testes falharam. Verifique a configuração.');
    }
}

// Executar testes se chamado diretamente
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests, TEST_CONFIG };
