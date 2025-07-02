// admin.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { notAuthenticated, isAuthenticated, isAdmin } = require('../funcoes/auth');
const { usuario } = require('../db/model'); // Importando o modelo de usuário
const bcrypt = require('bcryptjs'); // Para lidar com a criptografia de senhas
const { Plano } = require('../db/planos');  // Importa o modelo Plano
const { BotConfig } = require('../db/botConfig');
const { BotApi } = require('../db/botApi');
const { Server } = require('../db/server');
const { excluirBot, verificarLimiteInstancias, verificarCapacidadeServidor } = require('../db/bot');
const axios = require('axios');
const QRCode = require('qrcode');
const { randomText, enviarTelegramChannel } = require('../funcoes/function');
const { verificar_nome, add_usuario } = require('../db/db');
const { limitCount, dinheiroCount, premiumdays, limitPremium } = require('../configuracao');
const { basesiteUrl } = require('../configuracao');
const ConfigPagamento = require('../db/configpagamentos');
const Deposit = require('../db/deposits');
const { Banner } = require('../db/banner');
const { PartnerAd } = require('../db/partnerAd');
const { ExtraPlan } = require('../db/extraPlan');
const { CommandInfo } = require('../db/commandInfo');
const { Tutorial } = require('../db/tutorial');
const { CommandCategory } = require('../db/commandCategory');
const { Post } = require('../db/post');
const Language = require('../db/language');
const { loadTranslations } = require('../index');
const {
    SiteConfig,
    DEFAULT_DARK_THEME,
    DEFAULT_LIGHT_THEME,
    DEFAULT_SEO,
    DEFAULT_BLOG_SEO,
    DEFAULT_TUTORIALS_SEO,
    DEFAULT_TERMS_SEO,
    DEFAULT_PRIVACY_SEO,
    DEFAULT_LOGIN_SEO,
    DEFAULT_SIGNUP_SEO,
    DEFAULT_LOGO
} = require('../db/siteConfig');

// Comandos disponíveis para os planos
const COMMANDS = [
    'antilink','banextremo','antilinkgp','bangringos','proibirnsfw','soadm',
    'autoresposta','autosticker','autodownloader','brincadeiras','vozbotinterage',
    'moderacaocomia','botinterage','lerimagem','bemvindo'
];
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
const fs = require('fs/promises');
const path = require('path');
const { tmpdir } = require('os');
const { updateSitemap } = require('../utils/sitemap');

// Rota para exibir todos os usuários
router.get('/usuarios', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Buscar todos os usuários
        let usuarios = await usuario.find({});

        // Renderizar a página de usuários
        res.render('admin/usuarios', {
            usuarios: usuarios,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao carregar os usuários');
        res.redirect('/admin');
    }
});

// Busca dinâmica de usuários por nome
router.get('/usuarios/buscar', isAuthenticated, isAdmin, async (req, res) => {
    const q = req.query.q || '';
    try {
        const usuariosEncontrados = await usuario
            .find({ nome: new RegExp(q, 'i') })
            .limit(10);
        res.json(
            usuariosEncontrados.map(u => ({ id: u._id, nome: u.nome }))
        );
    } catch (err) {
        console.error('Erro ao buscar usuários:', err);
        res.json([]);
    }
});

// Rota para criar um novo usuário
router.post('/usuarios/criar', isAuthenticated, isAdmin, async (req, res) => {
    const { nome, whatsapp, senha } = req.body;

    try {
        // Verificando se todos os campos foram preenchidos corretamente
        if (!nome || !senha || !whatsapp) {
            req.flash('error_msg', 'Por favor, preencha todos os campos');
            return res.redirect('/admin/usuarios');
        }

        // Criptografar a senha
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Gerar a apikey para o usuário
        const apikey = randomText(8); // Gerando a apikey

        // Chamar a função para adicionar o usuário
        await add_usuario(nome, hashedPassword, apikey, whatsapp);

        req.flash('success_msg', 'Usuário criado com sucesso!');
        res.redirect('/admin/usuarios');
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao criar o usuário');
        res.redirect('/admin/usuarios');
    }
});

router.post('/usuarios/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, whatsapp, status, apikey, premium, saldo, admin } = req.body;

    try {
        // Converte o campo premium para um formato de data
        const premiumDate = premium ? new Date(premium).toISOString() : null;

        // Atualizar o usuário no banco
        const updatedUser = await usuario.findByIdAndUpdate(
            id,
            { nome, whatsapp, status, apikey, premium: premiumDate, saldo, admin },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        res.json({ success: true, message: 'Usuário atualizado!', user: updatedUser });
    } catch (err) {
        console.error('Erro no servidor:', err);
        res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
});





// Rota para deletar um usuário
router.get('/usuarios/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // Deletar o usuário
        await usuario.deleteOne({ _id: id });

        req.flash('success_msg', 'Usuário deletado com sucesso!');
        res.redirect('/admin/usuarios');
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao deletar o usuário');
        res.redirect('/admin/usuarios');
    }
});

// Rota para logar como usuário
router.get('/usuarios/login/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = await usuario.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'Usuário não encontrado');
            return res.redirect('/admin/usuarios');
        }
        // guarda o ID do admin antes que o login regenere a sessão
        const adminId = req.user._id;
        req.logIn(user, err => {
            if (err) {
                console.error('Erro ao logar como usuário:', err);
                req.flash('error_msg', 'Erro ao logar como usuário');
                return res.redirect('/admin/usuarios');
            }
            // reatribui o id do admin após o login para que o botão de retorno funcione
            req.session.adminId = adminId;
            req.flash('success_msg', `Logado como ${user.nome}`);
            res.redirect('/painel');
        });
    } catch (err) {
        console.error('Erro ao logar como usuário:', err);
        req.flash('error_msg', 'Erro ao logar como usuário');
        res.redirect('/admin/usuarios');
    }
});

// Rota para retornar ao painel admin após login como usuário
router.get('/retornar', isAuthenticated, async (req, res) => {
    try {
        const adminId = req.session.adminId;
        if (!adminId) {
            return res.redirect('/painel');
        }
        const adminUser = await usuario.findById(adminId);
        if (!adminUser || !adminUser.admin) {
            delete req.session.adminId;
            return res.redirect('/painel');
        }
        req.logIn(adminUser, err => {
            if (err) {
                console.error('Erro ao retornar ao admin:', err);
                req.flash('error_msg', 'Erro ao retornar ao admin');
                return res.redirect('/painel');
            }
            delete req.session.adminId;
            req.flash('success_msg', 'Retornado ao painel admin');
            res.redirect('/admin');
        });
    } catch (err) {
        console.error('Erro ao retornar ao admin:', err);
        res.redirect('/painel');
    }
});


// Rota para exibir todos os planos
router.get('/planos', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Buscar todos os planos
        let planos = await Plano.find({});  // Buscando todos os planos

        // Se não houver planos cadastrados, exibe uma mensagem
        let planosVazios = planos.length === 0;

        // Renderizar a página de planos
        res.render('admin/planos', {
            planos: planos,
            planosVazios: planosVazios,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao carregar os planos');
        res.redirect('/admin');
    }
});




/* ========= ROTA: CRIAR PLANO ========= */
router.post(
    '/planos/criar',
    isAuthenticated,
    isAdmin,
    async (req, res) => {
        const {
            nome,
            preco,
            duracao,
            descricao = '',
            limiteGrupos = 1,
            limiteInstancias = 0,
            includedAds = 0,
            includedShortLinks = 0,
            testeGratis,        // checkbox => "on" | undefined
            diasTeste = 0,      // número em string
            active = 'on',
            dailyAdLimit = 0,
            adTimes = ''
        } = req.body;

        const allowedCommandsBody = req.body.allowedCommands || {};
        const allowedCommands = {};
        COMMANDS.forEach(cmd => {
            allowedCommands[cmd] = ['on','true','1'].includes(
                (allowedCommandsBody[cmd] || '').toString()
            );
        });

        /* --------- conversões --------- */
        const precoNum = parseFloat(preco);
        const duracaoNum = parseInt(duracao, 10);
        const limiteGruposNum = parseInt(limiteGrupos, 10);
        const limiteInstanciasNum = parseInt(limiteInstancias, 10);
        const includedAdsNum = parseInt(includedAds, 10) || 0;
        const includedShortLinksNum = parseInt(includedShortLinks, 10) || 0;
        const testeGratisFlag = testeGratis === 'on' || testeGratis === 'true';
        const diasTesteNum = testeGratisFlag ? parseInt(diasTeste, 10) : 0;
        const activeFlag = active === 'on' || active === 'true';
        const dailyAdsNum = parseInt(dailyAdLimit, 10) || 0;
        const adTimesArr = typeof adTimes === 'string' && adTimes.trim()
            ? adTimes.split(',').map(t=>t.trim()) : [];

        /* --------- validação --------- */
        if (
            !nome ||
            isNaN(precoNum) ||
            isNaN(duracaoNum) ||
            isNaN(limiteGruposNum) ||
            isNaN(limiteInstanciasNum) ||
            includedAdsNum < 0 ||
            includedShortLinksNum < 0 ||
            (testeGratisFlag && (isNaN(diasTesteNum) || diasTesteNum <= 0))
        ) {
            req.flash('error_msg',
                'Preencha todos os campos obrigatórios corretamente (inclua dias de teste quando o teste grátis estiver ativo).');
            return res.redirect('/admin/planos');
        }

        try {
            const novoPlano = new Plano({
                nome: nome.trim(),
                preco: precoNum,
                duracao: duracaoNum,
                descricao: descricao.trim(),
                limiteGrupos: limiteGruposNum,
                limiteInstancias: limiteInstanciasNum,
                includedAds: includedAdsNum,
                includedShortLinks: includedShortLinksNum,
                testeGratis: testeGratisFlag,
                diasTeste: diasTesteNum,
                active: activeFlag,
                dailyAdLimit: dailyAdsNum,
                adTimes: adTimesArr,
                allowedCommands
            });

            await novoPlano.save();
            req.flash('success_msg', 'Plano criado com sucesso!');
            return res.redirect('/admin/planos');
        } catch (err) {
            console.error('Erro ao criar plano:', err);
            req.flash('error_msg', 'Erro ao criar o plano. Tente novamente.');
            return res.redirect('/admin/planos');
        }
    }
);

