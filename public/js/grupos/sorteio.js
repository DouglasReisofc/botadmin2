// /public/js/grupos/sorteio.js

// Converte ObjectId para string para comparação
function idEquals(a, b) {
    return String(a) === String(b);
}

// Redireciona para a rota com o groupId correto
function filtrarGrupo() {
    const sel = document.getElementById('grupoSelect').value;         // sel é o _id do bot
    const bot = bots.find(b => idEquals(b._id, sel));
    if (!bot) return;
    const grupoId = bot.groupId;                                       // extraímos o groupId
    window.location = `/grupos/sorteio?grupo=${encodeURIComponent(grupoId)}`;
}

const participantesSelecionados = { novo: [], edit: [] };

function atualizarResumo() {
    ['novo', 'edit'].forEach(modo => {
        const box = document.getElementById('listaResumo' + modo[0].toUpperCase() + modo.slice(1));
        const cont = document.getElementById('inputsPart' + modo[0].toUpperCase() + modo.slice(1));
        if (!box || !cont) return;

        // Exibe só a parte antes do '@' no resumo
        box.textContent = participantesSelecionados[modo]
            .map(jid => jid.split('@')[0])
            .join(', ');

        // Remove tudo e recria inputs hidden para envio no form
        cont.innerHTML = '';
        participantesSelecionados[modo].forEach(jid => {
            const h = document.createElement('input');
            h.type = 'hidden';
            h.name = 'participantes[]';
            h.value = jid;
            cont.appendChild(h);
        });
    });
}

let modoPart = 'novo';

