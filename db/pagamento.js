const axios = require('axios');
const Deposit = require('./deposits');
const ConfigPagamento = require('./configpagamentos');
const { usuario } = require('./model');
const { sendText } = require('./waActions');  // Importando sendText para enviar as mensagens
const { BotApi } = require('./botApi');  // Agora estamos importando BotApi

async function criarPixMercadoPago({ usuarioId, valor, metodoConfig }) {
    if (!metodoConfig || !metodoConfig.accessToken) throw new Error('Configuração do método inválida');

    const user = await usuario.findById(usuarioId);
    if (!user) throw new Error('Usuário não encontrado');

    const payload = {
        transaction_amount: valor,
        description: `Pagamento de ${user.nome}`,
        payment_method_id: 'pix',
        payer: {
            email: user.whatsapp + '@fakemail.com',
            first_name: user.nome,
            identification: { type: 'CPF', number: '52431070263' }
        },
        notification_url: `${process.env.BASE_URL || 'https://botadmin.shop'}/mercadopago/pix`,
    };

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${metodoConfig.accessToken}`,
    };

    const res = await axios.post('https://api.mercadopago.com/v1/payments', payload, { headers });
    const result = res.data;

    const pix_code = result?.point_of_interaction?.transaction_data?.qr_code || null;
    const qr_code_base64 = result?.point_of_interaction?.transaction_data?.qr_code_base64 || null;
    const pagamentoId = result?.id;

    // Buscar uma instância de API ativa no BotApi
    const botApi = await BotApi.findOne({ status: true });
    if (!botApi) {
        throw new Error('Instância de API não encontrada');
    }

    // Acessando os dados da instância de API ativa
    const { baseUrl, apikey, instance } = botApi;

    if (!apikey || !instance) {
        throw new Error('API Key ou Instância não configurados corretamente.');
    }

    // Enviar a primeira mensagem com o valor do pagamento gerado e outros dados
    const message = `💰 *Pagamento gerado com sucesso!*\n\n` +
        `💸 *Valor do pagamento:* R$ ${valor}\n` +
        `👤 *Usuário:* ${user.nome}\n` +
        `📱 *WhatsApp:* ${user.whatsapp}\n` +
        `💵 *Saldo Atual:* R$ ${user.saldo}\n` +
        `🏦 *Método de pagamento:* PIX\n\n` +
        `🔔 Copie o código abaixo para concluir o pagamento. Assim que o pagamento for confirmado, seu saldo será atualizado automaticamente. 📈`;

    // Envia a primeira mensagem com o valor do pagamento gerado e outros dados
    try {
        await sendText(
            baseUrl,    // URL do servidor
            apikey,     // API Key configurada
            instance,   // Instância configurada
            user.whatsapp,  // Número de WhatsApp do usuário
            message                // Mensagem com valor do pagamento e dados do usuário
        );
    } catch (error) {
        console.error('Erro ao enviar a mensagem de valor do pagamento:', error.message);
    }

    // Enviar a segunda mensagem com o código PIX
    if (qr_code_base64) {
        try {
            await sendText(
                baseUrl,    // URL do servidor
                apikey,     // API Key configurada
                instance,   // Instância configurada
                user.whatsapp,         // Número de WhatsApp do usuário
                `${pix_code}` // Código PIX para o pagamento, sem mensagem personalizada
            );
        } catch (error) {
            console.error('Erro ao enviar o código PIX:', error.message);
        }
    }

    return {
        success: true,
        qr_code: qr_code_base64,
        pix_code,
        id: pagamentoId,
        point_of_interaction: result.point_of_interaction
    };
}

async function criarPixAsaas({ usuarioId, valor, metodoConfig }) {
    if (!metodoConfig || !metodoConfig.accessToken) throw new Error('Configuração do método inválida');

    const user = await usuario.findById(usuarioId);
    if (!user) throw new Error('Usuário não encontrado');

    const headers = { 'access_token': metodoConfig.accessToken };

    const customerRes = await axios.post('https://api.asaas.com/v3/customers', {
        name: user.nome,
        email: `${user.whatsapp}@fakemail.com`,
        mobilePhone: user.whatsapp
    }, { headers });

    const customerId = customerRes.data.id;

    const paymentRes = await axios.post('https://api.asaas.com/v3/payments', {
        customer: customerId,
        billingType: 'PIX',
        value: valor,
        description: `Pagamento de ${user.nome}`,
        callbackUrl: `${process.env.BASE_URL || 'https://botadmin.shop'}/asaas/pix`
    }, { headers });

    const pagamentoId = paymentRes.data.id;

    const qrRes = await axios.get(`https://api.asaas.com/v3/payments/${pagamentoId}/pixQrCode`, { headers });
    const pix = qrRes.data;

    const botApi = await BotApi.findOne({ status: true });
    if (botApi && pix.encodedImage) {
        const message = `💰 *Pagamento gerado com sucesso!*\n\n` +
            `💸 *Valor do pagamento:* R$ ${valor}\n` +
            `👤 *Usuário:* ${user.nome}`;
        try {
            await sendText(botApi.baseUrl, botApi.apikey, botApi.instance, user.whatsapp, message);
            await sendText(botApi.baseUrl, botApi.apikey, botApi.instance, user.whatsapp, `${pix.payload}`);
        } catch (err) {
            console.error('Erro ao enviar mensagens:', err.message);
        }
    }

    return {
        success: true,
        qr_code: pix.encodedImage,
        pix_code: pix.payload,
        id: pagamentoId
    };
}

