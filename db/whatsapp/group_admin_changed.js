const { sendText } = require('../waActions');

const { BotConfig } = require('../botConfig');

function normalizeAdminChange(data) {
    if (!data || typeof data !== 'object') return {};
    if (data.chatId && data.type) return data;
    const chatId = data.chatId || data.id?.remote || null;
    const type = data.type || data.subtype || null;
    const author = data.author || data.id?.participant || null;
    return { ...data, chatId, type, author };
}

// Caixa de log no terminal
function printCaixaEventoAdmin({ chatId, type, author }) {
    const cor = '\x1b[35m';
    const reset = '\x1b[0m';
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR');
    const dataAtual = now.toLocaleDateString('pt-BR');

    const acao = type === 'promote' ? 'PROMOVIDO' : 'REBAIXADO';
    const emoji = type === 'promote' ? '🛡️' : '⚠️';

    const linhas = [
        `${emoji} Bot ${acao} no grupo`,
        `👥 Grupo: ${chatId}`,
        `👤 Autor da ação: ${author || '-'}`,
        `📅 Data: ${dataAtual}   ⏰ Hora: ${hora}`
    ];

    const largura = Math.max(...linhas.map(l => l.length)) + 4;
    const borda = '─'.repeat(largura);

    console.log(`${cor}┌${borda}┐`);
    for (const linha of linhas) {
        const espaco = largura - linha.length - 1;
        console.log(`│ ${linha}${' '.repeat(espaco)}│`);
    }
    console.log(`└${borda}┘${reset}`);
}


module.exports = async function handleGroupAdminChanged({ data, server_url, apikey, instance }) {
    data = normalizeAdminChange(data);
    const { chatId, type, author } = data;

    try {
        const recipients = Array.isArray(data.recipientIds)
            ? data.recipientIds
            : data.recipientId
            ? [data.recipientId]
            : [];
        const botJid = `${instance}@c.us`;
        const bot = await BotConfig.findOne({ groupId: chatId });

        if (bot) {
            let changed = false;
            for (const jid of recipients) {
                const idx = bot.participantes.findIndex(p => p.id === jid);
                const novoStatus = type === 'promote' ? 'admin' : 'member';
                if (idx >= 0) {
                    if (bot.participantes[idx].admin !== novoStatus) {
                        bot.participantes[idx].admin = novoStatus;
                        changed = true;
                    }
                } else {
                    bot.participantes.push({ id: jid, admin: novoStatus });
                    changed = true;
                }
            }

            if (recipients.includes(botJid)) {
                const adminFlag = type === 'promote';
                if (bot.botAdmin !== adminFlag) {
                    bot.botAdmin = adminFlag;
                    changed = true;
                }
            }

            if (changed) {
                bot.markModified('participantes');
                await bot.save();
            }
        }

        // 💬 Mensagem de aviso somente se a mudança envolver o próprio bot
        if (recipients.includes(botJid)) {
            const msg = type === 'promote'
                ? '🛡️ *Fui promovido a administrador!*\nAgora posso proteger o grupo com os comandos administrativos. por favor utilize o comando menuadm para ver os comandos administrativos'
                : '⚠️ *Fui rebaixado e não sou mais administrador!*\nNão consigo aplicar as proteções automáticas como antilinks, banextremos entre outros';
            await sendText(server_url, apikey, instance, chatId, msg);
        }

        // 🖨️ Log visual
        printCaixaEventoAdmin({ chatId, type, author });

    } catch (err) {
        console.error('❌ Erro ao processar group_admin_changed:', err.message);
    }
};