/* ========= ROTA: EDITAR PLANO ========= */
router.post(
    '/planos/editar/:id?',
    isAuthenticated,
    isAdmin,
    async (req, res) => {
        // permite receber o ID tanto do corpo quanto da URL (compatibilidade)
        let id = (
            req.params.id ||
            req.body.id ||
            req.body._id ||
            req.body.editId ||
            req.query.id ||
            ''
        ).toString().trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            req.flash('error_msg', 'ID do plano inválido.');
            return res.redirect('/admin/planos');
        }
        const {
            nome,
            preco,
            duracao,
            descricao = '',
            limiteGrupos = 1,
            limiteInstancias = 0,
            includedAds = 0,
            includedShortLinks = 0,
            testeGratis,
            diasTeste = 0,
            active = 'on',
            dailyAdLimit = 0,
            adTimes = ''
        } = req.body;

        const allowedCommandsBody = req.body.allowedCommands || {};
        const allowedCommands = {};
        COMMANDS.forEach(cmd => {
            allowedCommands[cmd] = ['on','true','1'].includes(
                (allowedCommandsBody[cmd] || '').toString()
            );
        });

        /* --------- conversões --------- */
        const precoNum = parseFloat(preco);
        const duracaoNum = parseInt(duracao, 10);
        const limiteGruposNum = parseInt(limiteGrupos, 10);
        const limiteInstanciasNum = parseInt(limiteInstancias, 10);
        const includedAdsNum = parseInt(includedAds, 10) || 0;
        const includedShortLinksNum = parseInt(includedShortLinks, 10) || 0;
        const testeGratisFlag = testeGratis === 'on' || testeGratis === 'true';
        const diasTesteNum = testeGratisFlag ? parseInt(diasTeste, 10) : 0;
        const activeFlag = active === 'on' || active === 'true';
        const dailyAdsNum = parseInt(dailyAdLimit, 10) || 0;
        const adTimesArr = typeof adTimes === 'string' && adTimes.trim()
            ? adTimes.split(',').map(t=>t.trim()) : [];

        /* --------- validação --------- */
        if (
            !nome ||
            isNaN(precoNum) ||
            isNaN(duracaoNum) ||
            isNaN(limiteGruposNum) ||
            isNaN(limiteInstanciasNum) ||
            includedAdsNum < 0 ||
            includedShortLinksNum < 0 ||
            (testeGratisFlag && (isNaN(diasTesteNum) || diasTesteNum <= 0))
        ) {
            req.flash('error_msg',
                'Preencha todos os campos obrigatórios corretamente (inclua dias de teste quando o teste grátis estiver ativo).');
            return res.redirect('/admin/planos');
        }

        try {
            const oldPlan = await Plano.findById(id);

            await Plano.updateOne(
                { _id: id },
                {
                    nome: nome.trim(),
                    preco: precoNum,
                    duracao: duracaoNum,
                    descricao: descricao.trim(),
                    limiteGrupos: limiteGruposNum,
                    limiteInstancias: limiteInstanciasNum,
                    includedAds: includedAdsNum,
                    includedShortLinks: includedShortLinksNum,
                    testeGratis: testeGratisFlag,
                    diasTeste: diasTesteNum,
                    active: activeFlag,
                    dailyAdLimit: dailyAdsNum,
                    adTimes: adTimesArr,
                    allowedCommands
                }
            );

            const updatedPlan = await Plano.findById(id);
            if (updatedPlan) {
                const snapshot = {
                    nome: updatedPlan.nome,
                    preco: updatedPlan.preco,
                    duracao: updatedPlan.duracao,
                    descricao: updatedPlan.descricao || '',
                    limiteGrupos: updatedPlan.limiteGrupos || 1,
                    limiteInstancias: updatedPlan.limiteInstancias || 0,
                    includedAds: updatedPlan.includedAds || 0,
                    includedShortLinks: updatedPlan.includedShortLinks || 0,
                    isFree: updatedPlan.isFree || false,
                    allowedCommands: updatedPlan.allowedCommands || {}
                };

                const planUsers = await usuario.find(
                    { 'planoContratado.nome': oldPlan ? oldPlan.nome : updatedPlan.nome },
                    '_id'
                );
                const userIds = planUsers.map(u => u._id);
                if (userIds.length > 0) {
                    await usuario.updateMany(
                        { _id: { $in: userIds } },
                        { $set: { planoContratado: snapshot } }
                    );

                    const disableFields = {};
                    for (const cmd in snapshot.allowedCommands) {
                        if (!snapshot.allowedCommands[cmd]) {
                            disableFields[`comandos.${cmd}`] = false;
                        }
                    }
                    if (Object.keys(disableFields).length > 0) {
                        await BotConfig.updateMany(
                            { user: { $in: userIds } },
                            { $set: disableFields }
                        );
                    }
                }
            }

            req.flash('success_msg', 'Plano atualizado com sucesso!');
            return res.redirect('/admin/planos');
        } catch (err) {
            console.error('Erro ao editar plano:', err);
            req.flash('error_msg', 'Erro ao editar o plano. Tente novamente.');
            return res.redirect('/admin/planos');
        }
    }
);


// Rota para deletar um plano
router.get('/planos/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const plano = await Plano.findById(id);
        if (plano?.isFree) {
            req.flash('error_msg', 'O Plano Free não pode ser deletado.');
            return res.redirect('/admin/planos');
        }
        await Plano.deleteOne({ _id: id });

        req.flash('success_msg', 'Plano deletado com sucesso!');
        res.redirect('/admin/planos');
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao deletar o plano');
        res.redirect('/admin/planos');
    }
});

// ==== GERENCIAMENTO DE PLANOS EXTRAS ====
router.get('/extras', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const extras = await ExtraPlan.find({});
        res.render('admin/extras', { extras, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar extras:', err);
        req.flash('error_msg', 'Erro ao carregar extras');
        res.redirect('/admin');
    }
});

router.post('/extras/criar', isAuthenticated, isAdmin, async (req, res) => {
    const { nome, preco, tipo, dias, quantidadeAds = 0, quantidadeLinks = 0 } = req.body;
    if (!nome || !preco || !tipo || !dias) {
        req.flash('error_msg', 'Preencha todos os campos obrigatórios.');
        return res.redirect('/admin/extras');
    }
    try {
        await ExtraPlan.create({
            nome: nome.trim(),
            preco: parseFloat(preco),
            tipo,
            dias: parseInt(dias, 10),
            quantidadeAds: tipo === 'ads' ? (parseInt(quantidadeAds, 10) || 0) : 0,
            quantidadeLinks: tipo === 'shortener' ? (parseInt(quantidadeLinks, 10) || 0) : 0
        });
        req.flash('success_msg', 'Plano extra criado!');
    } catch (err) {
        console.error('Erro ao criar extra:', err);
        req.flash('error_msg', 'Erro ao criar plano extra');
    }
    res.redirect('/admin/extras');
});

router.post('/extras/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, preco, tipo, dias, quantidadeAds = 0, quantidadeLinks = 0 } = req.body;
    if (!nome || !preco || !tipo || !dias) {
        req.flash('error_msg', 'Preencha todos os campos obrigatórios.');
        return res.redirect('/admin/extras');
    }
    try {
        await ExtraPlan.updateOne({ _id: id }, {
            nome: nome.trim(),
            preco: parseFloat(preco),
            tipo,
            dias: parseInt(dias, 10),
            quantidadeAds: tipo === 'ads' ? (parseInt(quantidadeAds, 10) || 0) : 0,
            quantidadeLinks: tipo === 'shortener' ? (parseInt(quantidadeLinks, 10) || 0) : 0
        });
        req.flash('success_msg', 'Plano extra atualizado');
    } catch (err) {
        console.error('Erro ao editar extra:', err);
        req.flash('error_msg', 'Erro ao editar plano extra');
    }
    res.redirect('/admin/extras');
});

