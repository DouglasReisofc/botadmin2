const express = require('express');
const multer = require('multer');
const storage = multer.memoryStorage(); // ou diskStorage se quiser salvar o arquivo
const upload = multer({ storage });
const axios = require('axios');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');  // Usando bcrypt para criptografia
const { adicionarSaldo } = require('../db/db');
const { randomText, gerarCodigoVerificacao, enviarCodigoWhatsapp } = require('../funcoes/function');
const { verificar_nome, add_usuario } = require('../db/db');
const { notAuthenticated, isAuthenticated, isAdmin } = require('../funcoes/auth'); // Corrigido aqui
const { usuario } = require('../db/model');
const { Plano } = require('../db/planos');
const { ExtraPlan } = require('../db/extraPlan');
const { criarBot, editarGrupoBot, excluirBot, checarLimites, garantirPlanoAtivoMiddleware, garantirGrupoCadastradoMiddleware, verificarLimiteInstancias } = require('../db/bot');
const { BotApi } = require('../db/botApi');
const Sorteio = require('../db/Sorteio');
const {
    sendText,
    sendMedia,
    sendReaction,
    sendPoll,
    markMessageAsRead,
    deleteMessageForEveryone,
    editText,
    updateGroupParticipants,
    getGroqReply,
    acceptGroupInvite,
    getGroupInviteInfo,
    findGroupInfos,
    convertQuotedToSticker,
    forwardWithMentionAll,
    downloadMedia,
    fixarMensagem,
    desfixarMensagem,
    transcribeAudioGroq,
    synthesizeGroqSpeech,
    synthesizegesseritTTS,
    openGroupWindow
} = require('../db/waActions');

// CORRETO:
const { BotConfig } = require('../db/botConfig');
const { criarPagamentoPix, criarPagamentoCartao } = require('../db/pagamento');
const Deposit = require('../db/deposits');
const ConfigPagamento = require('../db/configpagamentos');
const path = require('path');
const fs = require('fs/promises');
const { port, basesiteUrl, limitPremium } = require('../configuracao');
const { normalizeJid } = require('../utils/phone');



router.post('/entrar', async (req, res, next) => {

    // Autenticação com passport
    passport.authenticate('local', async (err, user, info) => {
        if (err) return next(err);

        if (!user) {
            req.flash('error_msg', '❌ Credenciais inválidas. Verifique seu nome de usuário e senha.');
            return res.redirect('/entrar');
        }

        req.logIn(user, async (err) => {
            if (err) return next(err);

            if (req.body.remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            } else {
                req.session.cookie.expires = false;
            }

            if (!user.whatsappVerificado) {
                const novoCodigo = gerarCodigoVerificacao();

                await usuario.findOneAndUpdate(
                    { _id: user._id },
                    { codigoVerificacao: novoCodigo }
                );

                await enviarCodigoWhatsapp(user.whatsapp, novoCodigo);

                req.flash('error_msg', '📲 Verifique seu WhatsApp antes de continuar. Um novo código foi enviado.');
                return res.redirect('/usuario/verificar-whatsapp');
            }

            // 👉 Aqui flashamos a mensagem de boas-vindas
            req.flash('success_msg', `👋 Bem-vindo, Sr. ${user.nome}!`);

            // redireciona para a área certa
            return res.redirect(user.admin ? '/admin' : '/painel');
        });
    })(req, res, next);
});




// Rota de logout
router.get('/sair', (req, res) => {
    req.logout(req.user, err => {
        req.flash('success_msg', 'Até Logo');
        if (err) return next(err);
        delete req.session.adminId;
        res.redirect('/');
    });
});


router.post('/registrar', async (req, res) => {
    try {
        let { username, password, confirmPassword, whatsapp, ddi } = req.body;

        ddi = ddi.replace(/\D/g, '');
        whatsapp = whatsapp.replace(/\D/g, '');

        const numeroCompleto = `${ddi}${whatsapp}`;

        if (!password || !confirmPassword || password.length < 6 || confirmPassword.length < 6) {
            req.flash('error_msg', '❌ A senha precisa ter no mínimo 6 caracteres.');
            return res.redirect('/cadastrar');
        }

        if (password !== confirmPassword) {
            req.flash('error_msg', '❌ As senhas não coincidem.');
            return res.redirect('/cadastrar');
        }

        const checking = await verificar_nome(username);
        if (checking) {
            req.flash('error_msg', '⚠️ Este nome de usuário já está em uso.');
            return res.redirect('/cadastrar');
        }

        let usuarioComWhatsapp = null;

        if (ddi === '55' && whatsapp.length >= 10) {
            const sem9 = whatsapp.replace(/^(\d{2})9/, '$1');
            const com9 = whatsapp.replace(/^(\d{2})(\d)/, '$19$2');
            const candidatos = [`55${whatsapp}`, `55${sem9}`, `55${com9}`];

            usuarioComWhatsapp = await usuario.findOne({ whatsapp: { $in: candidatos } });
        } else {
            usuarioComWhatsapp = await usuario.findOne({ whatsapp: numeroCompleto });
        }

        if (usuarioComWhatsapp) {
            req.flash('error_msg', '⚠️ Este número de WhatsApp já está associado a outro usuário.');
            return res.redirect('/cadastrar');
        }

        whatsapp = numeroCompleto;

        const hashedPassword = await bcrypt.hash(password, 10);
        const apikey = randomText(8);
        const codigo = gerarCodigoVerificacao();

        const novoUsuario = await add_usuario(username, hashedPassword, apikey, whatsapp, codigo);
        await enviarCodigoWhatsapp(whatsapp, codigo);

        req.logIn(novoUsuario, async (err) => {
            if (err) {
                req.flash('error_msg', '❌ Erro ao logar automaticamente após o registro.');
                return res.redirect('/cadastrar');
            }

            if (!novoUsuario.whatsappVerificado) {
                const novoCodigo = gerarCodigoVerificacao();
                await usuario.findOneAndUpdate(
                    { _id: novoUsuario._id },
                    { codigoVerificacao: novoCodigo }
                );
                await enviarCodigoWhatsapp(novoUsuario.whatsapp, novoCodigo);

                req.flash('error_msg', '📲 Você precisa verificar seu WhatsApp. Um novo código foi enviado.');
                return res.redirect('/usuario/verificar-whatsapp');
            }

            return res.redirect(novoUsuario.admin ? '/admin' : '/painel');
        });

    } catch (err) {
        console.error(err);
        req.flash('error_msg', '❌ Houve um erro ao registrar. Tente novamente.');
        return res.redirect('/cadastrar');
    }
});






// Rota para verificar o WhatsApp - agora protegida pela autenticação
router.get('/verificar-whatsapp', isAuthenticated, (req, res) => {
    res.render('verificar_whatsapp', {
        layout: false
    });
});


