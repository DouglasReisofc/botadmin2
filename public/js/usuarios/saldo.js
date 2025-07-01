// Modal PIX: abrir e fechar
const modalPix = document.getElementById('modalPix');
function abrirModalPix() {
    if (modalPix) modalPix.classList.add('active');
}
function fecharModalPix() {
    if (modalPix) modalPix.classList.remove('active');
}

// Modal resultado PIX: fechar
const modalPixResult = document.getElementById('modalPixResult');
function fecharModalPixResult() {
    if (modalPixResult) modalPixResult.classList.remove('active');
}

// Copiar código PIX para clipboard
function copiarPix() {
    const input = document.getElementById('pixCodeInput');
    if (input) {
        input.select();
        input.setSelectionRange(0, 99999);
        document.execCommand('copy');
        alert('Código PIX copiado!');
    }
}

// Se houver pagamentoId disponível, inicia polling para status PIX
if (typeof pagamentoId !== 'undefined' && pagamentoId) {
    document.addEventListener('DOMContentLoaded', () => {
        let tentativa = 0;

        async function verificarStatusPix() {
            try {
                const res = await fetch(`/usuario/statuspix/${pagamentoId}`);
                const data = await res.json();
                console.log(`[POLLING] Status PIX: ${data.status}`);

                if (data.status === 'aprovado') {
                    alert('Pagamento aprovado! Sua conta foi atualizada.');
                    window.location.href = '/saldo';
                } else if (data.status === 'pendente') {
                    tentativa++;
                    if (tentativa < 30) {
                        // tenta novamente após 10 segundos
                        setTimeout(verificarStatusPix, 10000);
                    }
                }
            } catch (err) {
                console.error('[POLLING] Erro ao verificar pagamento:', err);
            }
        }

        verificarStatusPix();
    });
}
