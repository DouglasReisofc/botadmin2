// public/js/admin/usuarios.js

function openCreateModal() {
    openModalById('createModal');
}

function openEditModal(id, nome, whatsapp, status, apikey, premium, saldo, admin) {
    document.getElementById('editNome').value = nome;
    document.getElementById('editWhatsapp').value = whatsapp;
    document.getElementById('editStatus').value = status;
    document.getElementById('editApikey').value = apikey;

    if (premium) {
        const d = new Date(premium);
        document.getElementById('editPremium').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('editPremium').value = '';
    }

    document.getElementById('editSaldo').value = saldo;
    document.getElementById('editAdmin').value = admin;

    document.getElementById('editForm').action = `/admin/usuarios/editar/${id}`;
    openModalById('editModal');
}

function openDeleteModal(id) {
    document.getElementById('confirmDelete').onclick = () => {
        window.location.href = `/admin/usuarios/deletar/${id}`;
    };
    openModalById('deleteModal');
}