router.get('/extras/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await ExtraPlan.deleteOne({ _id: id });
        req.flash('success_msg', 'Plano extra removido');
    } catch (err) {
        console.error('Erro ao deletar extra:', err);
        req.flash('error_msg', 'Erro ao deletar plano extra');
    }
    res.redirect('/admin/extras');
});



router.get('/api', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const apis = await BotApi.find({}).populate('user').populate('server');
        const usuarios = await usuario.find({}, '_id nome whatsapp');
        const servidores = await Server.find({});

        res.render('admin/api', {
            apis,
            usuarios,
            servidores,
            basesiteUrl,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao carregar as configurações da API');
        res.redirect('/admin');
    }
});

// Tela para gerenciar servidores externos
router.get('/servidores', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const servidores = await Server.find({});
        res.render('admin/servidores', {
            servidores,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao carregar os servidores');
        res.redirect('/admin');
    }
});


// Rota de criação de nova API
async function createApi(req, res) {
    try {
        const { nome, serverId, instance, webhook, gruposlimite = 0, status, user } = req.body;

        const instanceName = String(instance || '').trim();

        if (!nome || !serverId || !instanceName) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes' });
        }

        const server = await verificarCapacidadeServidor(serverId);

        if (user) {
            const usr = await usuario.findById(user);
            if (!usr) return res.json({ success: false, message: 'Usuário inválido' });
            try { await verificarLimiteInstancias(usr); } catch (e) { return res.json({ success: false, message: e.message }); }
        }

        // evita duplicidade de instâncias
        const existente = await BotApi.findOne({ instance: instanceName });
        if (existente) {
            try {
                await callInstance(existente, 'delete');
            } catch (e) {
                console.warn('Falha ao limpar instância existente:', e.message);
            }
            try {
                await BotApi.deleteOne({ _id: existente._id });
            } catch (e) {
                console.warn('Falha ao remover registro existente:', e.message);
            }
        }

        const base = sanitizeBase(server.baseUrl);
        let novaApi = null;
        const createRemote = async () => {
            await axios.post(
                `${base}/api/instance`,
                {
                    name: instanceName,
                    webhook: webhook || `${basesiteUrl}/webhook/event`,
                    apiKey: server.globalapikey
                },
                { headers: { 'x-api-key': server.globalapikey } }
            );
        };
        try {
            try {
                await createRemote();
            } catch (e) {
                const msg = e.response?.data?.error || e.message;
                if (/instance already exists/i.test(msg)) {
                    try {
                        await axios.delete(`${base}/api/instance/${instanceName}`, {
                            headers: { 'x-api-key': server.globalapikey }
                        });
                        await createRemote();
                    } catch (re) {
                        throw new Error('Instância já cadastrada');
                    }
                } else {
                    throw e;
                }
            }

            novaApi = new BotApi({
                nome,
                baseUrl: server.baseUrl,
                globalapikey: server.globalapikey,
                apikey: server.globalapikey,
                webhook: webhook || `${basesiteUrl}/webhook/event`,
                instance: instanceName,
                server: server._id,
                gruposlimite: parseInt(gruposlimite, 10) || 0,
                status: !!status,
                user: user || null
            });

            await novaApi.save();
            return res.json({ success: true, message: 'API criada com sucesso!' });
        } catch (err) {
            if (novaApi?._id) {
                try { await BotApi.deleteOne({ _id: novaApi._id }); } catch {}
            }
            console.error('Erro ao criar API:', err.response?.data || err.message);
            if (err.code === 11000) {
                try {
                    await axios.delete(`${base}/api/instance/${instanceName}`, {
                        headers: { 'x-api-key': server.globalapikey }
                    });
                } catch (e) {
                    console.warn('Falha ao remover instância remota:', e.message);
                }
                return res.json({ success: false, message: 'Instância já cadastrada' });
            }
            return res.status(500).json({ success: false, message: err.response?.data?.error || err.message });
        }
    } catch (err) {
        console.error('Erro ao criar API:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
}

router.post('/api/criar', isAuthenticated, isAdmin, createApi);
router.post('/servidores/criar', isAuthenticated, isAdmin, async (req, res) => {
    const { nome, baseUrl, globalapikey, sessionLimit, status } = req.body;
    if (!nome || !baseUrl || !globalapikey) {
        req.flash('error_msg', 'Campos obrigatórios ausentes');
        return res.redirect('/admin/servidores');
    }
    try {
        const novo = new Server({
            nome,
            baseUrl: sanitizeBase(baseUrl),
            globalapikey,
            sessionLimit: parseInt(sessionLimit || 0, 10),
            status: !!status
        });
        await novo.save();
        req.flash('success_msg', 'Servidor criado!');
    } catch (err) {
        console.error('Erro ao criar servidor', err);
        req.flash('error_msg', 'Erro ao criar servidor');
    }
    res.redirect('/admin/servidores');
});



async function editApi(req, res) {
    const { id } = req.params;
    const { serverId, webhook, gruposlimite = 0, status, user } = req.body;

    try {
        const apiAtual = await BotApi.findById(id);
        if (!apiAtual) {
            return res.json({ success: false, message: 'API não encontrada' });
        }

        const updateFields = {
            status: status === 'true' || status === true,
            gruposlimite: parseInt(gruposlimite, 10) || 0,
            updatedAt: new Date()
        };

        if (webhook) {
            updateFields.webhook = webhook;
        }

        if (serverId) {
            const server = await verificarCapacidadeServidor(serverId);
            updateFields.baseUrl = server.baseUrl;
            updateFields.globalapikey = server.globalapikey;
            updateFields.server = server._id;
        }

        if (user && user !== 'null' && user !== '') {
            updateFields.user = user;
        } else {
            updateFields.user = null; // desvincula se vazio
        }

        if (!serverId) {
            // tenta atualizar dados da instância apenas se o servidor não mudou
            try {
                await callInstance(apiAtual, 'put', '', { webhook: updateFields.webhook });
            } catch (e) {
                console.warn('Erro ao sincronizar instância:', e.message);
            }
        }

        const updatedApi = await BotApi.findByIdAndUpdate(id, updateFields, { new: true });

        if (!updatedApi) {
            return res.json({ success: false, message: 'API não encontrada' });
        }

        res.json({ success: true, message: 'API atualizada com sucesso!' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Erro ao atualizar a API' });
    }
}

router.post('/api/editar/:id', isAuthenticated, isAdmin, editApi);
router.post('/servidores/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { baseUrl, globalapikey, sessionLimit, status } = req.body;
    try {
        const upd = await Server.findByIdAndUpdate(id, {
            baseUrl: sanitizeBase(baseUrl),
            globalapikey,
            sessionLimit: parseInt(sessionLimit || 0, 10),
            status: status === 'true' || status === true,
            updatedAt: new Date()
        }, { new: true });
        if (!upd) {
            req.flash('error_msg', 'Servidor não encontrado');
        } else {
            req.flash('success_msg', 'Servidor atualizado');
        }
    } catch (err) {
        console.error('Erro ao atualizar servidor', err);
        req.flash('error_msg', 'Erro ao atualizar servidor');
    }
    res.redirect('/admin/servidores');
});





// Rota para deletar uma configuração de API
async function deleteApi(req, res) {
    const { id } = req.params;

    try {
        const api = await BotApi.findById(id);
        if (!api) {
            req.flash('error_msg', 'API não encontrada');
            return res.redirect('/admin/api');
        }

        try {
            await callInstance(api, 'delete');
        } catch (e) {
            console.warn('Falha ao remover instância remota:', e.message);
            req.flash('error_msg', 'Falha ao remover a instância no servidor');
            return res.redirect('/admin/api');
        }

        await BotApi.deleteOne({ _id: id });

        req.flash('success_msg', 'API deletada com sucesso!');
        res.redirect('/admin/api');
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Erro ao deletar a API');
        res.redirect('/admin/api');
    }
}

router.get('/api/deletar/:id', isAuthenticated, isAdmin, deleteApi);
router.get('/servidores/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await Server.deleteOne({ _id: req.params.id });
        req.flash('success_msg', 'Servidor deletado');
        res.redirect('/admin/servidores');
    } catch (err) {
        req.flash('error_msg', 'Erro ao deletar servidor');
        res.redirect('/admin/servidores');
    }
});

// ====== Controle de sessões das APIs ======
function sanitizeBase(url) {
    return (url || '').replace(/\/+$/, '');
}

async function callInstance(botApi, method, subpath = '', data = {}) {
    const base = sanitizeBase(botApi.baseUrl);
    const url = `${base}/api/instance/${botApi.instance}${subpath}`;
    const headers = {
        'x-api-key': botApi.globalapikey,
        'x-instance-key': botApi.apikey
    };
    return axios({ method, url, data, headers });
}

async function apiAction(req, res, method, subpath) {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });
        await callInstance(api, method, subpath);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
}



