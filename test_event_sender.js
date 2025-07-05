const axios = require('axios');

async function sendTestEvent() {
    const webhookUrl = 'http://localhost:7766/webhook/event'; // Ajuste se necessário
    const testEvent = {
        event: 'message.upsert',
        data: {
            key: {
                remoteJid: '559295333643@s.whatsapp.net',
                id: 'test-message-id',
                fromMe: false,
                participant: '559295333643@s.whatsapp.net'
            },
            message: {
                conversation: '!menu'
            },
            pushName: 'Test User'
        },
        instance: '559295333643',
        apikey: ''
    };

    try {
        const response = await axios.post(webhookUrl, testEvent, {
            headers: { apikey: 'AIAO1897AHJAKACMC817ADOU' }
        });
        console.log('Webhook response status:', response.status);
        console.log('Webhook response data:', response.data);
    } catch (error) {
        console.error('Error sending test event:', error.message);
    }
}

sendTestEvent();
