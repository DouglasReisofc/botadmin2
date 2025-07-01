document.addEventListener('DOMContentLoaded', () => {
    // —— Filtrar Grupos e Mostrar Detalhes ——
    const grupoSelect = document.getElementById('grupoSelect');
    const grupoDetalhes = document.getElementById('grupoDetalhes');
    const cards = document.querySelectorAll('.grupo-card');

    const filtrarGrupo = () => {
        const sel = grupoSelect.value;
        localStorage.setItem('grupoSelecionado', sel);
        cards.forEach(card => {
            card.style.display = (card.id === sel) ? 'block' : 'none';
        });
    };

    const atualizarDetalhes = () => {
        const opt = grupoSelect.options[grupoSelect.selectedIndex];
        grupoDetalhes.innerHTML = opt
            ? `ID: ${opt.dataset.gid}<br>Venc.: ${opt.dataset.venc}`
            : '';
    };

    if (grupoSelect) {
        const saved = localStorage.getItem('grupoSelecionado');
        if (saved && [...grupoSelect.options].some(o => o.value === saved)) {
            grupoSelect.value = saved;
        }
        filtrarGrupo();
        atualizarDetalhes();
        grupoSelect.addEventListener('change', () => {
            filtrarGrupo();
            atualizarDetalhes();
        });
    }

    // —— Dropdown Lateral ——
    document.querySelectorAll('.dropdown-toggle').forEach(toggle =>
        toggle.addEventListener('click', () => {
            toggle.closest('.dropdown').classList.toggle('open');
        })
    );

    // —— Novo Bot Modal ——
    const modalNovo = document.getElementById('modalNovoBot');
    document.getElementById('novo-bot-btn')?.addEventListener('click', () => {
        modalNovo?.classList.add('active');
    });

    // —— Editar Bot Modal ——
    const modalEdit = document.getElementById('modalEditarBot');
    window.abrirModalEditar = id => {
        document.getElementById('editar-bot-id').value = id;
        modalEdit?.classList.add('active');
    };
    window.fecharModalEditar = () => modalEdit?.classList.remove('active');
    modalEdit?.querySelector('.close-btn')?.addEventListener('click', () => {
        modalEdit?.classList.remove('active');
    });

    // —— Bem-Vindo Modal ——
    const modalBem = document.getElementById('modalBemvindo');
    window.abrirModalBemvindo = id => {
        const tpl = document.getElementById(`bemvindo_template_${id}`);
        const area = document.getElementById('conteudoBemvindo');
        const inp = document.getElementById('modalBemvindoBotId');
        if (!tpl || !area || !inp) return;
        area.innerHTML = '';
        // clona apenas o conteúdo interno
        area.appendChild(tpl.cloneNode(true).firstElementChild);
        inp.value = id;
        // habilita remover imagem
        area.querySelector('.remove-img')?.addEventListener('click', e => {
            e.target.closest('.image-preview')?.remove();
            area.querySelector('input[name="removerImagem"]').value = '1';
        });
        modalBem?.classList.add('active');
    };
    window.fecharModalBemvindo = () => modalBem?.classList.remove('active');
    modalBem?.querySelector('.close-btn')?.addEventListener('click', () =>
        modalBem?.classList.remove('active')
    );

    window.mostrarVariaveis = () => {
        alert(
            'Variáveis disponíveis:\n' +
            '{{pushName}}\n{{numero}}\n{{nomeGrupo}}\n{{data}}\n{{hora}}\n{{prefixo}}'
        );
    };

    // —— Prompt Modal ——
    const modalPrompt = document.getElementById('modalPrompt');
    window.abrirModalPrompt = id => {
        const tpl = document.getElementById(`prompt_template_${id}`);
        const area = document.getElementById('conteudoPrompt');
        const inp = document.getElementById('modalPromptBotId');
        if (!tpl || !area || !inp) return;
        area.innerHTML = '';
        area.appendChild(tpl.cloneNode(true).firstElementChild);
        inp.value = id;
        modalPrompt?.classList.add('active');
    };
    window.fecharModalPrompt = () => modalPrompt?.classList.remove('active');
    modalPrompt?.querySelector('.close-btn')?.addEventListener('click', () =>
        modalPrompt?.classList.remove('active')
    );

    // —— Links Permitidos Modal ——
    const modalLinks = document.getElementById('modalLinks');
    const textareaLinks = document.getElementById('linksPermitidosTextarea');
    const hiddenLinksBotId = document.getElementById('modalLinksBotId');
    window.abrirModalLinks = (botId, links) => {
        if (!modalLinks || !textareaLinks || !hiddenLinksBotId) return;
        hiddenLinksBotId.value = botId;
        textareaLinks.value = Array.isArray(links) ? links.join('\n') : '';
        modalLinks.classList.add('active');
    };
    window.fecharModalLinks = () => modalLinks?.classList.remove('active');
    modalLinks?.querySelector('.close-btn')?.addEventListener('click', () =>
        modalLinks?.classList.remove('active')
    );

    // —— Fecha qualquer modal clicando no backdrop ——
    window.addEventListener('click', e => {
        [modalNovo, modalEdit, modalBem, modalPrompt, modalLinks].forEach(modal => {
            if (modal && e.target === modal) modal.classList.remove('active');
        });
    });
});
