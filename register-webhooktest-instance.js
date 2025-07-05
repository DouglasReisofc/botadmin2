// Script para registrar a instância "webhooktest" no banco de dados principal
const mongoose = require('mongoose');
const { BotApi } = require('./db/botApi');
const { Server } = require('./db/server');

async function registerWebhookTestInstance() {
    try {
        // Conectar ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/botadmin', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ Conectado ao MongoDB');

        // Verificar se já existe um servidor padrão
        let server = await Server.findOne({ nome: 'Servidor Local' });
        if (!server) {
            server = new Server({
                nome: 'Servidor Local',
                baseUrl: 'http://localhost:7766',
                globalapikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU',
                sessionLimit: 0,
                status: true
            });
            await server.save();
            console.log('✅ Servidor padrão criado');
        }

        // Verificar se a instância já existe
        const existingInstance = await BotApi.findOne({ instance: 'webhooktest' });
        if (existingInstance) {
            console.log('⚠️ Instância "webhooktest" já existe no banco');

            // Atualizar dados da instância existente
            existingInstance.baseUrl = 'http://localhost:3000';
            existingInstance.webhook = 'http://localhost:7766/webhook/event';
            existingInstance.sessionStatus = 'conectado';
            existingInstance.lastSeen = new Date();
            existingInstance.updatedAt = new Date();

            await existingInstance.save();
            console.log('✅ Instância "webhooktest" atualizada');
        } else {
            // Criar nova instância
            const newInstance = new BotApi({
                nome: 'Instância de Teste WebHook',
                baseUrl: 'http://localhost:3000',
                webhook: 'http://localhost:7766/webhook/event',
                globalapikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU',
                apikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU',
                instance: 'webhooktest',
                server: server._id,
                gruposlimite: 10,
                status: true,
                sessionStatus: 'conectado',
                lastSeen: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await newInstance.save();
            console.log('✅ Instância "webhooktest" registrada no banco de dados');
        }

        console.log('\n🎉 Registro concluído com sucesso!');
        console.log('📋 Detalhes da instância:');

        const instance = await BotApi.findOne({ instance: 'webhooktest' }).populate('server');
        console.log(`   Nome: ${instance.nome}`);
        console.log(`   Instância: ${instance.instance}`);
        console.log(`   Base URL: ${instance.baseUrl}`);
        console.log(`   Webhook: ${instance.webhook}`);
        console.log(`   Status: ${instance.status ? 'Ativo' : 'Inativo'}`);
        console.log(`   Status da Sessão: ${instance.sessionStatus}`);
        console.log(`   Servidor: ${instance.server.nome}`);

    } catch (error) {
        console.error('❌ Erro ao registrar instância:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado do MongoDB');
        process.exit(0);
    }
}

// Executar o script
registerWebhookTestInstance();
