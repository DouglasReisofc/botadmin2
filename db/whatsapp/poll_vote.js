const { BotConfig } = require('../botConfig');
const Sorteio = require('../Sorteio');

function normalizeVote(data) {
    if (!data || typeof data !== "object") return {};
    if (data.chatId && data.messageId) return data;
    const parent = data.parentMessage || {};
    const chatId = parent.to || parent._data?.to || data.id?.remote || null;
    const messageId = parent.id?._serialized || data.id?._serialized || null;
    return { chatId, messageId, voter: data.voter, selectedOptions: data.selectedOptions || [], meta: { to: chatId } };
}

/**
 * Handler for poll.vote events. Registers or removes a user's vote
 * from the corresponding automatic Sorteio document.
 */
module.exports = async function handlePollVote({ event, data }) {
    data = normalizeVote(data);
    // Extrai dados principais do payload
    const groupId = data.chatId || data.meta?.to;
    const serialized = data.messageId;
    const usuario = data.voter;
    const selOpts = Array.isArray(data.selectedOptions) ? data.selectedOptions : [];

    // Validação básica
    if (!groupId || !serialized || !usuario) {
        console.warn('❌ Dados insuficientes para registrar participação.', {
            groupId,
            serialized,
            usuario
        });
        return;
    }

    try {
        // 1) Localiza o BotConfig pelo groupId
        const botConfig = await BotConfig.findOne({ groupId }).exec();
        if (!botConfig) {
            console.log(`[poll.vote] BotConfig não encontrado para grupo ${groupId}. Ignorando voto.`);
            return;
        }

        // 2) Busca Sorteio automático ativo e não concluído
        const sorteio = await Sorteio.findOne({
            bot: botConfig._id,
            serialized: serialized,
            tipo: 'automatico',
            concluido: false
        }).exec();

        if (!sorteio) {
            console.log(
                `[poll.vote] Sorteio ${serialized} não é mais automático ou foi finalizado.`
            );
            return;
        }

        // 3) Determina se o usuário votou para participar (localId 0)
        const votouParticipar = selOpts.some(opt => opt.localId === 0);

        if (votouParticipar) {
            // Adiciona se não estiver já e se não ultrapassar maxParticipants
            const jaParticipa = sorteio.participantes.includes(usuario);
            const limite = sorteio.maxParticipantes;
            const atual = sorteio.participantes.length;
            const podeAdicionar = !limite || atual < limite;

            if (!jaParticipa && podeAdicionar) {
                sorteio.participantes.push(usuario);
                await sorteio.save();
                console.log(`[poll.vote] [+] ${usuario} entrou no sorteio ${serialized} (grupo ${groupId})`);
            } else if (!podeAdicionar) {
                console.log(
                    `[poll.vote] ❌ ${usuario} tentou participar mas o limite (${limite}) foi atingido.`
                );
            }
        } else {
            // Remove se estiver na lista
            if (sorteio.participantes.includes(usuario)) {
                sorteio.participantes = sorteio.participantes.filter(u => u !== usuario);
                await sorteio.save();
                console.log(`[poll.vote] [–] ${usuario} saiu do sorteio ${serialized} (grupo ${groupId})`);
            }
        }
    } catch (err) {
        console.error('❌ Erro ao atualizar participantes do sorteio:', err);
    }
};