async function criarPagamentoPix({ usuarioId, valor, metodo }) {
    const metodoConfig = await ConfigPagamento.findOne({ nome: metodo });
    if (!metodoConfig) throw new Error('Método inválido');

    if (metodoConfig.gateway === 'asaas') {
        return criarPixAsaas({ usuarioId, valor, metodoConfig });
    }
    return criarPixMercadoPago({ usuarioId, valor, metodoConfig });
}

// Cria um pagamento via Checkout do Mercado Pago (cartão)
async function criarPagamentoCartao({ usuarioId, valor, metodo, referencia }) {
    const metodoConfig = await ConfigPagamento.findOne({ nome: metodo });
    if (!metodoConfig || !metodoConfig.accessToken) throw new Error('Configuração do método inválida');

    const user = await usuario.findById(usuarioId);
    if (!user) throw new Error('Usuário não encontrado');

    const payload = {
        items: [{
            title: `Saldo para ${user.nome}`,
            quantity: 1,
            unit_price: valor,
            currency_id: 'BRL'
        }],
        payer: {
            name: user.nome,
            email: user.whatsapp + '@fakemail.com'
        },
        notification_url: `${process.env.BASE_URL || 'https://botadmin.shop'}/mercadopago/card`,
        external_reference: referencia
    };

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${metodoConfig.accessToken}`,
    };

    const res = await axios.post('https://api.mercadopago.com/checkout/preferences', payload, { headers });
    const result = res.data;

    return {
        id: result.id,
        init_point: result.init_point
    };
}

// Função para verificar status de pagamento PIX
async function verificarPixMercadoPago(pagamentoId, metodoConfig) {
    const url = `https://api.mercadopago.com/v1/payments/${pagamentoId}?access_token=${metodoConfig.accessToken}`;
    const res = await axios.get(url);
    const payment = res.data;

    let deposito = await Deposit.findOne({ id: pagamentoId });
    if (!deposito && payment.external_reference) {
        deposito = await Deposit.findOne({ referencia: payment.external_reference });
        if (deposito) {
            deposito.id = pagamentoId;
            await deposito.save();
        }
    }
    if (!deposito) throw new Error('Depósito não encontrado');

        if (payment.status === 'approved' && deposito.status === 'pendente') {
            deposito.status = 'aprovado';
            deposito.detalhes = payment;
            await deposito.save();

            const user = await usuario.findById(deposito.usuario);
            user.saldo += deposito.valor;
            await user.save();

            // Enviar a confirmação de pagamento aprovado
            const confirmMessage = `🎉 Seu pagamento foi aprovado! Seu saldo foi atualizado com sucesso.`;
            try {
                const botApi = await BotApi.findOne({ status: true });
                if (botApi) {
                    await sendText(botApi.baseUrl, botApi.apikey, botApi.instance, user.whatsapp, confirmMessage);
                }
            } catch (error) {
                console.error('Erro ao enviar mensagem de confirmação de pagamento:', error.message);
            }
        }

    return {
        status: payment.status,
        detalhes: payment,
    };
}

async function verificarPixAsaas(pagamentoId, metodoConfig) {
    const headers = { 'access_token': metodoConfig.accessToken };
    const res = await axios.get(`https://api.asaas.com/v3/payments/${pagamentoId}`, { headers });
    const payment = res.data;

    let deposito = await Deposit.findOne({ id: pagamentoId });
    if (!deposito && payment.externalReference) {
        deposito = await Deposit.findOne({ referencia: payment.externalReference });
        if (deposito) {
            deposito.id = pagamentoId;
            await deposito.save();
        }
    }
    if (!deposito) throw new Error('Depósito não encontrado');

    if (payment.status === 'RECEIVED' && deposito.status === 'pendente') {
        deposito.status = 'aprovado';
        deposito.detalhes = payment;
        await deposito.save();

        const user = await usuario.findById(deposito.usuario);
        user.saldo += deposito.valor;
        await user.save();

        const confirmMessage = `🎉 Seu pagamento foi aprovado! Seu saldo foi atualizado com sucesso.`;
        try {
            const botApi = await BotApi.findOne({ status: true });
            if (botApi) {
                await sendText(botApi.baseUrl, botApi.apikey, botApi.instance, user.whatsapp, confirmMessage);
            }
        } catch (err) {
            console.error('Erro ao enviar mensagem de confirmação de pagamento:', err.message);
        }
    }

    return {
        status: payment.status,
        detalhes: payment,
    };
}

async function verificarPagamentoPix(pagamentoId, metodo) {
    try {
        const metodoConfig = await ConfigPagamento.findOne({ nome: metodo });
        if (!metodoConfig || !metodoConfig.accessToken) throw new Error('Configuração do método inválida');

        if (metodoConfig.gateway === 'asaas') {
            return await verificarPixAsaas(pagamentoId, metodoConfig);
        }
        return await verificarPixMercadoPago(pagamentoId, metodoConfig);
    } catch (err) {
        console.error('[Verificar PIX] Erro:', err);
        return { status: 'erro', message: err.message };
    }
}

module.exports = {
    criarPagamentoPix,
    criarPagamentoCartao,
    verificarPagamentoPix,
};
