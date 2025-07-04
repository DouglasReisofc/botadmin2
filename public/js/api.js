// public/js/api.js

// ================== MODAL HANDLERS ==================

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('no-scroll');

    // fecha clicando no fundo escuro
    const handler = evt => {
        if (evt.target === modal) {
            closeModal(id);
        }
    };
    modal.addEventListener('click', handler);
    modal._closer = handler;
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('no-scroll');
    if (modal._closer) {
        modal.removeEventListener('click', modal._closer);
        modal._closer = null;
    }
    if (id === 'qrModal' && qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
    }
}

// ================== QR / PAREAMENTO ==================

let currentApiId = null;
let qrInterval = null;

function showQR(id) {
    currentApiId = id;
    openModal('modalChooseQR');
}

async function solicitarTipo(tipo) {
    closeModal('modalChooseQR');
    const box = document.getElementById('qrCodigo');
    if (!box) return;
    box.textContent = '⌛ Gerando…';
    openModal('qrModal');

    try {
        const resp = await fetch(`/admin/api/${currentApiId}/pair?mode=${tipo}`, { method: 'POST' });
        const result = await resp.json();
        if (!result.success) throw new Error(result.message || 'falha');
        const d = result.data || {};
        if (d.qr && d.code) {
            box.innerHTML = `<img src="${d.qr}" alt="QR Code" class="qr-img" onerror="this.parentElement.textContent='❌ Falha ao carregar QR';" />` +
                            `<pre class="codigo">${d.code}</pre><small class="tip">Ou digite este código no WhatsApp</small>`;
            startWatch(currentApiId);
        } else if (d.qr) {
            box.innerHTML = `<img src="${d.qr}" alt="QR Code" class="qr-img" onerror="this.parentElement.textContent='❌ Falha ao carregar QR';" />`;
            startWatch(currentApiId);
        } else if (d.code) {
            box.innerHTML = `<pre class="codigo">${d.code}</pre><small class="tip">Digite este código no WhatsApp</small>`;
            startWatch(currentApiId);
        } else if (d.status === 'conectado') {
            box.textContent = '✅ Conectado!';
        } else {
            box.textContent = 'Código indisponível';
        }
    } catch (err) {
        try {
            const res = await fetch(`/admin/api/${currentApiId}/qrdata`);
            const data = await res.json();
            if (data.success && data.data) {
                const d = data.data;
                if (d.qr && d.code) {
                    box.innerHTML = `<img src="${d.qr}" alt="QR Code" class="qr-img" onerror="this.parentElement.textContent='❌ Falha ao carregar QR';" />` +
                                   `<pre class="codigo">${d.code}</pre><small class="tip">Ou digite este código no WhatsApp</small>`;
                    startWatch(currentApiId);
                } else if (d.qr) {
                    box.innerHTML = `<img src="${d.qr}" alt="QR Code" class="qr-img" onerror="this.parentElement.textContent='❌ Falha ao carregar QR';" />`;
                    startWatch(currentApiId);
                } else if (d.code) {
                    box.innerHTML = `<pre class="codigo">${d.code}</pre><small class="tip">Digite este código no WhatsApp</small>`;
                    startWatch(currentApiId);
                } else {
                    box.textContent = 'Código indisponível';
                }
            } else {
                box.textContent = 'Erro: ' + (data.message || err.message);
            }
        } catch (e) {
            box.textContent = 'Erro: ' + err.message;
        }
    }
}

function startWatch(id) {
    clearInterval(qrInterval);
    qrInterval = setInterval(async () => {
        try {
            const res = await fetch(`/admin/api/${id}/status`);
            const j = await res.json();
            if (j.status === 'connected') {
                const box = document.getElementById('qrCodigo');
                if (box) box.textContent = '✅ Conectado!';
                clearInterval(qrInterval);
                qrInterval = null;
                setTimeout(() => closeModal('qrModal'), 600);
            }
        } catch (e) {
            console.error('[watch] erro', e);
        }
    }, 1000);
}

// ================== ABRIR/FECHAR MODALS DE API ==================

function openCreateApiModal() {
    openModal('createApiModal');
}

function openEditApiModal(id, serverId, instance, grupos, status, webhook, userId) {
    const form = document.getElementById('editApiForm');
    if (!form) return;

    // Preenche campos
    const serverInput = document.getElementById('editServer');
    if (serverInput) serverInput.value = serverId;
    const gruposInput = document.getElementById('editGruposLimite');
    if (gruposInput) gruposInput.value = grupos;
    const instanceInput = document.getElementById('editInstance');
    if (instanceInput) instanceInput.value = instance;
    const webhookInput = document.getElementById('editWebhook');
    if (webhookInput) webhookInput.value = webhook;
    const statusInput = document.getElementById('editStatus');
    if (statusInput) statusInput.value = status ? 'true' : 'false';

    // Select2 user, se disponível
    if (window.jQuery && $.fn.select2) {
        $('#editUser').val(userId || '').trigger('change');
    } else {
        const userInput = document.getElementById('editUser');
        if (userInput) userInput.value = userId || '';
    }

    form.action = `/admin/api/editar/${id}`;
    openModal('editApiModal');
}

function openDeleteApiModal(id) {
    const btn = document.getElementById('confirmDelete');
    if (btn) btn.onclick = () => window.location.href = `/admin/api/deletar/${id}`;
    openModal('deleteApiModal');
}

// ================== AÇÃO GENÉRICA DE API ==================

async function apiAction(id, action) {
    try {
        const res = await fetch(`/admin/api/${id}/${action}`, { method: 'POST' });
        const ct = res.headers.get('content-type') || '';
        let data;

        if (ct.includes('application/json')) {
            data = await res.json();
        } else {
            throw new Error((await res.text()).trim());
        }

        alert(data.success ? '✅ Ação realizada com sucesso' : '⚠️ Erro: ' + (data.message || 'falha'));
    } catch (err) {
        alert('🚨 Erro: ' + err.message);
    }
}

// ================== FORM HANDLERS ==================

window.addEventListener('DOMContentLoaded', () => {
    // Criação de API
    const createForm = document.getElementById('createApiForm');
    if (createForm) {
        createForm.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            data.status = data.status === 'true';

            try {
                const res = await fetch(e.target.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert('✅ API criada com sucesso!');
                    closeModal('createApiModal');
                    window.location.reload();
                } else {
                    alert('⚠️ Erro: ' + result.message);
                }
            } catch (err) {
                alert('🚨 Erro ao criar a API: ' + err.message);
            }
        });
    }

    // Edição de API
    const editForm = document.getElementById('editApiForm');
    if (editForm) {
        editForm.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            data.status = data.status === 'true';

            try {
                const res = await fetch(e.target.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert('✅ API atualizada com sucesso!');
                    closeModal('editApiModal');
                    window.location.reload();
                } else {
                    alert('⚠️ Erro: ' + result.message);
                }
            } catch (err) {
                alert('🚨 Erro ao atualizar a API: ' + err.message);
            }
        });
    }

    // Inicializa Select2 se disponível
    if (window.jQuery && $.fn.select2) {
        $('#editUser').select2({
            placeholder: "Buscar usuário por nome ou número...",
            allowClear: true,
            width: '100%'
        });
        $('#newUser').select2({
            placeholder: "Selecione um usuário ou deixe global",
            allowClear: true,
            width: '100%'
        });
    }
});