router.post('/atualizar-whatsapp', isAuthenticated, async (req, res) => {
    try {
        let { ddi, novoWhatsapp } = req.body;
        ddi = ddi.replace(/\D/g, '');
        novoWhatsapp = novoWhatsapp.replace(/\D/g, '');

        const whatsappCompleto = `${ddi}${novoWhatsapp}`;

        let existe = null;

        if (ddi === '55' && novoWhatsapp.length >= 10) {
            const sem9 = novoWhatsapp.replace(/^(\d{2})9/, '$1');
            const com9 = novoWhatsapp.replace(/^(\d{2})(\d)/, '$19$2');
            const candidatos = [`55${novoWhatsapp}`, `55${sem9}`, `55${com9}`];

            existe = await usuario.findOne({
                whatsapp: { $in: candidatos },
                _id: { $ne: req.user._id }
            });
        } else {
            existe = await usuario.findOne({
                whatsapp: whatsappCompleto,
                _id: { $ne: req.user._id }
            });
        }

        if (existe) {
            req.flash('error_msg', 'Este número já está em uso por outro usuário.');
            return res.redirect('/usuario/verificar-whatsapp');
        }

        const codigo = gerarCodigoVerificacao();
        await usuario.findOneAndUpdate(
            { _id: req.user._id },
            { whatsapp: whatsappCompleto, codigoVerificacao: codigo }
        );

        await enviarCodigoWhatsapp(whatsappCompleto, codigo);
        req.flash('success_msg', '✅ Número atualizado. Um novo código foi enviado.');
        res.redirect('/usuario/verificar-whatsapp');

    } catch (err) {
        console.error('Erro ao atualizar WhatsApp:', err);
        req.flash('error_msg', 'Erro ao atualizar número.');
        res.redirect('/usuario/verificar-whatsapp');
    }
});

router.get('/reenviar-codigo', isAuthenticated, async (req, res) => {
    try {
        const user = req.user;

        if (!user) {
            req.flash('error_msg', 'Usuário não autenticado.');
            return res.redirect('/');
        }

        const novoCodigo = gerarCodigoVerificacao();

        // Atualiza o código no banco
        await usuario.findOneAndUpdate(
            { _id: user._id },
            { codigoVerificacao: novoCodigo }
        );

        // Envia o novo código para o número atual
        await enviarCodigoWhatsapp(user.whatsapp, novoCodigo);

        req.flash('success_msg', '✅ Um novo código de verificação foi enviado para seu WhatsApp.');
        return res.redirect('/usuario/verificar-whatsapp');

    } catch (err) {
        console.error('Erro ao reenviar código:', err);
        req.flash('error_msg', 'Erro ao reenviar o código. Tente novamente mais tarde.');
        return res.redirect('/usuario/verificar-whatsapp');
    }
});



// Rota POST para verificar o código do WhatsApp
router.post('/verificar-whatsapp', async (req, res) => {
    const { codigoVerificacao } = req.body;
    const user = req.user;

    try {
        if (!user) {
            req.flash('error_msg', 'Usuário não encontrado. Faça login novamente.');
            return res.redirect('/usuario/verificar-whatsapp');
        }

        if (!user.codigoVerificacao) {
            req.flash('error_msg', 'Não há código de verificação disponível para este usuário.');
            return res.redirect('/usuario/verificar-whatsapp');
        }

        if (user.codigoVerificacao === codigoVerificacao) {
            await usuario.findOneAndUpdate(
                { _id: user._id },
                { whatsappVerificado: true, codigoVerificacao: null }
            );

            req.flash('success_msg', '✅ WhatsApp verificado com sucesso!');
            return res.redirect('/painel');
        } else {
            req.flash('error_msg', '❌ Código incorreto. Tente novamente.');
            return res.redirect('/usuario/verificar-whatsapp');
        }
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao verificar o código. Tente novamente mais tarde.');
        return res.redirect('/usuario/verificar-whatsapp');
    }
});

router.post('/criarbot', isAuthenticated, async (req, res) => {
    const { botApi, linkGrupo } = req.body;

    try {
        if (!botApi || !linkGrupo) {
            req.flash('error_msg', '⚠️ Bot e link do grupo são obrigatórios.');
            return res.redirect('/grupos');
        }

        const [api, user] = await Promise.all([
            BotApi.findOne({ $or: [{ _id: botApi }, { instance: botApi }] }),
            usuario.findById(req.user._id)
        ]);

        if (!api) throw new Error('Bot API não encontrada.');
        if (!user) throw new Error('Usuário não encontrado.');

        // ⛔️ Checa limite com base no plano do usuário
        try {
            await checarLimites(user, api._id);
        } catch (e) {
            req.flash('error_msg', e.message);
            return res.redirect('/planos');
        }

        await criarBot(user._id, api._id, linkGrupo, api.instance);

        req.flash('success_msg', '✅ Bot criado com sucesso!');
        req.session.showCmdGuide = true;
        res.redirect('/grupos');
    } catch (err) {
        console.error('❌ Erro ao criar o bot:', err.message);
        req.flash('error_msg', `❌ ${err.message}`);
        res.redirect('/grupos');
    }
});


router.post('/editarbot', isAuthenticated, async (req, res) => {
    const { botId, linkGrupo } = req.body;

    try {
        if (!botId || !linkGrupo) {
            throw new Error('ID do bot e novo link do grupo são obrigatórios.');
        }

        await editarGrupoBot(botId, linkGrupo);

        req.flash('success_msg', '✅ Grupo do bot atualizado com sucesso!');
        res.redirect('/grupos');
    } catch (err) {
        console.error("❌ Erro ao editar o bot:", err.message);
        req.flash('error_msg', '❌ ' + err.message);
        res.redirect('/grupos');
    }
});

router.post('/excluirbot', isAuthenticated, async (req, res) => {
    const { botId } = req.body;

    try {
        if (!botId) {
            throw new Error('ID do bot é obrigatório para exclusão.');
        }

        const bot = await BotConfig.findById(botId);
        if (!bot) throw new Error('Bot não encontrado.');

        if (!bot.user.equals(req.user._id)) {
            throw new Error('Você não tem permissão para excluir este grupo.');
        }

        await excluirBot(botId);

        req.flash('success_msg', '✅ Grupo excluído com sucesso.');
        res.redirect('/grupos');
    } catch (err) {
        console.error("❌ Erro ao excluir bot:", err.message);
        req.flash('error_msg', '❌ ' + err.message);
        res.redirect('/grupos');
    }
});






