/* ======= PLANOS.JS – v2 ======= */

/* === SIDEBAR ===================================================== */
const sidebarEl = document.querySelector('.sidebar');
function toggleSidebar() {
    sidebarEl?.classList.toggle('active');
}
window.addEventListener('click', e => {
    if (sidebarEl && window.innerWidth <= 768 &&
        !e.target.closest('.sidebar') &&
        !e.target.closest('.menu-toggle')) {
        sidebarEl.classList.remove('active');
    }
});

/* === MODAIS ====================================================== */
const modals = {
    create: document.getElementById('createModal'),
    edit: document.getElementById('editModal'),
    delete: document.getElementById('deleteModal')
};

/* abrir / fechar -------------------------------------------------- */
function openCreateModal() {
    if (!modals.create) return;
    modals.create.classList.add('active');
    document.getElementById('createForm').reset();    // limpa tudo
    document.getElementById('testeGratis').checked = false;
    toggleDiasTeste('create');
    document.getElementById('includedAds').value = 0;
    document.getElementById('includedShortLinks').value = 0;
    document.getElementById('dailyAdLimit').value = 0;
    document.getElementById('adTimes').value = '';
    document.querySelector('#createForm input[name="active"]').checked = true;
    document.querySelectorAll('#createForm input[name^="allowedCommands"]').forEach(c=>{c.checked=false;});
}
function openEditModal(
    id, nome, preco, duracao,
    limiteGrupos, limiteInstancias,
    includedAds, includedShortLinks,
    testeGratis, diasTeste, descricao = '',
    allowedCmds = '{}', ativo = true,
    dailyAds = 0, horarios = ''
) {
    if (!modals.edit) return;
    modals.edit.classList.add('active');

    const form = document.getElementById('editForm');
    if (form) form.action = `/admin/planos/editar/${id}`;

    /* preenche campos */
    document.getElementById('editNome').value = decodeURIComponent(nome);
    document.getElementById('editPreco').value = preco;
    document.getElementById('editDuracao').value = duracao;
    document.getElementById('editLimiteGrupos').value = limiteGrupos;
    document.getElementById('editLimiteInstancias').value = limiteInstancias;
    document.getElementById('editDescricao').value = decodeURIComponent(descricao);
    document.getElementById('editIncludedAds').value = includedAds;
    document.getElementById('editIncludedLinks').value = includedShortLinks;
    document.getElementById('editAtivo').checked =
        ativo === true || ativo === 'true';
    document.getElementById('editDailyAdLimit').value = dailyAds;
    document.getElementById('editAdTimes').value = horarios;

    const chk = document.getElementById('editTesteGratis');
    chk.checked = testeGratis === true || testeGratis === 'true';
    toggleDiasTeste('edit');
    document.getElementById('diasTesteEdit').value = chk.checked ? diasTeste : '';

    try {
        const cmds = JSON.parse(decodeURIComponent(allowedCmds));
        document.querySelectorAll('#editForm input.edit-cmd').forEach(el=>{
            const c = el.dataset.cmd;
            el.checked = !!cmds[c];
        });
    } catch(e) {
        console.error('parse cmds',e);
    }

    /* registra id do plano */
    document.getElementById('editId').value = (id || '').toString().trim();
}
function openDeleteModal(id) {
    if (!modals.delete) return;
    modals.delete.classList.add('active');
    document.getElementById('confirmDelete').onclick =
        () => (window.location.href = `/admin/planos/deletar/${id}`);
}
function closeModal(which) {
    modals[which.replace('Modal', '')]?.classList.remove('active');
}

/* === LÓGICA TESTE GRÁTIS ========================================= */
function toggleDiasTeste(prefix) {
    const chk = document.getElementById(prefix === 'create' ? 'testeGratis' : 'editTesteGratis');
    const group = document.getElementById(prefix === 'create' ? 'diasTesteGroupCreate' : 'diasTesteGroupEdit');
    const input = document.getElementById(prefix === 'create' ? 'diasTesteCreate' : 'diasTesteEdit');

    if (chk.checked) {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
        input.value = '';
    }
}

/* === GARANTIR SUBMIT DOS FORMULÁRIOS ============================= */
document.addEventListener('DOMContentLoaded', () => {
    /* botão CRIAR */
    document.getElementById('btnSubmitCreate')
        ?.addEventListener('click', () =>
            document.getElementById('createForm').submit());

    /* botão EDITAR / ATUALIZAR */
    document.getElementById('btnSubmitEdit')
        ?.addEventListener('click', () =>
            document.getElementById('editForm').submit());
});
