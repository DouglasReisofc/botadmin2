const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');

const sessionDir = './auth';
const usePairingCode = true;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`🔄 Usando WhatsApp v${version.join('.')}, última versão: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: ['Ubuntu', 'Chrome', '110.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, pairingCode, qr } = update;

        if (connection === 'open') {
            console.log('✅ Conectado com sucesso!');
            rl.close();
        }

        if (qr && !usePairingCode) {
            console.log('📷 Escaneie o QR code abaixo:');
            qrcode.generate(qr, { small: true });
        }

        if (pairingCode) {
            console.log('🔐 Pairing code gerado:', pairingCode);
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`❌ Conexão encerrada. Código: ${statusCode}`);

            switch (statusCode) {
                case DisconnectReason.badSession:
                    console.log('🧹 Sessão inválida. Apague a pasta auth e tente novamente.');
                    process.exit();
                case DisconnectReason.loggedOut:
                    console.log('🚪 Você foi desconectado. Apague a pasta auth e reconecte.');
                    process.exit();
                case 401:
                    if (usePairingCode) {
                        console.log('⚠️ Pairing code rejeitado. Tentando QR code...');
                        rl.close();
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        await startBot(false);
                    }
                    break;
                default:
                    console.log('🔁 Tentando reconectar...');
                    await startBot();
            }
        }
    });

    if (usePairingCode && !state.creds.registered) {
        const number = await ask('📱 Digite seu número completo (ex: 5599999999999): ');
        try {
            const code = await sock.requestPairingCode(number.trim());
            console.log('📱 Código de pareamento solicitado:', code);
        } catch (err) {
            console.error('❌ Erro ao solicitar pairing code:', err.message);
        }
    }
}

startBot();