router.post(
    '/grupos/ativacoes',
    isAuthenticated,
    upload.single('bemvindoArquivo'),
    async (req, res) => {
        const {
            botId,
            comandos,
            status,
            prefixo,
            removerImagem = '0',
            bemvindoLegenda = '',
            bemvindoLink = '',
            bemvindoSticker = '',
            botinteragePrompt = ''
        } = req.body;
        const arquivo = req.file;

        try {
            const bot = await BotConfig.findOne({ _id: botId, user: req.user._id });
            if (!bot) {
                req.flash('error_msg', 'Bot não encontrado ou você não tem permissão.');
                return res.redirect('/grupos/ativacoes');
            }

            // 1) atualiza comandos apenas se vier no body
            if (typeof comandos !== 'undefined') {
                let allowed = (req.user.planoContratado?.allowedCommands) || {};
                if (req.user.planoContratado?.isFree) {
                    const freeDoc = await Plano.findOne({ isFree: true });
                    if (freeDoc) allowed = freeDoc.allowedCommands || {};
                }
                for (const cmd in bot.comandos) {
                    if (!allowed[cmd]) continue;
                    const ativo = ['on', 'true', '1', 'checked']
                        .includes((comandos[cmd] || '').toString());
                    bot.comandos[cmd] = ativo;
                }
            }

            // 2) atualiza status e prefixo se vierem
            if (typeof status !== 'undefined') {
                bot.status = !!status;
            }
            if (typeof prefixo === 'string' && prefixo.trim()) {
                bot.prefixo = prefixo.trim();
            }

            // 3) atualiza prompt se vier
            if (typeof botinteragePrompt === 'string') {
                bot.botinteragePrompt = botinteragePrompt.trim();
            }

            // 4) lógica de boas-vindas
            // só mexe em bemvindo se modal enviou alguma coisa
            const alterouBemvindo = (
                arquivo != null ||
                removerImagem === '1' ||
                bemvindoLegenda.trim() !== '' ||
                typeof bemvindoLink !== 'undefined' ||
                typeof bemvindoSticker !== 'undefined'
            );

            if (alterouBemvindo) {
                const anterior = bot.bemvindo || {};
                const legenda = bemvindoLegenda.trim();
                const novoLink = (bemvindoLink || '').trim();
                const flagSticker = ['on', 'true', '1'].includes((bemvindoSticker || '').toString());

                if (arquivo) {
                    // salva nova imagem
                    if (anterior.filePath) {
                        await fs.unlink(anterior.filePath).catch(() => { });
                    }
                    const ext = path.extname(arquivo.originalname).slice(1);
                    const nome = `bemvindo_${Date.now()}.${ext}`;
                    const pasta = path.join('arquivos', bot.groupId);
                    await fs.mkdir(pasta, { recursive: true });
                    const caminho = path.join(pasta, nome);
                    await fs.writeFile(caminho, arquivo.buffer);

                    bot.bemvindo = {
                        caption: legenda,
                        filePath: caminho.replace(/\\/g, '/'),
                        fileName: nome,
                        mimetype: arquivo.mimetype,
                        externalUrl: '',
                        asSticker: flagSticker,
                        hasMedia: true,
                        updatedAt: new Date()
                    };

                } else if (removerImagem === '1') {
                    // remove imagem antiga
                    if (anterior.filePath) {
                        await fs.unlink(anterior.filePath).catch(() => { });
                    }
                    bot.bemvindo = {
                        caption: legenda,
                        filePath: '',
                        fileName: '',
                        mimetype: '',
                        externalUrl: novoLink,
                        asSticker: flagSticker,
                        hasMedia: !!novoLink,
                        updatedAt: new Date()
                    };

                } else {
                    bot.bemvindo.caption = legenda;
                    bot.bemvindo.externalUrl = novoLink;
                    bot.bemvindo.asSticker = flagSticker;
                    bot.bemvindo.hasMedia = !!(novoLink || bot.bemvindo.filePath);
                    bot.bemvindo.updatedAt = new Date();
                }
            }

            await bot.save();
            req.flash('success_msg', 'Bot atualizado com sucesso.');
            res.redirect('/grupos/ativacoes');
        }
        catch (err) {
            console.error('❌ Erro ao atualizar bot:', err);
            req.flash('error_msg', 'Erro ao atualizar bot.');
            res.redirect('/grupos/ativacoes');
        }
    }
);


router.post(
    '/grupos/ativacoes/toggle',
    isAuthenticated,
    express.json(),
    async (req, res) => {
        try {
            const { botId, field, command, value } = req.body;
            const bot = await BotConfig.findOne({ _id: botId, user: req.user._id });
            if (!bot) return res.status(404).json({ ok: false, error: 'Bot não encontrado' });

            let allowed = req.user.planoContratado?.allowedCommands || {};
            if (req.user.planoContratado?.isFree) {
                const freeDoc = await Plano.findOne({ isFree: true });
                if (freeDoc) allowed = freeDoc.allowedCommands || {};
            }

            if (field === 'status') {
                bot.status = !!value;
            } else if (field === 'comando' && command) {
                if (!allowed[command]) {
                    return res.status(403).json({ ok:false, error:'Comando não disponível no plano' });
                }
                bot.comandos[command] = !!value;
            } else {
                return res.status(400).json({ ok: false, error: 'Parâmetros inválidos' });
            }

            await bot.save();
            return res.json({ ok: true });
        } catch (err) {
            console.error('Toggle error:', err);
            return res.status(500).json({ ok: false, error: 'Erro interno' });
        }
    }
);

router.post('/grupos/links-permitidos', isAuthenticated, async (req, res) => {
    const { botId, linksPermitidos } = req.body;

    try {
        const bot = await BotConfig.findOne({ _id: botId, user: req.user._id });
        if (!bot) {
            req.flash('error_msg', 'Bot não encontrado ou você não tem permissão.');
            return res.redirect('/grupos/ativacoes');
        }

        bot.linksPermitidos = (linksPermitidos || '')
            .split('\n')
            .map(d => d.trim().toLowerCase())
            .filter(d => d.length > 0 && d.includes('.'));

        await bot.save();

        req.flash('success_msg', '✅ Links permitidos atualizados com sucesso.');
        res.redirect('/grupos/ativacoes');
    } catch (err) {
        console.error('Erro ao atualizar links permitidos:', err.message);
        req.flash('error_msg', 'Erro ao atualizar links permitidos.');
        res.redirect('/grupos/ativacoes');
    }
});

// Rota para atualizar DDIs permitidos (similar a links-permitidos)
router.post('/grupos/ddi-permitidos', isAuthenticated, async (req, res) => {
    const { botId, ddiPermitidos } = req.body;

    try {
        const bot = await BotConfig.findOne({ _id: botId, user: req.user._id });
        if (!bot) {
            req.flash('error_msg', 'Bot não encontrado ou sem permissão.');
            return res.redirect('/grupos/ativacoes');
        }

        // recebe uma string com DDIs separados por nova linha, vírgula ou espaço
        bot.ddiPermitidos = (ddiPermitidos || '')
            .split(/[\s,;\n]+/)          // quebra por espaço, vírgula, ponto-e-vírgula ou nova linha
            .map(d => d.trim())          // remove espaços sobrando
            .filter(d => /^\d+$/.test(d)); // mantém apenas strings numéricas

        await bot.save();

        req.flash('success_msg', '✅ DDIs permitidos atualizados com sucesso.');
        res.redirect('/grupos/ativacoes');
    } catch (err) {
        console.error('Erro ao atualizar DDIs permitidos:', err.message);
        req.flash('error_msg', '❌ Erro ao atualizar DDIs permitidos.');
        res.redirect('/grupos/ativacoes');
    }
});

// Atualizar API key da IA
router.post('/grupos/apikey', isAuthenticated, async (req, res) => {
    const { botId, groqKey } = req.body;
    try {
        const bot = await BotConfig.findOne({ _id: botId, user: req.user._id });
        if (!bot) {
            req.flash('error_msg', 'Bot não encontrado ou sem permissão.');
            return res.redirect('/grupos/ativacoes');
        }
        bot.groqKey = (groqKey || '')
            .split(/[\n,]+/)
            .map(k => k.trim())
            .filter(k => k.length)
            .join('\n');
        await bot.save();
        req.flash('success_msg', '✅ API Key atualizada com sucesso.');
        res.redirect('/grupos/ativacoes');
    } catch (err) {
        console.error('Erro ao atualizar API Key:', err.message);
        req.flash('error_msg', '❌ Erro ao atualizar API Key.');
        res.redirect('/grupos/ativacoes');
    }
});

