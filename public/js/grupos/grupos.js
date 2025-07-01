document.addEventListener('DOMContentLoaded', () => {
    // Novo Grupo
    const modalNovo = document.getElementById('modalNovoBot');
    const novoBtn = document.getElementById('novo-bot-btn');
    const closeNovo = modalNovo?.querySelector('.close-btn');

    novoBtn?.addEventListener('click', () => {
        // redireciona se botão estiver desativado (por segurança futura)
        if (novoBtn.hasAttribute('disabled')) {
            window.location.href = '/planos';
            return;
        }
        modalNovo.style.display = 'flex';
    });

    closeNovo?.addEventListener('click', () => {
        modalNovo.style.display = 'none';
    });

    // Editar Grupo
    const modalEdit = document.getElementById('modalEditarBot');
    const closeEdit = modalEdit?.querySelector('.close-btn');

    window.abrirModalEditar = function (id) {
        document.getElementById('editar-bot-id').value = id;
        modalEdit.style.display = 'flex';
        document.getElementById('form-editar-bot').action = '/usuario/editarbot';
    };

    window.fecharModalEditar = function () {
        modalEdit.style.display = 'none';
    };

    // Fechar modais ao clicar fora
    window.addEventListener('click', e => {
        if (e.target === modalNovo) modalNovo.style.display = 'none';
        if (e.target === modalEdit) modalEdit.style.display = 'none';
    });

    // Dropdown (caso existam menus laterais colapsáveis)
    window.toggleDropdown = function (el) {
        el.closest('.dropdown').classList.toggle('open');
    };
});
