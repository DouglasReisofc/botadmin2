let excluirId = null;

function abrirCriar() {
  const form = document.getElementById('cmdForm');
  form.action = '/admin/comandos';
  document.getElementById('cmdTitle').textContent = 'Novo Comando';
  document.getElementById('cmdId').value = '';
  document.getElementById('cmdName').value = '';
  document.getElementById('cmdDesc').value = '';
  document.getElementById('cmdCategory').value = '';
  document.getElementById('cmdFile').value = '';
  document.getElementById('cmdFilePreview').innerHTML = '';
  openModalById('cmdModal');
}

function abrirEditar(id, nome, desc, categoria, fileName, type) {
  const form = document.getElementById('cmdForm');
  form.action = `/admin/comandos/editar/${id}`;
  document.getElementById('cmdTitle').textContent = 'Editar Comando';
  document.getElementById('cmdId').value = id;
  document.getElementById('cmdName').value = decodeURIComponent(nome);
  document.getElementById('cmdDesc').value = decodeURIComponent(desc);
  document.getElementById('cmdCategory').value = decodeURIComponent(categoria || '');
  const preview = document.getElementById('cmdFilePreview');
  preview.innerHTML = '';
  if (fileName) {
    fileName = decodeURIComponent(fileName);
    if (type === 'video') {
        preview.innerHTML = `<video src="${fileName}" controls style="width:100%; max-height:200px; margin-bottom:0.5rem;" aria-label="Pré-visualização"></video>`;
    } else {
        preview.innerHTML = `<img src="${fileName}" style="width:100%; max-height:200px; margin-bottom:0.5rem;" alt="Pré-visualização" />`;
    }
  }
  document.getElementById('cmdFile').value = '';
  openModalById('cmdModal');
}

function abrirExcluir(id) {
  excluirId = id;
  openModalById('cmdDeleteModal');
}

function confirmarExcluir() {
  if (excluirId) {
    window.location.href = `/admin/comandos/deletar/${excluirId}`;
  }
}

function abrirMsgComandos() {
  openModalById('msgCmdModal');
}

function abrirNovaCategoria() {
  const form = document.getElementById('catForm');
  form.action = '/admin/comandos/categorias';
  document.getElementById('catTitle').textContent = 'Nova Categoria';
  document.getElementById('catId').value = '';
  document.getElementById('catName').value = '';
  openModalById('catModal');
}

let excluirCatId = null;

function abrirEditarCategoria(id, nome) {
  const form = document.getElementById('catForm');
  form.action = `/admin/comandos/categorias/editar/${id}`;
  document.getElementById('catTitle').textContent = 'Editar Categoria';
  document.getElementById('catId').value = id;
  document.getElementById('catName').value = decodeURIComponent(nome);
  openModalById('catModal');
}

function abrirExcluirCategoria(id) {
  excluirCatId = id;
  openModalById('catDeleteModal');
}

function confirmarExcluirCategoria() {
  if (excluirCatId) {
    window.location.href = `/admin/comandos/categorias/deletar/${excluirCatId}`;
  }
}

let excluirTutId = null;

function abrirCriarTutorial() {
  const form = document.getElementById('tutorialForm');
  form.action = '/admin/tutorials';
  document.getElementById('tutorialTitle').textContent = 'Novo Tutorial';
  document.getElementById('tutorialHiddenId').value = '';
  document.getElementById('tutTitle').value = '';
  document.getElementById('tutId').value = '';
  document.getElementById('tutMsg').value = '';
  const preview = document.getElementById('tutFilePreview');
  if (preview) preview.innerHTML = '';
  document.getElementById('tutFile').value = '';
  openModalById('tutorialModal');
}

function abrirEditarTutorial(id, title, tutId, message, fileName, type) {
  const form = document.getElementById('tutorialForm');
  form.action = `/admin/tutorials/editar/${id}`;
  document.getElementById('tutorialTitle').textContent = 'Editar Tutorial';
  document.getElementById('tutorialHiddenId').value = id;
  document.getElementById('tutTitle').value = decodeURIComponent(title);
  document.getElementById('tutId').value = decodeURIComponent(tutId);
  document.getElementById('tutMsg').value = decodeURIComponent(message);
  const preview = document.getElementById('tutFilePreview');
  preview.innerHTML = '';
  if (fileName) {
    fileName = decodeURIComponent(fileName);
    if (type === 'video') {
      preview.innerHTML = `<video src="${fileName}" controls style="width:100%; max-height:200px; margin-bottom:0.5rem;"></video>`;
    } else {
      preview.innerHTML = `<img src="${fileName}" style="width:100%; max-height:200px; margin-bottom:0.5rem;" alt="Pré-visualização" />`;
    }
  }
  document.getElementById('tutFile').value = '';
  openModalById('tutorialModal');
}

function abrirExcluirTutorial(id) {
  excluirTutId = id;
  openModalById('tutorialDeleteModal');
}

function confirmarExcluirTutorial() {
  if (excluirTutId) {
    window.location.href = `/admin/tutorials/deletar/${excluirTutId}`;
  }
}