// Abre modal de seleção de participantes (novo ou edit)
function abrirModalPart(modo) {
    modoPart = modo;
    const botId = document.getElementById(modo + 'Grupo').value;   // agora é _id
    const bot = bots.find(b => idEquals(b._id, botId));
    if (!bot) return;

    const lista = document.getElementById('listaPart');
    lista.innerHTML = '';

    // Preenche a lista de participantes do bot
    bot.participantes.forEach(p => {
        const jid = p.id;
        const nome = jid.split('@')[0];
        const row = document.createElement('div');
        row.className = 'toggle-row';
        row.innerHTML = `
      <span>${nome}</span>
      <label class="switch">
        <input type="checkbox" value="${jid}" ${participantesSelecionados[modo].includes(jid) ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
        const checkbox = row.querySelector('input');
        checkbox.onchange = e => {
            if (e.target.checked) {
                participantesSelecionados[modo].push(jid);
            } else {
                participantesSelecionados[modo] = participantesSelecionados[modo].filter(x => x !== jid);
            }
            atualizarResumo();
        };
        lista.appendChild(row);
    });

    // Filtra dinamicamente
    document.getElementById('buscaPart').oninput = () => {
        const t = document.getElementById('buscaPart').value.toLowerCase();
        lista.querySelectorAll('.toggle-row').forEach(r => {
            r.style.display = r.textContent.toLowerCase().includes(t) ? 'flex' : 'none';
        });
    };

    atualizarResumo();
    document.getElementById('modalPart').classList.add('active');
}

function fecharModalPart() {
    document.getElementById('modalPart').classList.remove('active');
}

function confirmarPart() {
    fecharModalPart();
}

function ajustarNovo() {
    const auto = document.getElementById('novoTipo').checked;
    document.getElementById('novoAuto').style.display = auto ? 'block' : 'none';
    document.getElementById('novoManual').style.display = auto ? 'none' : 'block';
}

function abrirModalNovo() {
    // Preenche o oculto novoGrupo com o _id atual selecionado
    const sel = document.getElementById('grupoSelect').value;
    document.getElementById('novoGrupo').value = sel;

    participantesSelecionados.novo = [];
    atualizarResumo();
    ajustarNovo();
    document.getElementById('modalNovo').classList.add('active');
}

function fecharModalNovo() {
    document.getElementById('modalNovo').classList.remove('active');
}

function ajustarTipoNovo() {
    document.getElementById('novoType').value = document.getElementById('novoTipo').checked ? 'automatic' : 'manual';
}

// Abre modal de edição de sorteio
function abrirModalEdit(botId, serialized) {
    const botList = bots;
    const bot = botList.find(b => idEquals(b._id, botId));
    if (!bot) return;

    const s = (sorteiosPorGrupo[botId] || []).find(x => x.serialized === serialized);
    if (!s) return;

    const auto = s.tipo === 'automatico';

    // Sempre enviamos o _id no campo editGrupo
    document.getElementById('editGrupo').value = botId;
    document.getElementById('editSerialized').value = serialized;
    document.getElementById('editPergunta').value = s.pergunta;
    document.getElementById('editType').value = auto ? 'automatic' : 'manual';

    document.getElementById('editToggleContainer').style.display = auto ? 'flex' : 'none';
    document.getElementById('editTipo').checked = auto;
    document.getElementById('editAuto').style.display = auto ? 'block' : 'none';
    document.getElementById('editManual').style.display = auto ? 'none' : 'block';

    document.getElementById('editEndDate').value = s.sortearEm
        ? new Date(s.sortearEm).toISOString().slice(0, 16)
        : '';
    document.getElementById('editMaxParticipantsAuto').value = s.maxParticipantes || '';
    document.getElementById('editWinnersCount').value = s.winnersCount || '';

    participantesSelecionados.edit = [...s.participantes];
    atualizarResumo();

    document.getElementById('modalEdit').classList.add('active');
}

function fecharModalEdit() {
    document.getElementById('modalEdit').classList.remove('active');
}

function ajustarTipoEdit() {
    const auto = document.getElementById('editTipo').checked;
    document.getElementById('editAuto').style.display = auto ? 'block' : 'none';
    document.getElementById('editManual').style.display = auto ? 'none' : 'block';
    document.getElementById('editType').value = auto ? 'automatic' : 'manual';
}

// Abre modal para adicionar participantes em sorteio automático
function abrirModalAddAuto(botId, serialized) {
    const bot = bots.find(b => idEquals(b._id, botId));
    if (!bot) return;

    const s = (sorteiosPorGrupo[botId] || []).find(x => x.serialized === serialized);
    if (!s) return;

    // envia o _id no campo addAutoGrupo
    document.getElementById('addAutoGrupo').value = botId;
    document.getElementById('addAutoSerialized').value = serialized;

    const cont = document.getElementById('autoPartList');
    cont.innerHTML = '';

    bot.participantes.forEach(p => {
        const jid = p.id;
        const nome = jid.split('@')[0];
        cont.insertAdjacentHTML('beforeend', `
      <div class="toggle-row">
        <span>${nome}</span>
        <label class="switch">
          <input type="checkbox" name="participantes[]" value="${jid}" ${s.participantes.includes(jid) ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    `);
    });

    filterAutoList();
    document.getElementById('modalAddAuto').classList.add('active');
}

function fecharModalAddAuto() {
    document.getElementById('modalAddAuto').classList.remove('active');
}

function filterAutoList() {
    const t = document.getElementById('searchAutoPart').value.toLowerCase();
    document.querySelectorAll('#autoPartList .toggle-row').forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(t) ? 'flex' : 'none';
    });
}

// Abre modal de confirmação de sorteio (finalizar)
function abrirModalConfirmacao(botId, serialized, total) {
    // aqui o campo confirmGrupo recebe o _id do bot
    document.getElementById('confirmGrupo').value = botId;
    document.getElementById('confirmSerialized').value = serialized;

    const input = document.getElementById('numWinners');
    input.max = total;
    input.value = 1;

    document.getElementById('modalConfirmar').classList.add('active');
}

function fecharModalConfirmacao() {
    document.getElementById('modalConfirmar').classList.remove('active');
}

// Inicializa listeners ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('novoTipo').addEventListener('change', ajustarNovo);
    document.getElementById('editTipo').addEventListener('change', ajustarTipoEdit);
});