// Exibe o QR Code da instância
async function pairCode(req, res) {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });

        let qrRes;
        try {
            qrRes = await callInstance(api, 'post', '/pair');
        } catch (err) {
            try {
                const qrOnly = await callInstance(api, 'get', '/qr');
                if (qrOnly.data?.qr) {
                    const qrUrl = await QRCode.toDataURL(qrOnly.data.qr);
                    return res.json({ success: true, data: { qr: qrUrl } });
                }
            } catch { /* ignore fallback error */ }
            return res.json({ success: false, message: err.response?.data?.error || err.message });
        }

        if (qrRes.data?.qr) {
            const qrUrl = await QRCode.toDataURL(qrRes.data.qr);
            return res.json({ success: true, data: { qr: qrUrl } });
        }
        if (qrRes.data?.code) {
            return res.json({ success: true, data: { code: qrRes.data.code } });
        }
        res.json({ success: false, message: 'QR indisponível' });
    } catch (err) {
        res.json({ success: false, message: err.response?.data?.error || err.message });
    }
}

// Obtém QR ou código salvo diretamente do banco
async function qrData(req, res) {
    try {
        const api = await BotApi.findById(req.params.id).lean();
        if (!api) return res.json({ success: false, message: 'API não encontrada' });

        const { getRecordCollection } = require('../apibaileysexemplo/db');
        const coll = await getRecordCollection();
        const rec = await coll.findOne({ name: api.instance });
        if (!rec || (!rec.qr && !rec.pairCode)) {
            return res.json({ success: false, message: 'QR indisponível' });
        }
        const data = {};
        if (rec.pairCode) data.code = rec.pairCode;
        if (rec.qr) data.qr = await QRCode.toDataURL(rec.qr);
        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
}

router.post('/api/:id/pair', isAuthenticated, isAdmin, pairCode);
router.get('/api/:id/qrdata', isAuthenticated, isAdmin, qrData);

router.post('/api/:id/logout', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });
        await callInstance(api, 'delete');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Inicia ou reconecta a instância vinculada
router.post('/api/:id/connect', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });
        await callInstance(api, 'post', '/reconnect');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

router.post('/api/:id/restart', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });
        await callInstance(api, 'post', '/restart');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

router.post('/api/:id/deleteSession', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const api = await BotApi.findById(req.params.id);
        if (!api) return res.json({ success: false, message: 'API não encontrada' });
        try {
            await callInstance(api, 'delete');
        } catch (err) {
            return res.json({ success: false, message: err.message });
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});





// Rota: Listar todos os métodos de pagamento configurados
router.get('/pagamentos', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const metodos = await ConfigPagamento.find({});
        res.render('admin/pagamentos', {
            metodos,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao carregar métodos de pagamento');
        res.redirect('/admin');
    }
});

// Rota: Criar novo método de pagamento
router.post('/pagamentos/criar', isAuthenticated, isAdmin, async (req, res) => {
    const { nome, gateway, accessToken, publicKey, taxaPercentual, status, tipo } = req.body;

    try {
        if (!nome || !gateway || !accessToken || !taxaPercentual) {
            req.flash('error_msg', 'Campos obrigatórios ausentes');
            return res.redirect('/admin/pagamentos');
        }

        const ativo = !(status === 'false' || status === false || status === 0 || status === 'off');
        const novoMetodo = new ConfigPagamento({
            nome,
            gateway,
            accessToken,
            publicKey: publicKey || null,
            tipo: gateway === 'mercadopago' ? tipo : 'pix',
            taxaPercentual: parseFloat(taxaPercentual),
            status: ativo
        });

        await novoMetodo.save();

        req.flash('success_msg', 'Método de pagamento cadastrado com sucesso!');
        res.redirect('/admin/pagamentos');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao cadastrar método de pagamento');
        res.redirect('/admin/pagamentos');
    }
});

// Rota: Editar método de pagamento
router.post('/pagamentos/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, gateway, accessToken, publicKey, taxaPercentual, status, tipo } = req.body;

    try {
        const updateData = {
            nome,
            gateway,
            accessToken,
            publicKey: publicKey || null,
            tipo: gateway === 'mercadopago' ? tipo : 'pix',
            taxaPercentual: parseFloat(taxaPercentual)
        };
        if (typeof status !== 'undefined') {
            updateData.status = !(status === 'false' || status === false || status === 0 || status === 'off');
        }

        const atualizado = await ConfigPagamento.findByIdAndUpdate(id, updateData, { new: true });

        if (!atualizado) {
            req.flash('error_msg', 'Método não encontrado');
            return res.redirect('/admin/pagamentos');
        }

        req.flash('success_msg', 'Método atualizado com sucesso!');
        res.redirect('/admin/pagamentos');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao atualizar método');
        res.redirect('/admin/pagamentos');
    }
});

// Rota: Excluir método de pagamento
router.get('/pagamentos/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await ConfigPagamento.deleteOne({ _id: id });
        req.flash('success_msg', 'Método de pagamento excluído com sucesso!');
        res.redirect('/admin/pagamentos');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Erro ao excluir método de pagamento');
        res.redirect('/admin/pagamentos');
    }
});

// ====== GERENCIAMENTO DE PREMIUM ======
router.get('/premium', isAuthenticated, isAdmin, async (req, res) => {
    const usuarios = await usuario.find({});
    res.render('admin/premium', { usuarios, layout: 'admin/layout/main' });
});

router.post('/premium/remover/:id', isAuthenticated, isAdmin, async (req, res) => {
    const user = await usuario.findById(req.params.id);
    if (user) {
        user.apikey = user.defaultKey;
        user.premium = null;
        user.limit = limitCount;
        await user.save();
    }
    req.flash('success_msg', 'Premium removido.');
    res.redirect('/admin/premium');
});

router.post('/premium/reset/:id', isAuthenticated, isAdmin, async (req, res) => {
    const user = await usuario.findById(req.params.id);
    if (user) {
        const ativo = user.premium && user.premium > new Date();
        user.limit = ativo ? limitPremium : limitCount;
        await user.save();
    }
    req.flash('success_msg', 'Limite redefinido.');
    res.redirect('/admin/premium');
});

// ====== GERENCIAMENTO DE GRUPOS ======
router.get('/grupos', isAuthenticated, isAdmin, async (req, res) => {
    const usuarios = await usuario.find({}, 'nome _id');
    const selectedUser = req.query.user || '';
    let grupos = [];
    let apis = [];
    if (selectedUser) {
        grupos = await BotConfig.find({ user: selectedUser }).populate('botApi');
        apis = await BotApi.find({});
    }
    res.render('admin/grupos', { usuarios, grupos, apis, selectedUser, layout: 'admin/layout/main' });
});

router.post('/grupos/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { apiId } = req.body;
        const bot = await BotConfig.findById(req.params.id);
        if (!bot) return res.json({ success: false, message: 'Grupo não encontrado' });
        if (apiId) bot.botApi = apiId;
        await bot.save();
        res.json({ success: true, message: 'Grupo atualizado' });
    } catch (err) {
        console.error('Erro ao atualizar grupo', err);
        res.json({ success: false, message: 'Erro ao atualizar grupo' });
    }
});

router.post('/grupos/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await excluirBot(req.params.id);
        res.json({ success: true, message: 'Grupo removido' });
    } catch (err) {
        console.error('Erro ao deletar grupo', err);
        res.json({ success: false, message: 'Erro ao deletar grupo' });
    }
});

// ==== GERENCIAMENTO DO BANNER DA HOME ====
router.get('/banner', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.render('admin/banner', { banners, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar banner:', err);
        req.flash('error_msg', 'Erro ao carregar banner');
        res.redirect('/admin');
    }
});

router.post('/banner', isAuthenticated, isAdmin, upload.single('arquivo'), async (req, res) => {
    const file = req.file;
    const { text = '', buttonText = '', buttonUrl = '' } = req.body;
    if (!file) {
        req.flash('error_msg', 'Nenhum arquivo enviado.');
        return res.redirect('/admin/banner');
    }
    try {
        let outName = '';
        let type = '';
        if (file.mimetype.startsWith('video/')) {
            const tempIn = path.join(tmpdir(), file.originalname);
            outName = `banner_${Date.now()}.webm`;
            const dest = path.join('public', 'img', outName);
            await fs.writeFile(tempIn, file.buffer);
            await new Promise((resolve, reject) => {
                ffmpeg(tempIn)
                    .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                    .format('webm')
                    .save(dest)
                    .on('end', resolve)
                    .on('error', reject);
            });
            await fs.unlink(tempIn).catch(() => {});
            type = 'video';
        } else if (file.mimetype.startsWith('image/')) {
            const ext = path.extname(file.originalname).toLowerCase();
            outName = `banner_${Date.now()}${ext}`;
            await fs.writeFile(path.join('public', 'img', outName), file.buffer);
            type = 'image';
        } else {
            req.flash('error_msg', 'Formato não suportado');
            return res.redirect('/admin/banner');
        }

        await Banner.create({
            fileName: outName,
            type,
            text: text.trim(),
            buttonText: buttonText.trim(),
            buttonUrl: buttonUrl.trim()
        });
        await updateSitemap();
        req.flash('success_msg', 'Banner salvo com sucesso!');
        res.redirect('/admin/banner');
    } catch (err) {
        console.error('Erro ao salvar banner:', err);
        req.flash('error_msg', 'Erro ao salvar banner');
        res.redirect('/admin/banner');
    }
});

