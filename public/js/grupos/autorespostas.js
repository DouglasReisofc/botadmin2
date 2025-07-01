let novoTagManager;
let editarTagManager;

function abrirModalNovaResp(){
  novoTagManager.setTags([]);
  document.getElementById('novoTipoSwitch').checked = false;
  atualizarTipoLabel('novoTipoSwitch', 'novoTipoTexto');
  document.getElementById('modalNovaResp').style.display = 'flex';
}

function fecharModalNovaResp(){
  document.getElementById('modalNovaResp').style.display = 'none';
}

function abrirModalEditarResp(grupo, id, gatilhos, resposta, img, contem, sticker){
  document.getElementById('editarGrupoId').value = grupo;
  document.getElementById('editarRespId').value = id;
  editarTagManager.setTags(Array.isArray(gatilhos) ? gatilhos : []);
  document.getElementById('editarResposta').value = resposta;
  const imgEl = document.getElementById('editarMiniatura');
  if(img){
    imgEl.src = '/' + img;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }
  document.getElementById('editarTipoSwitch').checked = contem === true;
  atualizarTipoLabel('editarTipoSwitch', 'editarTipoTexto');
  document.getElementById('editarSticker').checked = sticker === true;
  document.getElementById('modalEditarResp').style.display = 'flex';
}

function fecharModalEditarResp(){
  document.getElementById('modalEditarResp').style.display = 'none';
}

function validarTamanhoArquivo(input){
  const file = input.files[0];
  if(file && file.size > 60 * 1024 * 1024){
    alert('⚠️ Arquivo excede 60MB.');
    input.value = '';
  }
}

window.addEventListener('click', e => {
  if(e.target.classList.contains('modal')) e.target.style.display = 'none';
});

function TagManager(container, hidden){
  const input = container.querySelector('input');
  let tags = [];

  function finalizeInput(){
    const val = input.value.trim();
    if(val){ addTag(val); input.value = ''; }
  }

  function updateHidden(){ hidden.value = tags.join(','); }

  function addTag(text){
    if(!text) return;
    tags.push(text);
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '&times;';
    btn.onclick = () => {
      tags = tags.filter(i => i !== text);
      t.remove();
      updateHidden();
    };
    t.appendChild(btn);
    container.insertBefore(t, input);
    updateHidden();
  }

  input.addEventListener('keydown', e => {
    if(['Enter', ',', ' '].includes(e.key)){
      e.preventDefault();
      finalizeInput();
    }
  });

  input.addEventListener('input', () => {
    if(input.value.includes(',')){
      const partes = input.value.split(',');
      partes.slice(0, -1).forEach(p => addTag(p.trim()));
      input.value = partes[partes.length - 1].trim();
    }
  });

  input.addEventListener('blur', finalizeInput);

  return {
    setTags(arr){
      tags = [];
      container.querySelectorAll('.tag').forEach(el => el.remove());
      (arr || []).forEach(addTag);
    },
    finalize: finalizeInput
  };
}

function atualizarTipoLabel(switchId, labelId){
  const sw = document.getElementById(switchId);
  const lbl = document.getElementById(labelId);
  if(!sw || !lbl) return;
  lbl.textContent = sw.checked ? 'Gatilhos' : 'Frase Completa';
}

document.addEventListener('DOMContentLoaded', () => {
  novoTagManager = TagManager(document.getElementById('novoTagContainer'), document.getElementById('novoTagValues'));
  editarTagManager = TagManager(document.getElementById('editarTagContainer'), document.getElementById('editarTagValues'));

  document.getElementById('formNovaResp').addEventListener('submit', () => novoTagManager.finalize());
  document.getElementById('formEditarResp').addEventListener('submit', () => editarTagManager.finalize());

  document.getElementById('novoTipoSwitch').addEventListener('change', () => atualizarTipoLabel('novoTipoSwitch', 'novoTipoTexto'));
  document.getElementById('editarTipoSwitch').addEventListener('change', () => atualizarTipoLabel('editarTipoSwitch', 'editarTipoTexto'));

  atualizarTipoLabel('novoTipoSwitch', 'novoTipoTexto');
  atualizarTipoLabel('editarTipoSwitch', 'editarTipoTexto');

  document.querySelectorAll('.toggle-autoresp').forEach(input => {
    input.addEventListener('change', async e => {
      const botId = e.target.dataset.botId;
      const value = e.target.checked;
      try {
        const res = await fetch('/usuario/grupos/ativacoes/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botId, field: 'comando', command: 'autoresposta', value })
        });
        const j = await res.json();
        if(!j.ok) throw new Error(j.error || 'Erro');
      } catch (err) {
        console.error('Toggle autoresposta error:', err);
        e.target.checked = !value;
        alert('Falha ao atualizar');
      }
    });
  });
});
