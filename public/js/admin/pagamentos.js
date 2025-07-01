// public/js/admin/pagamentos.js

function abrirModalCriar() {
    openModalById('modalCriar');
}

function abrirModalEditar(id, nome, token, pubkey, tipo, taxa) {
    document.getElementById('editId').value = id;
    document.getElementById('editNome').value = nome;
    document.getElementById('editAccessToken').value = token;
    document.getElementById('editPublicKey').value = pubkey;
    document.getElementById('editTipo').value = tipo;
    document.getElementById('editTaxa').value = taxa;
    document.getElementById('formEditar').action = '/admin/pagamentos/editar/' + id;
    openModalById('modalEditar');
}

function abrirModalExcluir(id) {
    document.getElementById('formExcluir').action = '/admin/pagamentos/deletar/' + id;
    openModalById('modalExcluir');
}

function fecharModal(id) {
    closeModal(id);
}

window.addEventListener('click', function (e) {
    ['modalCriar', 'modalEditar', 'modalExcluir'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (e.target === modal) closeModal(modalId);
    });
});
