function openCreateAd(){
  document.getElementById('createAdForm').reset();
  document.getElementById('userSearch').value='';
  loadUsers('', 'newAdUser');
  openModalById('createAdModal');
}

async function loadUsers(q, selectId, selected){
  try{
    const res = await fetch(`/admin/usuarios/buscar?q=${encodeURIComponent(q)}`, {
      credentials: 'same-origin'
    });
    const data = await res.json();
    const select = document.getElementById(selectId);
    if(!select) return;
    select.innerHTML = '<option value="">Nenhum</option>';
    data.forEach(u=>{
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.nome;
      if(selected && selected===u.id) opt.selected = true;
      select.appendChild(opt);
    });
  }catch(e){console.error('Busca de usuários falhou',e);}
}

document.getElementById('userSearch').addEventListener('input', e=>{
  loadUsers(e.target.value,'newAdUser');
});
document.getElementById('editUserSearch').addEventListener('input', e=>{
  loadUsers(e.target.value,'editAdUser');
});

document.addEventListener('DOMContentLoaded', () => {
  loadUsers('', 'newAdUser');
});

function abrirEditarAd(id,text,link,user){
  document.getElementById('editAdForm').action=`/admin/anuncios/editar/${id}`;
  document.getElementById('editAdId').value=id;
  document.getElementById('editAdText').value=text||'';
  document.getElementById('editAdLink').value=link||'';
  document.getElementById('editUserSearch').value='';
  loadUsers('', 'editAdUser', user);
  openModalById('editAdModal');
}

function fecharModal(id){
  closeModal(id);
}
