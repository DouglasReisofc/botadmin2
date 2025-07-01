function abrirModalNovoAd() {
    document.getElementById('modalNovoAd').style.display = 'flex';
}
function fecharModalNovoAd() {
    document.getElementById('modalNovoAd').style.display = 'none';
}

function abrirModalEditarAd(grupoId, anuncioId, legenda, frequencia, imagemUrl, mentionAll) {
    document.getElementById('editarGrupoId').value = grupoId;
    document.getElementById('editarAnuncioId').value = anuncioId;
    document.getElementById('editarLegenda').value = legenda;

    const num = parseInt(frequencia);
    const unidade = frequencia.replace(/[0-9]/g, '');
    document.getElementById('editarFrequenciaNumero').value = num || '';
    document.getElementById('editarFrequenciaUnidade').value = unidade || 'm';

    const miniatura = document.getElementById('editarMiniatura');
    if (imagemUrl) {
        miniatura.src = '/' + imagemUrl;
        miniatura.style.display = 'block';
    } else {
        miniatura.style.display = 'none';
    }

    const mentionAllCheckbox = document.getElementById('editarMentionAll');
    mentionAllCheckbox.checked = mentionAll === true;

    document.getElementById('modalEditarAd').style.display = 'flex';
}


function fecharModalEditarAd() {
    document.getElementById('modalEditarAd').style.display = 'none';
}

function validarTamanhoArquivo(input) {
    const file = input.files[0];
    if (file && file.size > 60 * 1024 * 1024) {
        alert("⚠️ Arquivo excede 60MB.");
        input.value = "";
    }
}

function toggleDropdown(el) {
    el.closest('.dropdown').classList.toggle('open');
}

window.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});