router.get('/banner/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            req.flash('error_msg', 'Banner não encontrado');
            return res.redirect('/admin/banner');
        }
        res.render('admin/banner_edit', { banner, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar banner:', err);
        req.flash('error_msg', 'Erro ao carregar banner');
        res.redirect('/admin/banner');
    }
});

router.post('/banner/editar/:id', isAuthenticated, isAdmin, upload.single('arquivo'), async (req, res) => {
    const { text = '', buttonText = '', buttonUrl = '' } = req.body;
    const file = req.file;
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            req.flash('error_msg', 'Banner não encontrado');
            return res.redirect('/admin/banner');
        }
        let outName = banner.fileName;
        let type = banner.type;
        if (file) {
            await fs.unlink(path.join('public', 'img', banner.fileName)).catch(() => {});
            if (file.mimetype.startsWith('video/')) {
                const tempIn = path.join(tmpdir(), file.originalname);
                outName = `banner_${Date.now()}.webm`;
                const dest = path.join('public', 'img', outName);
                await fs.writeFile(tempIn, file.buffer);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempIn)
                        .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                        .format('webm')
                        .save(dest)
                        .on('end', resolve)
                        .on('error', reject);
                });
                await fs.unlink(tempIn).catch(() => {});
                type = 'video';
            } else if (file.mimetype.startsWith('image/')) {
                const ext = path.extname(file.originalname).toLowerCase();
                outName = `banner_${Date.now()}${ext}`;
                await fs.writeFile(path.join('public', 'img', outName), file.buffer);
                type = 'image';
            } else {
                req.flash('error_msg', 'Formato não suportado');
                return res.redirect('/admin/banner');
            }
        }
        await Banner.findByIdAndUpdate(req.params.id, {
            fileName: outName,
            type,
            text: text.trim(),
            buttonText: buttonText.trim(),
            buttonUrl: buttonUrl.trim(),
            updatedAt: Date.now()
        });
        await updateSitemap();
        req.flash('success_msg', 'Banner atualizado');
        res.redirect('/admin/banner');
    } catch (err) {
        console.error('Erro ao editar banner:', err);
        req.flash('error_msg', 'Erro ao editar banner');
        res.redirect('/admin/banner');
    }
});

router.get('/banner/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const ban = await Banner.findById(req.params.id);
        if (ban?.fileName) {
            await fs.unlink(path.join('public', 'img', ban.fileName)).catch(() => {});
        }
        await Banner.findByIdAndDelete(req.params.id);
        await updateSitemap();
        req.flash('success_msg', 'Banner removido');
    } catch (err) {
        console.error('Erro ao deletar banner:', err);
        req.flash('error_msg', 'Erro ao deletar banner');
    }
    res.redirect('/admin/banner');
});

// ==== GERENCIAMENTO DE ANÚNCIOS DE PARCEIROS ====
router.get('/anuncios', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const ads = await PartnerAd.find().populate('user', 'nome');
        res.render('admin/anuncios', { ads, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar anúncios:', err);
        req.flash('error_msg', 'Erro ao carregar anúncios');
        res.redirect('/admin');
    }
});

router.post('/anuncios', isAuthenticated, isAdmin, upload.single('arquivo'), async (req, res) => {
    const file = req.file;
    const { text, link, userId } = req.body;
    if (!file) {
        req.flash('error_msg', 'Nenhum arquivo enviado.');
        return res.redirect('/admin/anuncios');
    }
    try {
        if (file.mimetype.startsWith('video/')) {
            const tempIn = path.join(tmpdir(), file.originalname);
            const outName = `ad_${Date.now()}.webm`;
            const dest = path.join('public', 'img', outName);
            await fs.writeFile(tempIn, file.buffer);
            await new Promise((resolve, reject) => {
                ffmpeg(tempIn)
                    .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                    .format('webm')
                    .save(dest)
                    .on('end', resolve)
                    .on('error', reject);
            });
            await fs.unlink(tempIn).catch(() => {});
            await PartnerAd.create({ fileName: outName, type: 'video', text, link, user: userId || null });
        } else if (file.mimetype.startsWith('image/')) {
            const ext = path.extname(file.originalname).toLowerCase();
            const outName = `ad_${Date.now()}${ext}`;
            await fs.writeFile(path.join('public', 'img', outName), file.buffer);
            await PartnerAd.create({ fileName: outName, type: 'image', text, link, user: userId || null });
        } else {
            req.flash('error_msg', 'Formato não suportado');
            return res.redirect('/admin/anuncios');
        }

        req.flash('success_msg', 'Anúncio salvo com sucesso!');
        res.redirect('/admin/anuncios');
    } catch (err) {
        console.error('Erro ao salvar anúncio:', err);
        req.flash('error_msg', 'Erro ao salvar anúncio');
        res.redirect('/admin/anuncios');
    }
});

router.post('/anuncios/editar/:id', isAuthenticated, isAdmin, upload.single('arquivo'), async (req, res) => {
    const { id } = req.params;
    const { text, link, userId } = req.body;
    const update = { text, link };
    if (typeof userId !== 'undefined') {
        update.user = userId || null;
    }
    try {
        if (req.file) {
            if (req.file.mimetype.startsWith('video/')) {
                const tempIn = path.join(tmpdir(), req.file.originalname);
                const outName = `ad_${Date.now()}.webm`;
                const dest = path.join('public', 'img', outName);
                await fs.writeFile(tempIn, req.file.buffer);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempIn)
                        .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                        .format('webm')
                        .save(dest)
                        .on('end', resolve)
                        .on('error', reject);
                });
                await fs.unlink(tempIn).catch(() => {});
                update.fileName = outName;
                update.type = 'video';
            } else if (req.file.mimetype.startsWith('image/')) {
                const ext = path.extname(req.file.originalname).toLowerCase();
                const outName = `ad_${Date.now()}${ext}`;
                await fs.writeFile(path.join('public', 'img', outName), req.file.buffer);
                update.fileName = outName;
                update.type = 'image';
            } else {
                req.flash('error_msg', 'Formato não suportado');
                return res.redirect('/admin/anuncios');
            }
        }

        await PartnerAd.findByIdAndUpdate(id, update);
        req.flash('success_msg', 'Anúncio atualizado');
        res.redirect('/admin/anuncios');
    } catch (err) {
        console.error('Erro ao editar anúncio:', err);
        req.flash('error_msg', 'Erro ao editar anúncio');
        res.redirect('/admin/anuncios');
    }
});

router.post('/anuncios/:id/ativar', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { ativo } = req.body;
    try {
        await PartnerAd.findByIdAndUpdate(id, { active: ativo === 'true' });
        req.flash('success_msg', 'Anúncio atualizado');
        res.redirect('/admin/anuncios');
    } catch (err) {
        console.error('Erro ao atualizar anúncio:', err);
        req.flash('error_msg', 'Erro ao atualizar anúncio');
        res.redirect('/admin/anuncios');
    }
});

router.get('/anuncios/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const ad = await PartnerAd.findById(id);
        if (ad?.fileName) {
            await fs.unlink(path.join('public', 'img', ad.fileName)).catch(() => {});
        }
        await PartnerAd.findByIdAndDelete(id);
        req.flash('success_msg', 'Anúncio removido');
        res.redirect('/admin/anuncios');
    } catch (err) {
        console.error('Erro ao deletar anúncio:', err);
        req.flash('error_msg', 'Erro ao deletar anúncio');
        res.redirect('/admin/anuncios');
    }
});

// ==== GERENCIAMENTO DE COMANDOS ====
router.get('/comandos', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const comandos = await CommandInfo.find().sort({ category: 1, name: 1 });
        const guide = await Tutorial.findOne({ tutorialId: 'commands' });
        const tutorials = await Tutorial.find({ tutorialId: { $ne: 'commands' } }).sort({ updatedAt: -1 });
        const cats = await CommandCategory.find().sort({ name: 1 });
        const categories = cats.map(c => c.name);
        res.render('admin/comandos', {
            comandos,
            guide,
            tutorials,
            categories,
            cats,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.error('Erro ao carregar comandos:', err);
        req.flash('error_msg', 'Erro ao carregar comandos');
        res.redirect('/admin');
    }
});

router.post('/comandos',
    isAuthenticated,
    isAdmin,
    upload.single('tutorialFile'),
    async (req, res) => {
        const { name, description, category } = req.body;
        if (!name || !description || !category) {
            req.flash('error_msg', 'Preencha todos os campos');
            return res.redirect('/admin/comandos');
        }
        const file = req.file;
        let fileName = '';
        let type = '';
        try {
            if (file) {
                const dir = path.join('arquivos', 'admin');
                await fs.mkdir(dir, { recursive: true });
                if (file.mimetype.startsWith('video/')) {
                    const tempIn = path.join(tmpdir(), file.originalname);
                    const outName = `cmd_${Date.now()}.webm`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(tempIn, file.buffer);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempIn)
                            .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                            .format('webm')
                            .save(dest)
                            .on('end', resolve)
                            .on('error', reject);
                    });
                    await fs.unlink(tempIn).catch(() => { });
                    fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    type = 'video';
                } else {
                    const ext = path.extname(file.originalname).toLowerCase();
                    const outName = `cmd_${Date.now()}${ext}`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(dest, file.buffer);
                    fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    type = 'image';
                }
            }
            const slugBase = name.trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            let slug = slugBase;
            let count = 1;
            while (await CommandInfo.findOne({ slug })) {
                slug = `${slugBase}-${count++}`;
            }
            await CommandInfo.create({
                name: name.trim(),
                slug,
                description: description.trim(),
                category: category.trim(),
                fileName,
                type
            });
            await updateSitemap();
            req.flash('success_msg', 'Comando criado');
        } catch (err) {
            console.error('Erro ao criar comando:', err);
            req.flash('error_msg', 'Erro ao criar comando');
        }
        res.redirect('/admin/comandos');
    });