// Atualizar horário de abrir/fechar grupo
router.post('/grupos/horario', isAuthenticated, async (req, res) => {
    const { botId, abrir = '', fechar = '', ativo } = req.body;
    try {
        const bot = await BotConfig.findOne({ _id: botId, user: req.user._id })
            .populate('botApi');
        if (!bot) {
            req.flash('error_msg', 'Bot não encontrado ou sem permissão.');
            return res.redirect('/grupos/horario');
        }

        const botJidNorm = normalizeJid(`${bot.botApi.instance}@c.us`);
        const botAdmin = (bot.participantes || []).some(p =>
            normalizeJid(p.id) === botJidNorm && ['admin', 'superadmin'].includes(p.admin)
        );

        if (!botAdmin && ativo === 'on') {
            req.flash('error_msg', '⚠️ Ative o bot como administrador do grupo para usar esta função.');
            return res.redirect(`/grupos/horario?grupo=${bot.groupId}`);
        }

        bot.horarioGrupo.abrir = abrir === '0' ? '' : abrir.trim();
        bot.horarioGrupo.fechar = fechar === '0' ? '' : fechar.trim();
        bot.horarioGrupo.ativo = ativo === 'on' && botAdmin;
        await bot.save();
        req.flash('success_msg', '✅ Horários atualizados com sucesso.');
        res.redirect(`/grupos/horario?grupo=${bot.groupId}`);
    } catch (err) {
        console.error('Erro ao atualizar horário:', err.message);
        req.flash('error_msg', 'Erro ao atualizar horário.');
        res.redirect('/grupos/horario');
    }
});



router.post('/saldo', isAuthenticated, async (req, res) => {
    const { valor, metodoId } = req.body;

    try {
        if (!valor || !metodoId) {
            req.flash('error_msg', 'Informe o valor e o método de pagamento');
            return res.redirect('/saldo');
        }

        const metodo = await ConfigPagamento.findOne({ _id: metodoId, status: true });
        if (!metodo || !metodo.accessToken) throw new Error('Método inválido');

        const valorFloat = parseFloat(valor);
        if (isNaN(valorFloat) || valorFloat < 1) throw new Error('Valor inválido');

        const referencia = 'REF-' + Date.now();

        if ((metodo.tipo && metodo.tipo === 'cartao') || metodo.nome.includes('cartao')) {
            const pagamento = await criarPagamentoCartao({
                usuarioId: req.user._id,
                valor: valorFloat,
                metodo: metodo.nome,
                referencia
            });

            let deposito = await Deposit.findOne({ id: pagamento.id });
            if (!deposito) {
                deposito = new Deposit({
                    usuario: req.user._id,
                    valor: valorFloat,
                    metodo: metodo.nome,
                    status: 'pendente',
                    referencia,
                    id: pagamento.id,
                    detalhes: { init_point: pagamento.init_point }
                });
                await deposito.save();
            }

            return res.redirect(pagamento.init_point);
        }

        const pagamento = await criarPagamentoPix({
            usuarioId: req.user._id,
            valor: valorFloat,
            metodo: metodo.nome
        });

        let deposito = await Deposit.findOne({ id: pagamento.id });

        const qrBase64 = pagamento.qr_code;
        const pixCode = pagamento.pix_code;

        if (deposito) {
            if (qrBase64 && pixCode) {
                req.session.qrCode = qrBase64;
                req.session.pixCode = pixCode;
                req.session.pagamentoId = pagamento.id;
            }

            req.flash('success_msg', 'Depósito já existente. Use o QR Code abaixo.');
            return res.redirect('/saldo');
        }

        deposito = new Deposit({
            usuario: req.user._id,
            valor: valorFloat,
            metodo: metodo.nome,
            status: 'pendente',
            referencia,
            id: pagamento.id,
            detalhes: {
                qr_code: pagamento.qr_code,
                pix_code: pagamento.pix_code,
                point_of_interaction: pagamento.point_of_interaction
            }
        });

        await deposito.save();

        req.session.qrCode = qrBase64;
        req.session.pixCode = pixCode;
        req.session.pagamentoId = pagamento.id;

        req.flash('success_msg', 'Depósito criado. Use o QR Code abaixo.');
        res.redirect('/saldo');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao criar pagamento: ' + err.message);
        res.redirect('/saldo');
    }
});


router.get('/statuspix/:id', async (req, res) => {
    const pagamentoId = req.params.id;

    try {
        const deposito = await Deposit.findOne({ id: pagamentoId });
        if (!deposito) return res.status(404).json({ status: 'nao_encontrado' });

        return res.json({ status: deposito.status });
    } catch (err) {
        console.error('[STATUS PIX] Erro ao verificar status:', err);
        return res.status(500).json({ status: 'erro' });
    }
});

router.post('/comprar-plano', isAuthenticated, async (req, res) => {
    try {
        const user = await usuario.findById(req.user._id);
        const plano = await Plano.findById(req.body.planoId);

        if (!plano || !user) {
            req.flash('error_msg', 'Plano ou usuário não encontrado.');
            return res.redirect('/planos');
        }

        // ==== TESTE GRÁTIS =====================================================
        const podeTestar = plano.testeGratis && !user.testeGratisUsado;


        // 1) Se for teste: não desconta saldo nem cobra.
        // 2) Se não for teste: valida saldo normalmente.
        if (!podeTestar && user.saldo < plano.preco) {
            req.flash('error_msg', 'Saldo insuficiente. Adicione saldo primeiro.');
            return res.redirect('/saldo');
        }

        // Calcula vencimento (dias de teste OU dias do plano)
        const hoje = new Date();
        const dias = podeTestar ? (plano.diasTeste || 7) : plano.duracao;
        const vencimento = new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);

        // Define plano no usuário
        user.planoContratado = {
            nome: plano.nome,
            preco: plano.preco,
            duracao: plano.duracao,
            descricao: plano.descricao || '',
            limiteGrupos: plano.limiteGrupos || 1,
            limiteInstancias: plano.limiteInstancias || 0,
            includedAds: plano.includedAds || 0,
            includedShortLinks: plano.includedShortLinks || 0,
            isFree: plano.isFree,
            allowedCommands: plano.allowedCommands || {}
        };
        user.planoVencimento = vencimento;

        if (!plano.isFree) {
            user.premium = vencimento;
            user.limit = limitPremium;
        } else {
            user.premium = null;
            user.limit = 10;
        }

        // Extras inclusos - substitui os do plano atual
        if (plano.includedAds && plano.includedAds > 0) {
            user.adQuotas = (user.adQuotas || []).filter(q => q.source !== 'plan');
            user.adQuotas.push({ limite: plano.includedAds, dias: plano.duracao, source: 'plan' });
        }
        if (plano.includedShortLinks && plano.includedShortLinks > 0) {
            const extras = user.shortLinkExtras || 0;
            user.shortLinkLimit = plano.includedShortLinks + extras;
        } else {
            // plano sem links inclusos, mantém apenas extras comprados
            user.shortLinkLimit = user.shortLinkExtras || 0;
        }

        // Marca teste grátis como usado
        if (podeTestar) {
            user.testeGratisUsado = true;
        } else {
            // cobra apenas se NÃO for teste
            user.saldo -= plano.preco;
        }

        await user.save();

        // Desativa comandos que não fazem parte do novo plano
        const allowed = user.planoContratado.allowedCommands || {};
        const disableFields = {};
        Object.keys(allowed).forEach(cmd => {
            if (!allowed[cmd]) {
                disableFields[`comandos.${cmd}`] = false;
            }
        });
        if (Object.keys(disableFields).length > 0) {
            await BotConfig.updateMany({ user: user._id }, { $set: disableFields });
        }

        req.flash('success_msg',
            podeTestar
                ? `Teste grátis ativado por ${dias} dias!`
                : 'Plano contratado com sucesso!'
        );
        res.redirect('/painel');
    } catch (err) {
        console.error('Erro ao contratar plano:', err);
        req.flash('error_msg', 'Erro ao contratar plano.');
        res.redirect('/planos');
    }
});


