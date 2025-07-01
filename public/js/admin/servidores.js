// public/js/admin/servidores.js

// Abre o modal de "Novo Servidor"
function openCreate() {
    const form = document.getElementById('srvForm');
    if (!form) return;
    form.action = '/admin/servidores/criar';
    document.getElementById('mTitle').textContent = 'Novo Servidor';
    document.getElementById('srvId').value = '';
    document.getElementById('fNome').value = '';
    document.getElementById('fBase').value = '';
    document.getElementById('fKey').value = '';
    document.getElementById('fLimit').value = 0;
    document.getElementById('fStatus').value = 'true';
    openModal('srvModal');
}

// Abre o modal de "Editar Servidor"
function openEdit(id, nome, baseUrl, key, limit, status) {
    const form = document.getElementById('srvForm');
    if (!form) return;
    form.action = `/admin/servidores/editar/${id}`;
    document.getElementById('mTitle').textContent = 'Editar Servidor';
    document.getElementById('srvId').value = id;
    document.getElementById('fNome').value = nome;
    document.getElementById('fBase').value = baseUrl;
    document.getElementById('fKey').value = key;
    document.getElementById('fLimit').value = limit;
    document.getElementById('fStatus').value = status ? 'true' : 'false';
    openModal('srvModal');
}

// Deleta o servidor
function delSrv(id) {
    if (confirm('Deletar servidor?')) {
        window.location.href = `/admin/servidores/deletar/${id}`;
    }
}

// Fecha o modal ao clicar fora do conteúdo
window.addEventListener('click', function (event) {
    const modal = document.getElementById('srvModal');
    if (
        modal &&
        modal.classList.contains('active') &&
        !event.target.closest('.modal-content')
    ) {
        closeModal('srvModal');
    }
});
