function atualizarTabelaTexto() {
  const sel = document.getElementById('grupoSelect');
  const selectedId = sel.value;
  const bot = bots.find(b => b.groupId === selectedId);

  document.getElementById('grupoHidden').value = selectedId;
  document.getElementById('tabela').value = bot?.tabela || '';

  const info = document.getElementById('grupoDetalhes');
  info.innerHTML = `ID: ${bot.groupId}<br>Vencimento: ${new Date(bot.vencimento).toLocaleDateString('pt-BR')}`;
}

window.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('grupoSelect');
  if (sel.options.length > 0) {
    sel.selectedIndex = 0; // força a seleção do primeiro grupo
  }
  atualizarTabelaTexto();
});