router.post('/renovar-plano', isAuthenticated, async (req, res) => {
    try {
        const user = await usuario.findById(req.user._id);
        if (!user || !user.planoContratado) {
            req.flash('error_msg', 'Você não possui um plano ativo para renovar.');
            return res.redirect('/planos');
        }

        const { preco, duracao, includedAds = 0, includedShortLinks = 0, isFree } = user.planoContratado;

        if (!isFree) {
            if (user.saldo < preco) {
                req.flash('error_msg', `Saldo insuficiente. Você precisa de R$ ${preco.toFixed(2)} para renovar.`);
                return res.redirect('/saldo');
            }
        } else {
            // se o plano é free, só pode renovar quando vencer
            if (user.planoVencimento && user.planoVencimento > Date.now()) {
                req.flash('error_msg', 'O plano gratuito ainda está ativo. Aguarde o vencimento.');
                return res.redirect('/planos');
            }
        }

        const baseDate = (user.planoVencimento && user.planoVencimento > Date.now())
            ? new Date(user.planoVencimento)
            : new Date();
        baseDate.setDate(baseDate.getDate() + duracao);

        user.planoVencimento = baseDate;

        if (!isFree) {
            user.premium = baseDate;
            user.limit = limitPremium;
            user.saldo -= preco;
        } else {
            user.premium = null;
            user.limit = 10;
        }

        // sobrescreve extras do plano
        if (includedAds > 0) {
            user.adQuotas = (user.adQuotas || []).filter(q => q.source !== 'plan');
            user.adQuotas.push({ limite: includedAds, dias: duracao, source: 'plan' });
        }

        const extras = user.shortLinkExtras || 0;
        if (includedShortLinks > 0) {
            user.shortLinkLimit = includedShortLinks + extras;
        } else {
            user.shortLinkLimit = extras;
        }

        await user.save();
        req.flash('success_msg', 'Plano renovado com sucesso!');
        res.redirect('/planos');
    } catch (err) {
        console.error('Erro ao renovar plano:', err);
        req.flash('error_msg', 'Erro ao renovar plano.');
        res.redirect('/planos');
    }
});

router.post('/comprar-extra', isAuthenticated, async (req, res) => {
    try {
        const user = await usuario.findById(req.user._id);
        const extra = await ExtraPlan.findById(req.body.extraId);

        if (!extra || !user) {
            req.flash('error_msg', 'Plano extra não encontrado.');
            return res.redirect('/extras');
        }

        if (user.saldo < extra.preco) {
            req.flash('error_msg', 'Saldo insuficiente.');
            return res.redirect('/saldo');
        }

        const expira = new Date(Date.now() + extra.dias * 24 * 60 * 60 * 1000);

        if (extra.tipo === 'premium') {
            const base = user.premium && user.premium > Date.now()
                ? new Date(user.premium)
                : new Date();
            base.setDate(base.getDate() + extra.dias);
            user.premium = base;
            if (user.planoContratado) {
                user.planoVencimento = base;
            }
            user.limit = limitPremium;
        } else if (extra.tipo === 'ads') {
            // registra apenas a quantidade e a duração de cada anúncio
            user.adQuotas.push({ limite: extra.quantidadeAds, dias: extra.dias, source: 'extra' });
        } else if (extra.tipo === 'shortener') {
            user.shortLinkExtras = (user.shortLinkExtras || 0) + extra.quantidadeLinks;
            user.shortLinkLimit = (user.shortLinkLimit || 0) + extra.quantidadeLinks;
        }

        user.saldo -= extra.preco;
        await user.save();

        req.flash('success_msg', 'Plano extra adquirido!');
        if (extra.tipo === 'ads') {
            return res.redirect('/meus-anuncios');
        }
        res.redirect('/painel');
    } catch (err) {
        console.error('Erro ao comprar extra:', err);
        req.flash('error_msg', 'Erro ao comprar plano extra.');
        res.redirect('/extras');
    }
});




router.post('/enviarmensagem', isAuthenticated, upload.single('arquivo'), async (req, res) => {
    const { grupo, mensagem, mencionarTodos } = req.body;

    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id }).populate('botApi');

        if (!bot) {
            req.flash('error_msg', 'Bot não encontrado.');
            return res.redirect('/grupos/mensagem');
        }

        const apiUrl = bot.botApi.baseUrl;
        const apikey = bot.botApi.apikey;
        const instance = bot.botApi.instance;

        const mentions = mencionarTodos ? bot.participantes.map(p => p.id) : null;

        if (req.file) {
            const bufferBase64 = req.file.buffer.toString('base64');
            const mimetype = req.file.mimetype;
            const fileName = req.file.originalname;

            let mediaType = 'document';
            if (mimetype.startsWith('image/')) mediaType = 'image';
            else if (mimetype.startsWith('video/')) mediaType = 'video';
            else if (mimetype.startsWith('audio/')) mediaType = 'audio';

            const payload = {
                number: grupo,
                mediatype: mediaType,
                mimetype,
                caption: mensagem || '',
                media: `data:${mimetype};base64,${bufferBase64}`,
                fileName,
                mentionAll: !!mencionarTodos
            };

            console.log('📤 Enviando mídia:', payload);

            const response = await axios.post(`${apiUrl}/api/message/media`, { instance, ...payload }, {
                headers: { apikey }
            });

            console.log('✅ Mídia enviada:', response.data);
        } else if (mensagem) {
            const payload = {
                instance,
                number: grupo,
                message: mensagem,
                mentionAll: !!mencionarTodos
            };

            console.log('📤 Enviando texto:', payload);

            const response = await axios.post(`${apiUrl}/api/message`, payload, {
                headers: { apikey }
            });

            console.log('✅ Texto enviado:', response.data);
        } else {
            req.flash('error_msg', 'Preencha a mensagem ou envie uma mídia.');
            return res.redirect('/grupos/mensagem');
        }

        req.flash('success_msg', '✅ Mensagem enviada com sucesso.');
        res.redirect('/grupos/mensagem');

    } catch (err) {
        console.error('❌ Erro ao enviar mensagem:', err.response?.data || err.message);
        req.flash('error_msg', 'Erro ao enviar mensagem. Verifique os dados.');
        res.redirect('/grupos/mensagem');
    }
});