router.post('/comandos/guia',
    isAuthenticated,
    isAdmin,
    upload.fields([{ name: 'videoFile', maxCount: 1 }, { name: 'imageFile', maxCount: 1 }]),
    async (req, res) => {
        const { message } = req.body;
        if (!message) {
            req.flash('error_msg', 'Mensagem inválida');
            return res.redirect('/admin/comandos');
        }
        const videoFile = req.files && req.files.videoFile ? req.files.videoFile[0] : null;
        const imageFile = req.files && req.files.imageFile ? req.files.imageFile[0] : null;

        try {
            let doc = await Tutorial.findOne({ tutorialId: 'commands' });
            const dir = path.join('arquivos', 'admin');
            await fs.mkdir(dir, { recursive: true });

            let fileName = doc ? doc.fileName : '';
            let type = doc ? doc.type : '';

            if (videoFile) {
                if (!videoFile.mimetype.startsWith('video/')) {
                    req.flash('error_msg', 'Formato de vídeo inválido');
                    return res.redirect('/admin/comandos');
                }
                if (fileName.startsWith('/arquivos/admin/')) {
                    await fs.unlink(fileName.slice(1)).catch(() => { });
                }
                const tempIn = path.join(tmpdir(), videoFile.originalname);
                const outName = `guide_${Date.now()}.webm`;
                const dest = path.join(dir, outName);
                await fs.writeFile(tempIn, videoFile.buffer);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempIn)
                        .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                        .format('webm')
                        .save(dest)
                        .on('end', resolve)
                        .on('error', reject);
                });
                await fs.unlink(tempIn).catch(() => { });
                fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                type = 'video';
            } else if (imageFile) {
                if (!imageFile.mimetype.startsWith('image/')) {
                    req.flash('error_msg', 'Formato de imagem inválido');
                    return res.redirect('/admin/comandos');
                }
                if (fileName.startsWith('/arquivos/admin/')) {
                    await fs.unlink(fileName.slice(1)).catch(() => { });
                }
                const ext = path.extname(imageFile.originalname).toLowerCase();
                const outName = `guide_${Date.now()}${ext}`;
                const dest = path.join(dir, outName);
                await fs.writeFile(dest, imageFile.buffer);
                fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                type = 'image';
            }

            if (doc) {
                doc.message = message.trim();
                doc.fileName = fileName;
                doc.type = type;
                doc.updatedAt = new Date();
                await doc.save();
            } else {
                await Tutorial.create({
                    title: 'Guia de Comandos',
                    tutorialId: 'commands',
                    message: message.trim(),
                    fileName,
                    type
                });
            }
            req.flash('success_msg', 'Mensagem atualizada');
        } catch (err) {
            console.error('Erro ao salvar guia de comandos:', err);
            req.flash('error_msg', 'Erro ao salvar mensagem');
        }
        res.redirect('/admin/comandos');
    });

router.post('/comandos/categorias', isAuthenticated, isAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) {
        req.flash('error_msg', 'Nome da categoria inválido');
        return res.redirect('/admin/comandos');
    }
    try {
        await CommandCategory.create({ name: name.trim() });
        req.flash('success_msg', 'Categoria criada');
    } catch (err) {
        console.error('Erro ao criar categoria:', err);
        req.flash('error_msg', 'Erro ao criar categoria');
    }
    res.redirect('/admin/comandos');
});

router.post('/comandos/categorias/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        req.flash('error_msg', 'Nome da categoria inválido');
        return res.redirect('/admin/comandos');
    }
    try {
        const cat = await CommandCategory.findById(id);
        if (!cat) throw new Error('not found');
        const oldName = cat.name;
        cat.name = name.trim();
        cat.updatedAt = new Date();
        await cat.save();
        if (oldName !== cat.name) {
            await CommandInfo.updateMany({ category: oldName }, { category: cat.name });
        }
        req.flash('success_msg', 'Categoria atualizada');
    } catch (err) {
        console.error('Erro ao editar categoria:', err);
        req.flash('error_msg', 'Erro ao editar categoria');
    }
    res.redirect('/admin/comandos');
});

router.get('/comandos/categorias/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const cat = await CommandCategory.findById(id);
        if (cat) {
            await CommandInfo.updateMany({ category: cat.name }, { category: '' });
            await cat.deleteOne();
        }
        req.flash('success_msg', 'Categoria removida');
    } catch (err) {
        console.error('Erro ao deletar categoria:', err);
        req.flash('error_msg', 'Erro ao deletar categoria');
    }
    res.redirect('/admin/comandos');
});

router.post('/comandos/editar/:id',
    isAuthenticated,
    isAdmin,
    upload.single('tutorialFile'),
    async (req, res) => {
        const { id } = req.params;
        const { name, description, category } = req.body;
        if (!name || !description || !category) {
            req.flash('error_msg', 'Preencha todos os campos');
            return res.redirect('/admin/comandos');
        }
        const file = req.file;
        try {
            const cmd = await CommandInfo.findById(id);
            if (!cmd) throw new Error('not found');
            if (file) {
                if (cmd.fileName && cmd.fileName.startsWith('/arquivos/admin/')) {
                    await fs.unlink(cmd.fileName.slice(1)).catch(() => { });
                }
                const dir = path.join('arquivos', 'admin');
                await fs.mkdir(dir, { recursive: true });
                if (file.mimetype.startsWith('video/')) {
                    const tempIn = path.join(tmpdir(), file.originalname);
                    const outName = `cmd_${Date.now()}.webm`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(tempIn, file.buffer);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempIn)
                            .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                            .format('webm')
                            .save(dest)
                            .on('end', resolve)
                            .on('error', reject);
                    });
                    await fs.unlink(tempIn).catch(() => { });
                    cmd.fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    cmd.type = 'video';
                } else {
                    const ext = path.extname(file.originalname).toLowerCase();
                    const outName = `cmd_${Date.now()}${ext}`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(dest, file.buffer);
                    cmd.fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    cmd.type = 'image';
                }
            }
            const newName = name.trim();
            if (!cmd.slug || cmd.name !== newName) {
                const slugBase = newName
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-');
                let slug = slugBase;
                let count = 1;
                while (await CommandInfo.findOne({ slug, _id: { $ne: id } })) {
                    slug = `${slugBase}-${count++}`;
                }
                cmd.slug = slug;
            }
            cmd.name = newName;
            cmd.description = description.trim();
            cmd.category = category.trim();
            cmd.updatedAt = new Date();
            await cmd.save();
            await updateSitemap();
            req.flash('success_msg', 'Comando atualizado');
        } catch (err) {
            console.error('Erro ao editar comando:', err);
            req.flash('error_msg', 'Erro ao editar comando');
        }
        res.redirect('/admin/comandos');
    });

router.get('/comandos/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        await CommandInfo.findByIdAndDelete(req.params.id);
        await updateSitemap();
        req.flash('success_msg', 'Comando removido');
    } catch (err) {
        console.error('Erro ao deletar comando:', err);
        req.flash('error_msg', 'Erro ao deletar comando');
    }
    res.redirect('/admin/comandos');
});

// ==== TUTORIAIS EXPLICATIVOS ====
router.post('/tutorials',
    isAuthenticated,
    isAdmin,
    upload.single('tutorialFile'),
    async (req, res) => {
        const { title, tutorialId, message } = req.body;
        if (!title || !tutorialId || !message) {
            req.flash('error_msg', 'Preencha todos os campos');
            return res.redirect('/admin/comandos');
        }
        const file = req.file;
        let fileName = '';
        let type = '';
        try {
            if (file) {
                const dir = path.join('arquivos', 'admin');
                await fs.mkdir(dir, { recursive: true });
                if (file.mimetype.startsWith('video/')) {
                    const tempIn = path.join(tmpdir(), file.originalname);
                    const outName = `tutorial_${Date.now()}.webm`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(tempIn, file.buffer);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempIn)
                            .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                            .format('webm')
                            .save(dest)
                            .on('end', resolve)
                            .on('error', reject);
                    });
                    await fs.unlink(tempIn).catch(() => { });
                    fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    type = 'video';
                } else {
                    const ext = path.extname(file.originalname).toLowerCase();
                    const outName = `tutorial_${Date.now()}${ext}`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(dest, file.buffer);
                    fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    type = 'image';
                }
            }
            const slugBase = title.trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            let slug = slugBase;
            let count = 1;
            while (await Tutorial.findOne({ slug })) {
                slug = `${slugBase}-${count++}`;
            }
            await Tutorial.create({
                title: title.trim(),
                slug,
                tutorialId: tutorialId.trim(),
                message: message.trim(),
                fileName,
                type
            });
            await updateSitemap();
            req.flash('success_msg', 'Tutorial criado');
        } catch (err) {
            console.error('Erro ao criar tutorial:', err);
            req.flash('error_msg', 'Erro ao criar tutorial');
        }
        res.redirect('/admin/comandos');
    });

