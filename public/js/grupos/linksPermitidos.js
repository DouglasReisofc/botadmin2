document.addEventListener('DOMContentLoaded', () => {
    // Referências ao modal de links permitidos
    const modalLinks = document.getElementById('modalLinks');
    const textareaLinks = document.getElementById('linksPermitidosTextarea');
    const hiddenBotId = document.getElementById('modalLinksBotId');
    const closeBtn = modalLinks?.querySelector('.close-btn');

    // Fecha o modal se clicar no "×"
    closeBtn?.addEventListener('click', () => {
        modalLinks.style.display = 'none';
    });

    // Fecha se clicar fora do conteúdo do modal
    window.addEventListener('click', (e) => {
        if (e.target === modalLinks) {
            modalLinks.style.display = 'none';
        }
    });
});

/**
 * Chamada quando o usuário clica no botão "Links Permitidos" de um bot específico.
 * @param {String} botId - ID do bot (string).
 * @param {Array<String>} linksArray - Array de links permitidos atuais (ex: ["exemplo.com", "teste.org"]).
 */
window.abrirModalLinks = function (botId, linksArray) {
    const modalLinks = document.getElementById('modalLinks');
    const textareaLinks = document.getElementById('linksPermitidosTextarea');
    const hiddenBotId = document.getElementById('modalLinksBotId');

    // Preenche o hidden com o ID do bot
    hiddenBotId.value = botId;

    // Constrói o texto para o textarea, uma linha por link
    const texto = (Array.isArray(linksArray) ? linksArray : []).join('\n');
    textareaLinks.value = texto;

    // Exibe o modal
    modalLinks.style.display = 'flex';
};

window.fecharModalLinks = function () {
    const modalLinks = document.getElementById('modalLinks');
    modalLinks.style.display = 'none';
};