router.post('/grupos/tabela/editar', isAuthenticated, async (req, res) => {
    const { grupo, tabela } = req.body;

    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });

        if (!bot) {
            req.flash('error_msg', 'Grupo não encontrado ou você não tem permissão.');
            return res.redirect('/grupos/tabela');
        }

        bot.tabela = tabela;
        await bot.save();

        req.flash('success_msg', 'Tabela atualizada com sucesso.');
        res.redirect('/grupos/tabela');
    } catch (err) {
        console.error('Erro ao atualizar tabela:', err.message);
        req.flash('error_msg', 'Erro ao atualizar a tabela do grupo.');
        res.redirect('/grupos/tabela');
    }
});

router.post('/salvarads', isAuthenticated, upload.single('arquivo'), async (req, res) => {
    const { grupo, legenda, frequenciaNumero, frequenciaUnidade, mentionAll } = req.body; // Captura o valor de mentionAll
    const arquivo = req.file;

    try {
        // Debug: Verificar o que está sendo recebido
        console.log('Dados recebidos para o anúncio:', req.body); // Imprime o conteúdo do req.body
        console.log('Valor de mentionAll:', mentionAll); // Verifica especificamente o valor de mentionAll

        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');

        // Verifica se já existe um anúncio para o grupo
        if (bot.adsMensagem.length >= 1) {
            req.flash('error_msg', '⚠️ Apenas 1 anúncio é permitido por grupo para manter a estabilidade.');
            return res.redirect(`/grupos/ads?grupo=${grupo}`);
        }

        // Validação: se unidade for "m", número deve ser >= 5
        if (frequenciaUnidade === 'm' && parseInt(frequenciaNumero) < 5) {
            req.flash('error_msg', '⏱️ A frequência mínima permitida em minutos é 5.');
            return res.redirect(`/grupos/ads?grupo=${grupo}`);
        }

        const frequencia = `${frequenciaNumero}${frequenciaUnidade}`;

        // Verificar se mentionAll está sendo passado corretamente
        // Verificar se mentionAll está sendo passado corretamente
        const mentionAllValue = Array.isArray(mentionAll) ? mentionAll[0] === 'true' : mentionAll === 'true'; // Ajusta para pegar o primeiro valor, caso seja um array
        // Garante que mentionAll será true ou false

        let novoAnuncio = {
            caption: legenda || '',
            frequencia,
            updatedAt: new Date(),
            mentionAll: mentionAllValue  // Atribui corretamente o valor de mentionAll
        };

        if (arquivo) {
            const ext = path.extname(arquivo.originalname).slice(1);
            const nomeArquivo = `ads_${Date.now()}.${ext}`;
            const dir = path.join('arquivos', String(grupo));
            await fs.mkdir(dir, { recursive: true });
            const caminho = path.join(dir, nomeArquivo);
            await fs.writeFile(caminho, arquivo.buffer);

            novoAnuncio.filePath = caminho.replace(/\\/g, '/');
            novoAnuncio.fileName = nomeArquivo;
            novoAnuncio.hasMedia = true;
            novoAnuncio.mimetype = arquivo.mimetype;
        } else {
            novoAnuncio.hasMedia = false;
        }

        bot.adsMensagem.push(novoAnuncio);
        await bot.save();

        req.flash('success_msg', '✅ Anúncio adicionado com sucesso!');
        res.redirect(`/grupos/ads?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao salvar anúncio:', err.message);
        req.flash('error_msg', 'Erro ao salvar anúncio.');
        res.redirect('/grupos/ads');
    }
});





router.post('/editarads', isAuthenticated, upload.single('arquivo'), async (req, res) => {
    const { grupo, anuncioId, legenda, frequenciaNumero, frequenciaUnidade, mentionAll } = req.body;  // Adicionado mentionAll
    const arquivo = req.file;

    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');

        const anuncio = bot.adsMensagem.id(anuncioId);
        if (!anuncio) throw new Error('Anúncio não encontrado');

        // Validação de frequência mínima em minutos
        if (frequenciaUnidade === 'm' && parseInt(frequenciaNumero) < 5) {
            req.flash('error_msg', '⏱️ A frequência mínima permitida em minutos é 5.');
            return res.redirect(`/grupos/ads?grupo=${grupo}`);
        }

        anuncio.caption = legenda || '';
        anuncio.frequencia = `${frequenciaNumero}${frequenciaUnidade}`;
        anuncio.updatedAt = new Date();

        // Aqui tratamos o valor de mentionAll, convertendo para Booleano
        anuncio.mentionAll = mentionAll === 'on'; // Se o checkbox foi marcado, será 'on', caso contrário, 'undefined'

        if (arquivo) {
            if (anuncio.filePath) {
                try {
                    await fs.unlink(anuncio.filePath);
                } catch (e) {
                    console.warn('Arquivo antigo não pôde ser removido:', e.message);
                }
            }

            const ext = path.extname(arquivo.originalname).slice(1);
            const nomeArquivo = `ads_${Date.now()}.${ext}`;
            const dir = path.join('arquivos', String(grupo));
            await fs.mkdir(dir, { recursive: true });
            const caminho = path.join(dir, nomeArquivo);
            await fs.writeFile(caminho, arquivo.buffer);

            anuncio.filePath = caminho.replace(/\\/g, '/');
            anuncio.fileName = nomeArquivo;
            anuncio.mimetype = arquivo.mimetype;
            anuncio.hasMedia = true;
        }

        await bot.save();

        req.flash('success_msg', '✅ Anúncio atualizado com sucesso!');
        res.redirect(`/grupos/ads?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao editar anúncio:', err.message);
        req.flash('error_msg', 'Erro ao editar anúncio.');
        res.redirect('/grupos/ads');
    }
});






router.post('/apagarads', isAuthenticated, async (req, res) => {
    const { grupo, anuncioId } = req.body;

    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');

        const anuncio = bot.adsMensagem.find(a => a._id.toString() === anuncioId);
        if (!anuncio) throw new Error('Anúncio não encontrado');

        if (anuncio.filePath) {
            try {
                await fs.unlink(anuncio.filePath);
            } catch (e) {
                console.warn('Arquivo não encontrado para exclusão:', anuncio.filePath);
            }
        }

        // Corrigido aqui: remove usando filter
        bot.adsMensagem = bot.adsMensagem.filter(a => a._id.toString() !== anuncioId);
        await bot.save();

        req.flash('success_msg', '✅ Anúncio excluído com sucesso!');
        res.redirect(`/grupos/ads?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao apagar anúncio:', err.message);
        req.flash('error_msg', 'Erro ao apagar anúncio.');
        res.redirect('/grupos/ads');
    }
});

router.post('/salvar-autoresposta', isAuthenticated, upload.single('arquivo'), async (req, res) => {
    const { grupo, gatilhos = '', resposta = '', contem, sticker } = req.body;
    const arquivo = req.file;
    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');

        const resp = {
            triggers: String(gatilhos).split(',').map(t=>t.trim().toLowerCase()).filter(Boolean),
            contains: ['on','true','1'].includes((contem||'').toString()),
            responseText: resposta,
            asSticker: ['on','true','1'].includes((sticker||'').toString()),
            updatedAt: new Date()
        };

        if (arquivo) {
            const ext = path.extname(arquivo.originalname).slice(1);
            const nomeArquivo = `ar_${Date.now()}.${ext}`;
            const dir = path.join('arquivos', String(grupo));
            await fs.mkdir(dir, { recursive: true });
            const caminho = path.join(dir, nomeArquivo);
            await fs.writeFile(caminho, arquivo.buffer);
            resp.filePath = caminho.replace(/\\/g, '/');
            resp.fileName = nomeArquivo;
            resp.mimetype = arquivo.mimetype;
            resp.hasMedia = true;
        } else {
            resp.hasMedia = false;
        }

        bot.autoResponses.push(resp);
        await bot.save();
        req.flash('success_msg', '✅ Autoresposta adicionada.');
        res.redirect(`/grupos/autorespostas?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao salvar autoresposta:', err.message);
        req.flash('error_msg', 'Erro ao salvar autoresposta.');
        res.redirect('/grupos/autorespostas');
    }
});

router.post('/editar-autoresposta', isAuthenticated, upload.single('arquivo'), async (req, res) => {
    const { grupo, respId, gatilhos = '', resposta = '', contem, sticker } = req.body;
    const arquivo = req.file;
    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');

        const resp = bot.autoResponses.id(respId);
        if (!resp) throw new Error('Autoresposta não encontrada');

        resp.triggers = String(gatilhos).split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
        resp.contains = ['on','true','1'].includes((contem||'').toString());
        resp.responseText = resposta;
        resp.asSticker = ['on','true','1'].includes((sticker||'').toString());
        resp.updatedAt = new Date();

        if (arquivo) {
            if (resp.filePath) { await fs.unlink(resp.filePath).catch(()=>{}); }
            const ext = path.extname(arquivo.originalname).slice(1);
            const nomeArquivo = `ar_${Date.now()}.${ext}`;
            const dir = path.join('arquivos', String(grupo));
            await fs.mkdir(dir, { recursive: true });
            const caminho = path.join(dir, nomeArquivo);
            await fs.writeFile(caminho, arquivo.buffer);
            resp.filePath = caminho.replace(/\\/g, '/');
            resp.fileName = nomeArquivo;
            resp.mimetype = arquivo.mimetype;
            resp.hasMedia = true;
        }

        await bot.save();
        req.flash('success_msg', '✅ Autoresposta atualizada.');
        res.redirect(`/grupos/autorespostas?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao editar autoresposta:', err.message);
        req.flash('error_msg', 'Erro ao editar autoresposta.');
        res.redirect('/grupos/autorespostas');
    }
});

router.post('/apagar-autoresposta', isAuthenticated, async (req, res) => {
    const { grupo, respId } = req.body;
    try {
        const bot = await BotConfig.findOne({ groupId: grupo, user: req.user._id });
        if (!bot) throw new Error('Grupo não encontrado');
        const resp = bot.autoResponses.id(respId);
        if (!resp) throw new Error('Autoresposta não encontrada');
        if (resp.filePath) { await fs.unlink(resp.filePath).catch(()=>{}); }
        bot.autoResponses = bot.autoResponses.filter(r => r._id.toString() !== respId);
        await bot.save();
        req.flash('success_msg', '✅ Autoresposta removida.');
        res.redirect(`/grupos/autorespostas?grupo=${grupo}`);
    } catch (err) {
        console.error('Erro ao apagar autoresposta:', err.message);
        req.flash('error_msg', 'Erro ao apagar autoresposta.');
        res.redirect('/grupos/autorespostas');
    }
});

router.post('/grupos/sorteio', isAuthenticated, async (req, res) => {
    try {
        const {
            grupo,            // deve conter o _id do bot, vindo do form
            type,
            pergunta,
            maxParticipants,
            endDate,
            winnersCount
        } = req.body;

        if (!grupo) throw new Error('Selecione um grupo válido.');
        if (!pergunta?.trim()) throw new Error('A pergunta/título do sorteio é obrigatória.');

        // Busca usando _id do bot, que é o valor enviado pelo form
        const bot = await BotConfig.findOne({ _id: grupo, user: req.user._id }).populate('botApi');
        if (!bot) throw new Error('Bot não encontrado.');

        const tipo = type === 'automatic' ? 'automatico' : 'manual';
        let sortearEm = null;
        let winners = null;

        if (tipo === 'automatico') {
            if (!endDate) throw new Error('Data de término é obrigatória em sorteios automáticos.');
            sortearEm = new Date(endDate);
            if (isNaN(sortearEm.getTime())) throw new Error('Data de término inválida.');

            winners = parseInt(winnersCount, 10);
            if (isNaN(winners) || winners < 1) throw new Error('Número de vencedores inválido.');
        }

        const rawPart = req.body['participantes[]'] || req.body.participantes || [];
        const participantesReq = Array.isArray(rawPart) ? rawPart : [rawPart];
        const listaParticipantes =
            (tipo === 'manual' && participantesReq.includes('ALL'))
                ? bot.participantes.map(p => p.id)
                : participantesReq;

        let serialized = '';
        let opcoes = [];

        if (tipo === 'automatico') {
            opcoes = [
                { name: 'Participar', localId: 0 },
                { name: 'Não participar', localId: 1 }
            ];

            const pollId = await sendPoll(
                bot.botApi.baseUrl,
                bot.botApi.apikey,
                bot.botApi.instance,
                bot.groupId,
                pergunta,
                opcoes.map(o => o.name),
                false,
                true
            );

            serialized = pollId;
            if (!serialized) throw new Error('Falha ao obter o ID da enquete.');
            try {
                const messageId = serialized.split('_')[2];
                await fixarMensagem(
                    bot.botApi.baseUrl,
                    bot.botApi.apikey,
                    bot.botApi.instance,
                    bot.groupId,
                    messageId
                );
            } catch (e) {
                console.warn('Não foi possível fixar a enquete:', e.message);
            }
        } else {
            serialized = await sendText(
                bot.botApi.baseUrl,
                bot.botApi.apikey,
                bot.botApi.instance,
                bot.groupId,
                pergunta,
                null,
                true
            );

            if (!serialized) throw new Error('Falha ao obter o ID da mensagem.');
            try {
                const messageId = serialized.split('_')[2];
                await fixarMensagem(
                    bot.botApi.baseUrl,
                    bot.botApi.apikey,
                    bot.botApi.instance,
                    bot.groupId,
                    messageId
                );
            } catch (e) {
                console.warn('Não foi possível fixar a mensagem:', e.message);
            }
        }

        await Sorteio.create({
            bot: bot._id,
            pergunta,
            tipo,
            serialized,
            opcoes,
            participantes: listaParticipantes,
            maxParticipantes: maxParticipants || null,
            sortearEm,
            winnersCount: winners
        });

        req.flash('success_msg', '✅ Sorteio criado com sucesso.');
        res.redirect('/grupos/sorteio');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', err.message);
        res.redirect('/grupos/sorteio');
    }
});





// ── ROTA POST /grupos/sorteio/editar ─────────────────────────────────
router.post('/grupos/sorteio/editar', isAuthenticated, async (req, res) => {
    try {
        const { grupo, serialized, pergunta, type, maxParticipants, endDate, participantes } = req.body;

        // Agora buscamos pelo _id do BotConfig
        const bot = await BotConfig
            .findOne({ _id: grupo, user: req.user._id })
            .populate('botApi');
        if (!bot) throw new Error('Bot não encontrado.');

        const sorteio = await Sorteio.findOne({
            bot: bot._id,
            serialized,
            concluido: false
        });
        if (!sorteio) throw new Error('Sorteio não encontrado.');

        // Ajusta tipo se necessário
        const novoTipo = (type === 'automatic') ? 'automatico' : 'manual';
        if (novoTipo !== sorteio.tipo) {
            if (sorteio.tipo === 'automatico' && novoTipo === 'manual') {
                throw new Error('Não é possível converter um sorteio automático para manual.');
            }
            if (sorteio.tipo === 'manual' && novoTipo === 'automatico') {
                // Se futuramente quiser reenviar enquete, implementar aqui
                sorteio.tipo = 'automatico';
            }
        }

        // Atualiza participantes (se for array)
        if (Array.isArray(participantes)) {
            let lista = participantes;
            if (lista.includes('ALL')) {
                lista = bot.participantes.map(p => p.id);
            }
            sorteio.participantes = lista;
        }

        // Atualiza pergunta
        const perguntaAnterior = sorteio.pergunta;
        if (pergunta) sorteio.pergunta = pergunta;

        // Atualiza limites e data de término
        sorteio.maxParticipantes = maxParticipants || null;
        sorteio.sortearEm = (sorteio.tipo === 'automatico' && endDate)
            ? new Date(endDate)
            : sorteio.sortearEm;

        await sorteio.save();

        // Se mudou a pergunta, edita a mensagem original no grupo (usando bot.groupId)
        if (pergunta && pergunta !== perguntaAnterior) {
            const [fromMeFlag, remoteJid, messageId] = sorteio.serialized.split('_');
            await editText(
                bot.botApi.baseUrl,
                bot.botApi.apikey,
                bot.botApi.instance,
                bot.groupId,    // usa groupId para editar no chat
                messageId,
                pergunta
            );
        }

        req.flash('success_msg', '✅ Sorteio atualizado com sucesso.');
        res.redirect('/grupos/sorteio');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', err.message);
        res.redirect('/grupos/sorteio');
    }
});


// ── ROTA POST /grupos/sorteio/finalizar ────────────────────────────────
router.post('/grupos/sorteio/finalizar', isAuthenticated, async (req, res) => {
    try {
        const { grupo, serialized, numWinners } = req.body;
        if (!grupo || !serialized) throw new Error('Dados incompletos.');

        // Busca pelo _id do BotConfig
        const bot = await BotConfig
            .findOne({ _id: grupo, user: req.user._id })
            .populate('botApi');
        if (!bot || !bot.botApi || !bot.botApi.status) {
            throw new Error('Bot ou API inativos.');
        }

        const sorteio = await Sorteio.findOne({
            bot: bot._id,
            serialized,
            concluido: false
        });
        if (!sorteio) throw new Error('Sorteio não encontrado ou já encerrado.');

        // Garante lista de participantes e número de vencedores válido
        const totalPart = Array.isArray(sorteio.participantes) ? [...sorteio.participantes] : [];
        if (!totalPart.length) throw new Error('Sem participantes para sortear.');

        const qtd = Math.min(
            Math.max(1, parseInt(numWinners, 10) || 1),
            totalPart.length
        );

        // Embaralha a lista e seleciona vencedores
        for (let i = totalPart.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [totalPart[i], totalPart[j]] = [totalPart[j], totalPart[i]];
        }
        const vencedores = totalPart.slice(0, qtd);

        // Monta texto de menção dos vencedores
        const linhas = vencedores
            .map(jid => `🏆 @${jid.replace(/@c\.us$/, '')}`)
            .join('\n');
        const texto = [
            '乂  S O R T E I O   F I N A L I Z A D O 乂  🎉',
            '',
            'Parabéns!',
            linhas,
            '',
            `Ganhou: *${sorteio.pergunta}*`
        ].join('\n');

        // Envia mensagem final mencionando todo mundo (mentionAll = true)
        await sendText(
            bot.botApi.baseUrl,
            bot.botApi.apikey,
            bot.botApi.instance,
            bot.groupId,    // usa groupId para enviar no chat
            texto,
            null,
            true
        );

        // Tenta apagar enquete original
        try {
            const parts = serialized.split('_');
            const pollMsgId = parts[2];
            const botSender = `${bot.botApi.instance}@c.us`;
            await deleteMessageForEveryone(
                bot.botApi.baseUrl,
                bot.botApi.apikey,
                bot.botApi.instance,
                pollMsgId,
                bot.groupId,    // usa groupId do bot para apagar no chat
                botSender,
                true
            );
        } catch (e) {
            console.warn('⚠️ Não foi possível apagar enquete:', e.message);
        }

        // Remove o sorteio do banco
        await Sorteio.deleteOne({ _id: sorteio._id });

        req.flash('success_msg', `✅ Sorteio finalizado com ${qtd} vencedor(es).`);
        res.redirect('/grupos/sorteio');

    } catch (err) {
        console.error('❌ Erro ao finalizar sorteio:', err);
        req.flash('error_msg', err.message || 'Erro ao finalizar sorteio.');
        res.redirect('/grupos/sorteio');
    }
});


// ── ROTA POST /grupos/sorteio/apagar ──────────────────────────────────
router.post('/grupos/sorteio/apagar', isAuthenticated, async (req, res) => {
    try {
        const { grupo, serialized } = req.body;

        // Busca pelo _id do BotConfig
        const bot = await BotConfig
            .findOne({ _id: grupo, user: req.user._id })
            .populate('botApi');
        if (!bot) throw new Error('Bot não encontrado.');

        // Processa serialized: "true_120363419144588934@g.us_3EB0716D8CE014F9942225_559291129258@c.us"
        const parts = serialized.split('_');
        if (parts.length !== 4) throw new Error('Serialized inválido.');

        const fromMe = parts[0] === 'true';
        const remoteJid = parts[1];       // JID do grupo (ex: "120363419144588934@g.us")
        const messageId = parts[2];       // ID puro da mensagem
        const participant = parts[3];     // quem enviaria (JID do participante)

        // Apaga a mensagem original da enquete no grupo
        await deleteMessageForEveryone(
            bot.botApi.baseUrl,
            bot.botApi.apikey,
            bot.botApi.instance,
            messageId,
            remoteJid,
            participant,
            fromMe
        );

        // Remove o sorteio do banco
        await Sorteio.deleteOne({ bot: bot._id, serialized });

        req.flash('success_msg', '🗑️ Sorteio e enquete apagados com sucesso.');
        res.redirect('/grupos/sorteio');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', err.message);
        res.redirect('/grupos/sorteio');
    }
});




module.exports = router;