router.post('/tutorials/editar/:id',
    isAuthenticated,
    isAdmin,
    upload.single('tutorialFile'),
    async (req, res) => {
        const { id } = req.params;
        const { title, tutorialId, message } = req.body;
        if (!title || !tutorialId || !message) {
            req.flash('error_msg', 'Preencha todos os campos');
            return res.redirect('/admin/comandos');
        }
        const file = req.file;
        try {
            const tut = await Tutorial.findById(id);
            if (!tut) throw new Error('not found');
            if (file) {
                if (tut.fileName && tut.fileName.startsWith('/arquivos/admin/')) {
                    await fs.unlink(tut.fileName.slice(1)).catch(() => { });
                }
                const dir = path.join('arquivos', 'admin');
                await fs.mkdir(dir, { recursive: true });
                if (file.mimetype.startsWith('video/')) {
                    const tempIn = path.join(tmpdir(), file.originalname);
                    const outName = `tutorial_${Date.now()}.webm`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(tempIn, file.buffer);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempIn)
                            .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                            .format('webm')
                            .save(dest)
                            .on('end', resolve)
                            .on('error', reject);
                    });
                    await fs.unlink(tempIn).catch(() => { });
                    tut.fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    tut.type = 'video';
                } else {
                    const ext = path.extname(file.originalname).toLowerCase();
                    const outName = `tutorial_${Date.now()}${ext}`;
                    const dest = path.join(dir, outName);
                    await fs.writeFile(dest, file.buffer);
                    tut.fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                    tut.type = 'image';
                }
            }
            const newTitle = title.trim();
            if (!tut.slug || tut.title !== newTitle) {
                const slugBase = newTitle
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-');
                let slug = slugBase;
                let count = 1;
                while (await Tutorial.findOne({ slug, _id: { $ne: id } })) {
                    slug = `${slugBase}-${count++}`;
                }
                tut.slug = slug;
            }
            tut.title = newTitle;
            tut.tutorialId = tutorialId.trim();
            tut.message = message.trim();
            tut.updatedAt = new Date();
            await tut.save();
            await updateSitemap();
            req.flash('success_msg', 'Tutorial atualizado');
        } catch (err) {
            console.error('Erro ao editar tutorial:', err);
            req.flash('error_msg', 'Erro ao editar tutorial');
        }
        res.redirect('/admin/comandos');
    });

router.get('/tutorials/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const t = await Tutorial.findById(req.params.id);
        if (t?.fileName && t.fileName.startsWith('/arquivos/admin/')) {
            await fs.unlink(t.fileName.slice(1)).catch(() => { });
        }
        await Tutorial.findByIdAndDelete(req.params.id);
        await updateSitemap();
        req.flash('success_msg', 'Tutorial removido');
    } catch (err) {
        console.error('Erro ao deletar tutorial:', err);
        req.flash('error_msg', 'Erro ao deletar tutorial');
    }
    res.redirect('/admin/comandos');
});

router.get('/deposits', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const depositos = await Deposit.find().populate('usuario').sort({ criadoEm: -1 });

        res.render('deposits', {
            depositos,
            layout: 'deposits'
        });
    } catch (err) {
        console.error('Erro ao carregar depósitos:', err);
        req.flash('error_msg', 'Erro ao carregar os depósitos.');
        res.redirect('/admin');
    }
});

// ==== CONFIGURAÇÕES DE CORES ====
router.get('/configuracoes', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) {
            config = { themeDark: DEFAULT_DARK_THEME, themeLight: DEFAULT_LIGHT_THEME };
        }
        res.render('admin/configuracoes', {
            config,
            darkTheme: DEFAULT_DARK_THEME,
            lightTheme: DEFAULT_LIGHT_THEME,
            layout: 'admin/layout/main'
        });
    } catch (err) {
        console.error('Erro ao carregar configurações:', err);
        req.flash('error_msg', 'Erro ao carregar configurações');
        res.redirect('/admin');
    }
});

router.post('/configuracoes/cores', isAuthenticated, isAdmin, async (req, res) => {
    const { dark = {}, light = {} } = req.body;
    try {
        let config = await SiteConfig.findOne();
        const newDark = { ...DEFAULT_DARK_THEME, ...(config ? config.themeDark : {}), ...dark };
        const newLight = { ...DEFAULT_LIGHT_THEME, ...(config ? config.themeLight : {}), ...light };
        if (!config) {
            await SiteConfig.create({ themeDark: newDark, themeLight: newLight });
        } else {
            config.themeDark = newDark;
            config.themeLight = newLight;
            config.updatedAt = new Date();
            await config.save();
        }
        req.flash('success_msg', 'Cores atualizadas');
    } catch (err) {
        console.error('Erro ao salvar configurações:', err);
        req.flash('error_msg', 'Erro ao salvar configurações');
    }
    res.redirect('/admin/configuracoes');
});

// ==== SEO ====
router.get('/seo', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) {
            config = {
                seo: DEFAULT_SEO,
                blogSeo: DEFAULT_BLOG_SEO,
                tutorialsSeo: DEFAULT_TUTORIALS_SEO,
                termsSeo: DEFAULT_TERMS_SEO,
                privacySeo: DEFAULT_PRIVACY_SEO,
                loginSeo: DEFAULT_LOGIN_SEO,
                signupSeo: DEFAULT_SIGNUP_SEO
            };
        }
        res.render('admin/seo', { config, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar SEO:', err);
        req.flash('error_msg', 'Erro ao carregar SEO');
        res.redirect('/admin');
    }
});

router.post('/seo', isAuthenticated, isAdmin,
    upload.fields([
        { name: 'seoImage', maxCount: 1 },
        { name: 'blogImage', maxCount: 1 },
        { name: 'tutorialsImage', maxCount: 1 },
        { name: 'termsImage', maxCount: 1 },
        { name: 'privacyImage', maxCount: 1 },
        { name: 'loginImage', maxCount: 1 },
        { name: 'signupImage', maxCount: 1 }
    ]),
    async (req, res) => {
    const section = req.body.section || 'site';
    try {
        let config = await SiteConfig.findOne();
        if (!config) {
            config = new SiteConfig({
                seo: { ...DEFAULT_SEO },
                blogSeo: { ...DEFAULT_BLOG_SEO },
                tutorialsSeo: { ...DEFAULT_TUTORIALS_SEO },
                termsSeo: { ...DEFAULT_TERMS_SEO },
                privacySeo: { ...DEFAULT_PRIVACY_SEO }
            });
        }

        const dir = path.join('arquivos', 'admin');
        await fs.mkdir(dir, { recursive: true });

        const updateSeo = (current, fields, fileKey) => {
            const seo = { ...(current || {}), ...fields };
            if (req.files[fileKey] && req.files[fileKey][0]) {
                const ext = path.extname(req.files[fileKey][0].originalname).toLowerCase();
                const fname = `${fileKey}_${Date.now()}${ext}`;
                return fs.writeFile(path.join(dir, fname), req.files[fileKey][0].buffer)
                    .then(() => {
                        if (seo.image && seo.image.startsWith('/arquivos/admin/')) {
                            return fs.unlink(seo.image.slice(1)).catch(() => {});
                        }
                    })
                    .then(() => {
                        seo.image = '/' + path.join('arquivos', 'admin', fname);
                        return seo;
                    });
            }
            return Promise.resolve(seo);
        };

        if (section === 'blog') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.blogSeo = await updateSeo(config.blogSeo, fields, 'blogImage');
        } else if (section === 'tutorials') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.tutorialsSeo = await updateSeo(config.tutorialsSeo, fields, 'tutorialsImage');
        } else if (section === 'terms') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.termsSeo = await updateSeo(config.termsSeo, fields, 'termsImage');
        } else if (section === 'privacy') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.privacySeo = await updateSeo(config.privacySeo, fields, 'privacyImage');
        } else if (section === 'login') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.loginSeo = await updateSeo(config.loginSeo, fields, 'loginImage');
        } else if (section === 'signup') {
            const fields = {
                title: req.body.title || '',
                description: req.body.description || '',
                keywords: req.body.keywords || ''
            };
            config.signupSeo = await updateSeo(config.signupSeo, fields, 'signupImage');
        } else {
            const fields = { title: req.body.title || '', description: req.body.description || '', keywords: req.body.keywords || '' };
            config.seo = await updateSeo(config.seo.toObject ? config.seo.toObject() : config.seo, fields, 'seoImage');
        }

        config.updatedAt = new Date();
        await config.save();
        req.flash('success_msg', 'SEO atualizado');
    } catch (err) {
        console.error('Erro ao salvar SEO:', err);
        req.flash('error_msg', 'Erro ao salvar SEO');
    }
    res.redirect('/admin/seo');
});

// ==== LOGO ====
router.get('/logo', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = { logo: DEFAULT_LOGO, logoStyle: '' };
        res.render('admin/logo', { config, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar logo:', err);
        req.flash('error_msg', 'Erro ao carregar logo');
        res.redirect('/admin');
    }
});

router.post('/logo', isAuthenticated, isAdmin, upload.single('logo'), async (req, res) => {
    try {
        const jimp = require('jimp');
        const dir = path.join('arquivos', 'admin');
        await fs.mkdir(dir, { recursive: true });
        let filePath;
        if (req.file) {
            filePath = path.join(dir, `logo_${Date.now()}.webp`);
            const img = await jimp.read(req.file.buffer);
            await img.writeAsync(filePath);
        }

        let config = await SiteConfig.findOne();
        if (!config) config = new SiteConfig({});

        if (filePath) {
            if (config.logo && config.logo.startsWith('/arquivos/admin/')) {
                await fs.unlink(config.logo.slice(1)).catch(() => {});
            }
            config.logo = '/' + filePath;
        }
        config.logoStyle = req.body.logoStyle || '';
        config.updatedAt = new Date();

        await config.save();
        req.flash('success_msg', 'Logo atualizada');
    } catch (err) {
        console.error('Erro ao salvar logo:', err);
        req.flash('error_msg', 'Erro ao salvar logo');
    }
    res.redirect('/admin/logo');
});

// ==== POPUP WHATSAPP ====
router.get('/popup', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) {
            config = {
                whatsappNumber: '559295333643',
                messageBaseUrl: 'https://wzap.assinazap.shop',
                messageApiKey: 'A762E6A59827-4C78-8162-3056A928430C',
                messageInstance: '5592991129258'
            };
        }
        res.render('admin/popup', { config, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar popup:', err);
        req.flash('error_msg', 'Erro ao carregar popup');
        res.redirect('/admin');
    }
});

router.post('/popup', isAuthenticated, isAdmin, async (req, res) => {
    const {
        whatsappNumber = '',
        messageBaseUrl = '',
        messageApiKey = '',
        messageInstance = ''
    } = req.body;
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = new SiteConfig({});
        config.whatsappNumber = whatsappNumber.trim() || '559295333643';
        if (messageBaseUrl) config.messageBaseUrl = messageBaseUrl.trim();
        if (messageApiKey) config.messageApiKey = messageApiKey.trim();
        if (messageInstance) config.messageInstance = messageInstance.trim();
        config.updatedAt = new Date();
        await config.save();
        req.flash('success_msg', 'Configurações atualizadas');
    } catch (err) {
        console.error('Erro ao salvar número:', err);
        req.flash('error_msg', 'Erro ao salvar número');
    }
    res.redirect('/admin/popup');
});

// ==== NOTIFICAÇÕES TELEGRAM ====
router.get('/telegram', isAuthenticated, isAdmin, async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) {
            config = { telegramToken: '', telegramChatId: '', telegramChannelId: '', telegramNotify: false };
        }
        res.render('admin/telegram', { config, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar telegram:', err);
        req.flash('error_msg', 'Erro ao carregar telegram');
        res.redirect('/admin');
    }
});

router.post('/telegram', isAuthenticated, isAdmin, async (req, res) => {
    const { telegramToken = '', telegramChatId = '', telegramChannelId = '', telegramNotify } = req.body;
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = new SiteConfig({});
        config.telegramToken = telegramToken.trim();
        config.telegramChatId = telegramChatId.trim();
        config.telegramChannelId = telegramChannelId.trim();
        config.telegramNotify = telegramNotify === 'on' || telegramNotify === '1' || telegramNotify === 'true';
        config.updatedAt = new Date();
        await config.save();
        req.flash('success_msg', 'Configurações atualizadas');
    } catch (err) {
        console.error('Erro ao salvar telegram:', err);
        req.flash('error_msg', 'Erro ao salvar telegram');
    }
    res.redirect('/admin/telegram');
});

// ==== POSTS PARA TUTORIAIS ====
router.get('/posts', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.render('admin/posts', { posts, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao carregar posts:', err);
        req.flash('error_msg', 'Erro ao carregar posts');
        res.redirect('/admin');
    }
});

router.post('/posts', isAuthenticated, isAdmin, upload.single('file'), async (req, res) => {
    const { title, message, buttonLabel = '', buttonUrl = '' } = req.body;
    if (!title || !message) {
        req.flash('error_msg', 'Preencha todos os campos');
        return res.redirect('/admin/posts');
    }
    let fileName = '';
    let type = '';
    const slugBase = title.trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
    let slug = slugBase;
    let count = 1;
    while (await Post.findOne({ slug })) {
        slug = `${slugBase}-${count++}`;
    }
    try {
        if (req.file) {
            const dir = path.join('arquivos', 'admin');
            await fs.mkdir(dir, { recursive: true });
            if (req.file.mimetype.startsWith('video/')) {
                const tempIn = path.join(tmpdir(), req.file.originalname);
                const outName = `post_${Date.now()}.webm`;
                const dest = path.join(dir, outName);
                await fs.writeFile(tempIn, req.file.buffer);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempIn)
                        .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
                        .format('webm')
                        .save(dest)
                        .on('end', resolve)
                        .on('error', reject);
                });
                await fs.unlink(tempIn).catch(() => { });
                fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                type = 'video';
            } else if (req.file.mimetype.startsWith('image/')) {
                const tempIn = path.join(tmpdir(), req.file.originalname);
                const outName = `post_${Date.now()}.webp`;
                const dest = path.join(dir, outName);
                await fs.writeFile(tempIn, req.file.buffer);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempIn)
                        .toFormat('webp')
                        .save(dest)
                        .on('end', resolve)
                        .on('error', reject);
                });
                await fs.unlink(tempIn).catch(() => { });
                fileName = '/' + path.join('arquivos', 'admin', outName).replace(/\\/g, '/');
                type = 'image';
            }
        }
        const post = await Post.create({
            title: title.trim(),
            slug,
            message: message.trim(),
            fileName,
            type,
            buttonLabel: buttonLabel.trim(),
            buttonUrl: buttonUrl.trim()
        });
        try {
            const link = `${basesiteUrl}/blog/${slug}`;
            const buttons = [];
            if (buttonLabel && buttonUrl) {
                buttons.push({ text: buttonLabel.trim(), url: buttonUrl.trim() });
            }
            buttons.push({ text: 'Ler post', url: link });
            const media = fileName ? { url: `${basesiteUrl}${fileName}`, type } : null;
            await enviarTelegramChannel(`<b>${title.trim()}</b>\n${message.trim()}`, buttons, media);
        } catch (e) {
            console.error('Erro ao enviar post para Telegram:', e.message);
        }
        await updateSitemap();
        req.flash('success_msg', 'Post criado');
    } catch (err) {
        console.error('Erro ao criar post:', err);
        req.flash('error_msg', 'Erro ao criar post');
    }
    res.redirect('/admin/posts');
});

router.get('/posts/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (post) {
            if (post.fileName && post.fileName.startsWith('/arquivos/admin/')) {
                await fs.unlink(post.fileName.slice(1)).catch(() => { });
            }
            await post.deleteOne();
        }
        await updateSitemap();
        req.flash('success_msg', 'Post deletado');
    } catch (err) {
        console.error('Erro ao deletar post:', err);
        req.flash('error_msg', 'Erro ao deletar post');
    }
    res.redirect('/admin/posts');
});

// ==== IDIOMAS ====
router.get('/idiomas', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const idiomas = await Language.find();
        res.render('admin/idiomas', { idiomas, layout: 'admin/layout/main' });
    } catch (err) {
        console.error('Erro ao listar idiomas:', err);
        req.flash('error_msg', 'Erro ao listar idiomas');
        res.redirect('/admin');
    }
});

router.post('/idiomas/criar', isAuthenticated, isAdmin, async (req, res) => {
    const { code, name } = req.body;
    if (!code || !name) {
        req.flash('error_msg', 'Preencha todos os campos');
        return res.redirect('/admin/idiomas');
    }
    try {
        await Language.create({ code: code.trim(), name: name.trim(), translations: {} });
        await loadTranslations();
        req.flash('success_msg', 'Idioma criado');
    } catch (err) {
        console.error('Erro ao criar idioma:', err);
        req.flash('error_msg', 'Erro ao criar idioma');
    }
    res.redirect('/admin/idiomas');
});

router.post('/idiomas/editar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, code, translations: txt } = req.body;
    try {
        const parsed = JSON.parse(txt || '{}');
        await Language.findByIdAndUpdate(id, { name, code, translations: parsed });
        await loadTranslations();
        req.flash('success_msg', 'Idioma atualizado');
    } catch (err) {
        console.error('Erro ao atualizar idioma:', err);
        req.flash('error_msg', 'Erro ao atualizar idioma');
    }
    res.redirect('/admin/idiomas');
});

router.get('/idiomas/deletar/:id', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await Language.deleteOne({ _id: id });
        await loadTranslations();
        req.flash('success_msg', 'Idioma excluído');
    } catch (err) {
        console.error('Erro ao excluir idioma:', err);
        req.flash('error_msg', 'Erro ao excluir idioma');
    }
    res.redirect('/admin/idiomas');
});



module.exports = router;
