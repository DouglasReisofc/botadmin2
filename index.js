const express = require('express');
const app = express();
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const storage = multer.memoryStorage(); // ou diskStorage se quiser salvar o arquivo
const upload = multer({ storage });
const session = require('express-session');
const cookieParser = require('cookie-parser');
const expressLayout = require('express-ejs-layouts');
const rateLimit = require("express-rate-limit");
const passport = require('passport');
const flash = require('connect-flash');
const FileStore = require('./utils/fileStore');
const compression = require('compression');
const cron = require('node-cron')
const { normalizeJid } = require('./utils/phone');

const mainrouter = require('./apis')
const userRouters = require('./routes/users');
const premiumRouters = require('./rotas/premium');
const adminRouter = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const Deposit = require('./db/deposits');
const { verificarPagamentoPix } = require('./db/pagamento');
const ConfigPagamento = require('./db/configpagamentos');
const fs = require('fs');
const fsPromises = require('fs/promises');
const { notAuthenticated, isAuthenticated, isAdmin } = require('./funcoes/auth');
const { conectar_db } = require('./db/connect');
const {
  pegar_apikey,
  Totalregistrados,
  resetar_todos_limit
} = require('./db/db');
const { ExpiredTime } = require('./db/premium');
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
  convertQuotedToSticker,
  forwardWithMentionAll,
  downloadMedia,
  fixarMensagem,
  desfixarMensagem,
  transcribeAudioGroq,
  synthesizeGroqSpeech,
  synthesizegesseritTTS,
  openGroupWindow,
  setMessagesAdminsOnly,
  findGroupInfos
} = require('./db/waActions');
const moment = require('moment-timezone');
const { criarBot, editarGrupoBot, excluirBot, checarLimites, garantirPlanoAtivoMiddleware, garantirGrupoCadastradoMiddleware, verificarLimiteInstancias, verificarCapacidadeServidor, sincronizarStatusAdminMiddleware } = require('./db/bot');
const { BotApi } = require('./db/botApi'); // Importa o modelo BotApi
const { BotConfig } = require('./db/botConfig');
const { Server } = require('./db/server');
const Sorteio = require('./db/Sorteio');
const { IAGroupMemory } = require('./db/iagroupmemory');
const { usuario } = require('./db/model');
const { Plano } = require('./db/planos');
const { ExtraPlan } = require('./db/extraPlan');
const { Banner } = require('./db/banner');
const { PartnerAd } = require('./db/partnerAd');
const { ShortLink } = require('./db/shortLink');
const { CommandInfo } = require('./db/commandInfo');
const { Tutorial } = require('./db/tutorial');
const { Post } = require('./db/post');
const { SiteConfig } = require('./db/siteConfig');
const { VisitLog } = require('./db/visitLog');
const { updateSitemap } = require('./utils/sitemap');
const ffmpeg = require('fluent-ffmpeg');
const { tmpdir } = require('os');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const { enviarTextoSite, enviarTelegramSite, enviarTelegramChannel } = require('./funcoes/function');
const { port, basesiteUrl } = require('./configuracao');
const siteUrl = basesiteUrl; // base para gerar links encurtados
const PORT = port || 7766;
const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

const Language = require('./db/language');

const defaultTranslations = {
  ptbr: require('./idiomas/ptbr.json'),
  enus: require('./idiomas/enus.json'),
  es: require('./idiomas/es.json'),
};

let translations = {};

async function loadTranslations() {
  const langs = await Language.find();
  if (!langs.length) {
    translations = { ...defaultTranslations };
    for (const code of Object.keys(defaultTranslations)) {
      const existing = await Language.findOne({ code });
      if (!existing) {
        await Language.create({ code, name: code, translations: defaultTranslations[code] });
      }
    }
  } else {
    translations = {};
    for (const lang of langs) {
      const defaults = defaultTranslations[lang.code] || {};
      const merged = { ...defaults, ...lang.translations };
      translations[lang.code] = merged;

      // Update DB with any new keys from defaults
      const missingKeys = Object.keys(defaults).filter(k => !(k in lang.translations));
      if (missingKeys.length) {
        await Language.updateOne({ code: lang.code }, { translations: merged });
      }
    }
  }
}


async function generateShortCode() {
  let code;
  do {
    code = crypto.randomBytes(4).toString('base64url');
  } while (await ShortLink.exists({ code }));
  return code;
}

app.set('trust proxy', 1);
app.use(compression())

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 2000,
  message: 'Oops too many requests'
});
app.use(limiter);

app.set('view engine', 'ejs');
app.set('layout', 'layouts/main');
app.use(expressLayout);
app.use(express.static('public'));
app.use('/arquivos', express.static('arquivos'));


const sessionStore = new FileStore('sessions.json');
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 },
  store: sessionStore,
}));
app.use(express.json({ limit: '400mb' }));
app.use(express.urlencoded({ extended: true, limit: '400mb' }));
app.use(cookieParser());

app.use(passport.initialize());
app.use(passport.session());
require('./funcoes/config')(passport);

app.use(flash());
app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});


app.use(function (req, res, next) {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  res.locals.adminReturn = Boolean(req.session.adminId);
  next();
})

app.use(async function (req, res, next) {
  try {
    res.locals.siteConfig = await SiteConfig.findOne();
  } catch (err) {
    console.error('Erro ao carregar configuracao do site:', err);
    res.locals.siteConfig = null;
  }
  next();
});

app.use((req, res, next) => {
  const lang = req.cookies.lang || 'ptbr';
  res.locals.lang = translations[lang] ? lang : 'ptbr';
  res.locals.translations = translations[res.locals.lang];
  res.locals.t = key => res.locals.translations[key] || key;
  next();
});


// ✅ Função para apagar arquivos mais antigos que 10 horas
async function apagar_arquivos() {
  try {
    // Lê o arquivo JSON com a lista de vídeos
    const data = await fsPromises.readFile('videos.json', 'utf-8');
    const videosJson = JSON.parse(data);
    const agora = moment();

    let houveAlteracoes = false;

    for (const videoId in videosJson) {
      const video = videosJson[videoId];
      const filePath = video.file_path;
      const videoData = video.data;

      // Converte a data do vídeo
      const dataDoVideo = moment(videoData, "YYYY-MM-DD HH:mm:ss");
      const difEmHoras = agora.diff(dataDoVideo, 'hours');

      if (difEmHoras >= 10) {
        try {
          // Verifica se o arquivo existe e deleta
          await fsPromises.access(filePath);
          await fsPromises.unlink(filePath);
          console.log(`🗑️ Arquivo ${filePath} apagado com sucesso.`);

          // Remove do JSON
          delete videosJson[videoId];
          houveAlteracoes = true;

        } catch {
          console.log(`⚠️ Arquivo ${filePath} não encontrado ou já foi removido.`);
        }
      }
    }

    // Atualiza o JSON somente se houver alterações
    if (houveAlteracoes) {
      await fsPromises.writeFile('videos.json', JSON.stringify(videosJson, null, 4), 'utf-8');
      console.log('✅ Arquivo videos.json atualizado com sucesso.');
    } else {
      console.log('ℹ️ Nenhum arquivo antigo encontrado para apagar.');
    }

  } catch (err) {
    console.error('🔥 Erro ao tentar apagar os arquivos:', err);
  }
}


async function processarSorteios() {
  try {
    const agora = moment().tz('America/Sao_Paulo');

    const todos = await Sorteio.find({ concluido: false })
      .populate({ path: 'bot', populate: { path: 'botApi' } });

    for (const sorteio of todos) {
      const botConfig = sorteio.bot;
      if (!botConfig) continue;

      const botApi = botConfig.botApi;
      if (!botApi || !botApi.status) continue;

      const { baseUrl, apikey, instance } = botApi;
      const groupId = botConfig.groupId;

      try {
        await openGroupWindow(baseUrl, apikey, instance, groupId);
        await new Promise(r => setTimeout(r, 10000));
      } catch (err) {
        console.warn(`⚠️ Falha ao abrir janela do grupo ${groupId}:`, err.message);
      }

      if (!moment(sorteio.sortearEm).isValid()) {
        sorteio.sortearEm = agora.toDate();
        await sorteio.save();
      }

      const horaSorteio = moment(sorteio.sortearEm).tz('America/Sao_Paulo');
      if (agora.isBefore(horaSorteio)) continue;

      const totalPart = Array.isArray(sorteio.participantes) ? sorteio.participantes.length : 0;

      if (sorteio.tipo === 'automatico' && totalPart < sorteio.maxParticipantes) continue;

      const winnersCount = Math.min(sorteio.winnersCount, totalPart);
      if (winnersCount === 0) continue;

      const vencedores = sorteio.participantes.slice(0, winnersCount);
      const linhas = vencedores.map(jid => `🏆 @${jid.replace(/@c\.us$/, '')}`).join('\n');

      const texto = [
        '乂  S O R T E I O   F I N A L I Z A D O 乂  🎉',
        '',
        'Parabéns!',
        linhas,
        '',
        `Ganhou: *${sorteio.pergunta}*`
      ].join('\n');

      try {
        await sendText(baseUrl, apikey, instance, groupId, texto, null, true);
      } catch (err) {
        console.error(`❌ Falha ao enviar mensagem para grupo ${groupId}:`, err.message);
      }

      try {
        const pollMsgId = sorteio.serialized?.split('_')[2];
        const botSender = `${instance}@c.us`;
        if (pollMsgId) {
          await deleteMessageForEveryone(baseUrl, apikey, instance, pollMsgId, groupId, botSender, true);
        }
      } catch (err) {
        console.warn(`⚠️ Não foi possível apagar enquete:`, err.message);
      }

      try {
        await Sorteio.deleteOne({ _id: sorteio._id });
      } catch (err) {
        console.error(`❌ Erro ao remover sorteio ${sorteio._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Erro geral ao processar sorteios:', err);
  }
}


async function abrirefechargruposautomatico() {
  const horaAtual = moment().tz('America/Sao_Paulo').format('HH:mm');
  console.log(`[cron] Verificando grupos às ${horaAtual}`);

  const bots = await BotConfig.find({ status: true }).populate('botApi');

  for (const bot of bots) {
    const horario = bot.horarioGrupo || {};
    const botApi = bot.botApi;
    if (!botApi || !botApi.status) continue;
    const botJidNorm = normalizeJid(`${botApi.instance}@c.us`);
    const botAdmin = (bot.participantes || []).some(p =>
      normalizeJid(p.id) === botJidNorm && ['admin', 'superadmin'].includes(p.admin)
    );
    if (!horario.ativo || !botAdmin) continue;
    const groupId = bot.groupId;

    const { baseUrl, apikey, instance } = botApi;
    console.log(`[cron] Grupo ${groupId} - abrir: ${horario.abrir || '-'} fechar: ${horario.fechar || '-'} statusAtual: ${horario.statusAtual || '-'} horaAtual: ${horaAtual}`);

    try {
      const info = await findGroupInfos(baseUrl, instance, groupId, apikey);
      const statusAtual = horario.statusAtual || '';
      const isFechado = info?.announce === true;
      const now = moment().tz('America/Sao_Paulo');
      const abrirMom = horario.abrir ? moment.tz(horario.abrir, 'HH:mm', 'America/Sao_Paulo') : null;
      const fecharMom = horario.fechar ? moment.tz(horario.fechar, 'HH:mm', 'America/Sao_Paulo') : null;

      // Mensagens personalizadas
      const msgAbrir = `🚨 *ATENÇÃO!*\n\n✅ O grupo foi *aberto* às ${horaAtual}.\nAgora *todos os participantes* podem enviar mensagens.`;
      const msgFechar = `🚫 *ATENÇÃO!*\n\n🔒 O grupo foi *fechado automaticamente* às ${horaAtual}.\n*Somente administradores* podem enviar mensagens.`;

      // Abrir grupo
      const deveAbrir =
        abrirMom &&
        now.isSameOrAfter(abrirMom) &&
        (!fecharMom || now.isBefore(fecharMom)) &&
        isFechado;
      if (deveAbrir) {
        console.log(`[cron] Abrindo grupo ${groupId}`);
        await setMessagesAdminsOnly(baseUrl, apikey, instance, groupId, false);
        await BotConfig.updateOne({ _id: bot._id }, {
          $set: { 'horarioGrupo.statusAtual': 'aberto' }
        });
        await sendText(baseUrl, apikey, instance, groupId, msgAbrir);
      }

      // Fechar grupo
      const deveFechar = fecharMom && now.isSameOrAfter(fecharMom) && !isFechado;
      if (deveFechar) {
        console.log(`[cron] Fechando grupo ${groupId}`);
        await setMessagesAdminsOnly(baseUrl, apikey, instance, groupId, true);
        await BotConfig.updateOne({ _id: bot._id }, {
          $set: { 'horarioGrupo.statusAtual': 'fechado' }
        });
        await sendText(baseUrl, apikey, instance, groupId, msgFechar);
      }

      // Corrigir status divergente
      if (isFechado && statusAtual !== 'fechado') {
        await BotConfig.updateOne({ _id: bot._id }, {
          $set: { 'horarioGrupo.statusAtual': 'fechado' }
        });
      } else if (!isFechado && statusAtual !== 'aberto') {
        await BotConfig.updateOne({ _id: bot._id }, {
          $set: { 'horarioGrupo.statusAtual': 'aberto' }
        });
      }

      console.log(`[cron] Grupo ${groupId} está ${isFechado ? 'fechado' : 'aberto'} (status salvo: ${horario.statusAtual || '-'})`);

    } catch (err) {
      console.error(`❌ Erro ao processar grupo ${groupId}:`, err.message);
    }
  }
}





// Verifica e executa abertura/fechamento de grupos a cada 1 minuto
cron.schedule('*/1 * * * *', async () => {
  try {
    await abrirefechargruposautomatico();
  } catch (err) {
    console.error('❌ Erro na cron de abrir/fechar grupos:', err.message);
  }
}, {
  scheduled: true,
  timezone: 'America/Sao_Paulo'
});




// ───> NOVO CRON PARA SORTEIOS (a cada 1 minuto)
cron.schedule('*/1 * * * *', async () => {
  await processarSorteios();
}, {
  scheduled: true,
  timezone: 'America/Sao_Paulo'
});

// Cron job para rodar a função de apagar arquivos a cada hora
cron.schedule('0 * * * *', async () => {
  console.log('Iniciando limpeza de vídeos antigos...');
  await apagar_arquivos();  // Chama a função para apagar os arquivos antigos
}, {
  scheduled: true,
  timezone: "America/Sao_Paulo"
});

cron.schedule('00 12 * * *', () => {
  resetar_todos_limit();
  console.log('Todos os Limits foram resetados')
}, {
  scheduled: true,
  timezone: "America/Sao_Paulo"
})

cron.schedule('05 0 * * *', () => {
  ExpiredTime();
}, {
  scheduled: true,
  timezone: 'America/Sao_Paulo'
});

app.get('/', async (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/painel');
  try {
    const planos = await Plano.find({});
    const banner = await Banner.findOne().sort({ createdAt: -1 });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const info = geoip.lookup(ip) || {};
    const country = info.country || 'UNK';
    const ua = req.get('User-Agent') || '';
    const referer = req.headers['referer'] || req.headers['referrer'] || '';
    VisitLog.create({ ip, country, userAgent: ua, path: '/', referer }).catch(() => {});

    res.render('index', {
      layout: false,
      siteUrl,
      planos,
      banner,
      user: null,
      initialReferrer: referer
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      layout: false,
      siteUrl,
      planos: [],
      banner: null,
      user: null,
      initialReferrer: req.headers['referer'] || req.headers['referrer'] || ''
    });
  }
});

app.get('/entrar', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/painel');
  res.render('login', { layout: false, siteUrl });
});

app.get('/cadastrar', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/painel');
  res.render('signup', { layout: false, siteUrl });
});

app.post('/logvisit', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  let { referrer = '', path = '/', info = {} } = req.body || {};
  const ua = req.get('User-Agent') || '';
  if (!referrer) referrer = req.headers['referer'] || req.headers['referrer'] || '';
  const country = info.country_code || info.country || (geoip.lookup(ip) || {}).country || 'UNK';

  VisitLog.create({
    ip,
    country,
    userAgent: ua,
    path,
    referer: referrer,
    details: info
  }).catch(() => {});

  const location = [info.city, info.region, info.country].filter(Boolean).join(', ');
  const provider = info.connection?.org || info.connection?.isp || '';
  let text = `Novo acesso: ${ip}`;
  if (location) text += ` - ${location}`;
  if (provider) text += ` - ${provider}`;
  if (referrer) text += `\nReferrer: ${referrer}`;

  enviarTelegramSite(text).catch(() => {});

  res.json({ success: true });
});

app.get('/tutorials', async (req, res) => {
  try {
    const comandos = await CommandInfo.find().sort({ category: 1, name: 1 });
    const tutorials = await Tutorial.find({ tutorialId: { $ne: 'commands' } }).sort({ updatedAt: -1 });
    const categories = {};
    comandos.forEach(c => {
      const cat = c.category || 'Outros';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(c);
    });
    res.render('tutorials', {
      layout: false,
      comandos,
      tutorials,
      commandCategories: categories,
      siteUrl
    });
  } catch (err) {
    console.error('Erro ao carregar tutoriais:', err);
    res.render('tutorials', { layout: false, comandos: [], tutorials: [], commandCategories: {}, siteUrl });
  }
});

app.get('/comandos/:slug', async (req, res) => {
  try {
    const comando = await CommandInfo.findOne({ slug: req.params.slug });
    if (!comando) return res.status(404).render('semresultado', { layout: false });
    res.render('command_post', { layout: false, comando, siteUrl });
  } catch (err) {
    console.error('Erro ao carregar comando:', err);
    res.status(500).render('semresultado', { layout: false });
  }
});

app.get('/tutorials/:slug', async (req, res) => {
  try {
    const tutorial = await Tutorial.findOne({ slug: req.params.slug });
    if (!tutorial) return res.status(404).render('semresultado', { layout: false });
    res.render('tutorial_post', { layout: false, tutorial, siteUrl });
  } catch (err) {
    console.error('Erro ao carregar tutorial:', err);
    res.status(500).render('semresultado', { layout: false });
  }
});

app.get('/posts', (req, res) => {
  res.redirect('/blog');
});

app.get('/blog', async (req, res) => {
  const perPage = 5;
  const page = parseInt(req.query.page) || 1;
  try {
    const total = await Post.countDocuments();
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);
    res.render('blog_index', {
      layout: false,
      posts,
      page,
      totalPages: Math.ceil(total / perPage),
      siteUrl
    });
  } catch (err) {
    console.error('Erro ao carregar posts:', err);
    res.render('blog_index', { layout: false, posts: [], page: 1, totalPages: 1, siteUrl });
  }
});

app.get('/blog/:slug', async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).render('semresultado', { layout: false });
    res.render('blog_post', { layout: false, post, siteUrl });
  } catch (err) {
    console.error('Erro ao carregar post:', err);
    res.status(500).render('semresultado', { layout: false });
  }
});

app.get('/termos', (req, res) => {
  res.render('termos', {
    layout: false,
    siteUrl
  });
});

app.get('/privacidade', (req, res) => {
  res.render('privacidade', {
    layout: false,
    siteUrl
  });
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nDisallow:\n\nSitemap: ${siteUrl}/sitemap.xml`);
});


app.get('/sitemap.xml', async (req, res) => {
  try {
    await updateSitemap();
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
  } catch (err) {
    console.error('Erro ao gerar sitemap:', err);
    res.status(500).type('application/xml').send('<error/>');
  }
});



app.get('/painel', isAuthenticated, async (req, res) => {
  try {
    // Se admin, redireciona para o painel admin
    if (req.user.admin) {
      return res.redirect('/admin');
    }

    // Buscar dados mais recentes do usuário
    const userDoc = await usuario.findById(req.user._id);
    const { apikey, nome, limit, saldo, whatsapp, premium } = userDoc;

    // ✅ Contar quantos grupos o usuário tem no BotConfig
    const totalGrupos = await BotConfig.countDocuments({ user: req.user._id });

    // ✅ Checar Premium
    let statusPremium = 'Sem premium ativo';
    if (premium) {
      const currentDate = new Date();
      const expirationDate = new Date(premium);  // premium agora é uma data
      const timeDiff = expirationDate - currentDate; // Diferença entre as datas em milissegundos

      if (timeDiff > 0) {
        const daysRemaining = Math.floor(timeDiff / (1000 * 3600 * 24)); // Converte a diferença para dias
        statusPremium = `${daysRemaining} dias restantes`;
      } else {
        statusPremium = 'Premium expirado';
      }
    }

    // Limpa quotas esgotadas e calcula restantes de anúncios
    userDoc.adQuotas = userDoc.adQuotas.filter(q => q.limite > 0);
    const adsRestante = userDoc.adQuotas.reduce((sum, q) => sum + q.limite, 0);
    if (userDoc.isModified()) await userDoc.save();

    const banners = await Banner.find().sort({ createdAt: -1 });
    const comandos = await CommandInfo.find().sort({ category: 1, name: 1 });
    const cmdCategories = {};
    comandos.forEach(c => {
      const cat = c.category || 'Outros';
      if (!cmdCategories[cat]) cmdCategories[cat] = [];
      cmdCategories[cat].push(c);
    });
    const cmdGuideDoc = await Tutorial.findOne({ tutorialId: 'commands' });
    res.render('painel', {
      nome,
      apikey,
      limit,
      saldo,
      whatsapp,
      vencimento: statusPremium,
      totalGrupos,
      banners,
      adsRestante,
      comandos,
      commandCategories: cmdCategories,
      commandGuideMsg: cmdGuideDoc ? cmdGuideDoc.message : '',
      commandGuideFile: cmdGuideDoc ? cmdGuideDoc.fileName : '',
      commandGuideType: cmdGuideDoc ? cmdGuideDoc.type : '',
      layout: 'layouts/main'
    });

  } catch (err) {
    console.error(err);
    req.flash('error_msg', '❌ Houve um erro ao tentar carregar os dados do painel');
    res.redirect('/');
  }
});


app.get('/planos', isAuthenticated, async (req, res) => {
  const planos = await Plano.find({ active: true });
  res.render('planos', {
    planos,
    user: req.user,
    path: req.path,
    layout: 'layouts/main'
  });
});

app.get('/extras', isAuthenticated, async (req, res) => {
  const extras = await ExtraPlan.find({});
  res.render('extras', {
    extras,
    user: req.user,
    path: req.path,
    layout: 'layouts/main'
  });
});

app.get('/links', isAuthenticated, async (req, res) => {
  const links = await ShortLink.find({ user: req.user._id });
  res.render('links', { links, siteUrl, path: req.path, layout: 'layouts/main' });
});

app.post('/links', isAuthenticated, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.redirect('/links');
  const user = await usuario.findById(req.user._id);
  if (user.shortLinkLimit <= 0) {
    req.flash('error_msg', 'Limite de links atingido');
    return res.redirect('/links');
  }
  const code = await generateShortCode();
  await ShortLink.create({ code, originalUrl: url, user: req.user._id });
  user.shortLinkLimit -= 1;
  await user.save();
  req.flash('success_msg', `Link criado: ${siteUrl}/l/${code}`);
  res.redirect('/links');
});

app.post('/links/:code/editar', isAuthenticated, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.redirect('/links');
  await ShortLink.updateOne({ code: req.params.code, user: req.user._id }, { originalUrl: url });
  req.flash('success_msg', 'Link atualizado');
  res.redirect('/links');
});

app.post('/links/:code/ativar', isAuthenticated, async (req, res) => {
  const { ativo } = req.body;
  const flag = ativo === 'true' || ativo === true;
  await ShortLink.updateOne({ code: req.params.code, user: req.user._id }, { active: flag });
  res.redirect('/links');
});

app.get('/links/:code', isAuthenticated, async (req, res) => {
  const page = parseInt(req.query.p, 10) || 1;
  const perPage = 20;
  const link = await ShortLink.findOne({ code: req.params.code, user: req.user._id });
  if (!link) return res.redirect('/links');
  const logs = Array.isArray(link.logs) ? [...link.logs].reverse() : [];
  const paginated = logs.slice((page - 1) * perPage, page * perPage);
  const hasMore = page * perPage < logs.length;
  res.render('linkDetails', {
    link,
    logs: paginated,
    page,
    hasMore,
    siteUrl,
    path: req.path,
    layout: 'layouts/main'
  });
});

app.get('/meus-anuncios', isAuthenticated, async (req, res) => {
  try {
    const user = await usuario.findById(req.user._id);
    user.adQuotas = user.adQuotas.filter(q => q.limite > 0);
    await user.save();

    const now = new Date();
    // remove anúncios expirados antes de listar
    await PartnerAd.deleteMany({ user: req.user._id, expiresAt: { $lte: now } });

    const ads = await PartnerAd.find({ user: req.user._id });
    for (const ad of ads) {
      if (ad.link && !ad.shortCode) {
        const code = await generateShortCode();
        ad.shortCode = code;
        await ad.save();
        await ShortLink.create({ code, originalUrl: ad.link, user: req.user._id, ad: ad._id });
      }
    }
    const remainingQuotas = Array.isArray(user.adQuotas) ? user.adQuotas : [];
    const restante = remainingQuotas.reduce((sum, q) => sum + q.limite, 0);
    const quotas = remainingQuotas.map((q, idx) => ({ index: idx, dias: q.dias, limite: q.limite }));
    res.render('myAds', { ads, restante, quotas, user: req.user, path: req.path, layout: 'layouts/main' });
  } catch (err) {
    console.error('Erro ao carregar anúncios do usuário:', err);
    req.flash('error_msg', 'Erro ao carregar anúncios.');
    res.redirect('/painel');
  }
});

app.post('/meus-anuncios', isAuthenticated, upload.single('arquivo'), async (req, res) => {
  const file = req.file;
  const { text, link, quotaIndex } = req.body;
  if (!file) {
    req.flash('error_msg', 'Nenhum arquivo enviado.');
    return res.redirect('/meus-anuncios');
  }
  try {
    const user = await usuario.findById(req.user._id);
    user.adQuotas = user.adQuotas.filter(q => q.limite > 0);
    const quota = user.adQuotas.reduce((sum, q) => sum + q.limite, 0);
    if (quota <= 0) {
      await user.save();
      req.flash('error_msg', 'Você não possui anúncios extras disponíveis.');
      return res.redirect('/extras');
    }

    let outName, type;
    if (file.mimetype.startsWith('video/')) {
      const tempIn = path.join(tmpdir(), file.originalname);
      outName = `ad_${Date.now()}.webm`;
      const dest = path.join('public', 'img', outName);
      await fsPromises.writeFile(tempIn, file.buffer);
      await new Promise((resolve, reject) => {
        ffmpeg(tempIn)
          .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
          .format('webm')
          .save(dest)
          .on('end', resolve)
          .on('error', reject);
      });
      await fsPromises.unlink(tempIn).catch(() => {});
      type = 'video';
    } else if (file.mimetype.startsWith('image/')) {
      const ext = path.extname(file.originalname).toLowerCase();
      outName = `ad_${Date.now()}${ext}`;
      await fsPromises.writeFile(path.join('public', 'img', outName), file.buffer);
      type = 'image';
    } else {
      req.flash('error_msg', 'Formato não suportado');
      return res.redirect('/meus-anuncios');
    }

    const idx = parseInt(quotaIndex);
    const quotaItem = Number.isInteger(idx) ? user.adQuotas[idx] : undefined;
    let expiresAt = undefined;
    if (quotaItem && quotaItem.limite > 0) {
      expiresAt = new Date(Date.now() + quotaItem.dias * 24 * 60 * 60 * 1000);
      quotaItem.limite -= 1;
      if (quotaItem.limite === 0) {
        user.adQuotas.splice(idx, 1);
      }
    } else {
      req.flash('error_msg', 'Extra selecionado inválido');
      return res.redirect('/meus-anuncios');
    }

    const shortCode = await generateShortCode();
    const ad = await PartnerAd.create({ fileName: outName, type, text, link, shortCode, user: req.user._id, expiresAt });
    await ShortLink.create({ code: shortCode, originalUrl: link, user: req.user._id, ad: ad._id });
    await user.save();
    req.flash('success_msg', 'Anúncio criado!');
    res.redirect('/meus-anuncios');
  } catch (err) {
    console.error('Erro ao salvar anúncio:', err);
    req.flash('error_msg', 'Erro ao salvar anúncio.');
    res.redirect('/meus-anuncios');
  }
});

app.post('/meus-anuncios/editar/:id', isAuthenticated, upload.single('arquivo'), async (req, res) => {
  const { id } = req.params;
  const { text, link } = req.body;
  const update = { text, link };
  try {
    const ad = await PartnerAd.findOne({ _id: id, user: req.user._id });
    if (!ad) {
      req.flash('error_msg', 'Anúncio não encontrado.');
      return res.redirect('/meus-anuncios');
    }
    if (req.file) {
      if (req.file.mimetype.startsWith('video/')) {
        const tempIn = path.join(tmpdir(), req.file.originalname);
        const outName = `ad_${Date.now()}.webm`;
        const dest = path.join('public', 'img', outName);
        await fsPromises.writeFile(tempIn, req.file.buffer);
        await new Promise((resolve, reject) => {
          ffmpeg(tempIn)
            .outputOptions(['-c:v libvpx', '-crf 10', '-b:v 1M'])
            .format('webm')
            .save(dest)
            .on('end', resolve)
            .on('error', reject);
        });
        await fsPromises.unlink(tempIn).catch(() => {});
        update.fileName = outName;
        update.type = 'video';
      } else if (req.file.mimetype.startsWith('image/')) {
        const ext = path.extname(req.file.originalname).toLowerCase();
        const outName = `ad_${Date.now()}${ext}`;
        await fsPromises.writeFile(path.join('public', 'img', outName), req.file.buffer);
        update.fileName = outName;
        update.type = 'image';
      } else {
        req.flash('error_msg', 'Formato não suportado');
        return res.redirect('/meus-anuncios');
      }
    }

    if (link && link !== ad.link) {
      if (ad.shortCode) {
        await ShortLink.findOneAndUpdate({ code: ad.shortCode }, { originalUrl: link });
      } else {
        const code = await generateShortCode();
        await ShortLink.create({ code, originalUrl: link, user: req.user._id, ad: ad._id });
        update.shortCode = code;
      }
    }

    await PartnerAd.updateOne({ _id: id, user: req.user._id }, update);
    req.flash('success_msg', 'Anúncio atualizado');
    res.redirect('/meus-anuncios');
  } catch (err) {
    console.error('Erro ao editar anúncio:', err);
    req.flash('error_msg', 'Erro ao editar anúncio.');
    res.redirect('/meus-anuncios');
  }
});

app.post('/meus-anuncios/:id/ativar', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  try {
    await PartnerAd.findOneAndUpdate({ _id: id, user: req.user._id }, { active: ativo === 'true' });
    req.flash('success_msg', 'Anúncio atualizado');
    res.redirect('/meus-anuncios');
  } catch (err) {
    console.error('Erro ao atualizar anúncio:', err);
    req.flash('error_msg', 'Erro ao atualizar anúncio');
    res.redirect('/meus-anuncios');
  }
});

app.post('/meus-anuncios/:id/renovar', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { quotaIndex } = req.body;
  try {
    const user = await usuario.findById(req.user._id);
    const idx = parseInt(quotaIndex);
    const quota = Number.isInteger(idx) ? user.adQuotas[idx] : undefined;
    if (!quota || quota.limite <= 0) {
      req.flash('error_msg', 'Extra selecionado inválido');
      return res.redirect('/meus-anuncios');
    }
    const ad = await PartnerAd.findOne({ _id: id, user: req.user._id });
    if (!ad) {
      req.flash('error_msg', 'Anúncio não encontrado');
      return res.redirect('/meus-anuncios');
    }
    ad.expiresAt = new Date(Date.now() + quota.dias * 24 * 60 * 60 * 1000);
    quota.limite -= 1;
    if (quota.limite === 0) {
      user.adQuotas.splice(idx, 1);
    }
    await ad.save();
    await user.save();
    req.flash('success_msg', 'Anúncio renovado');
    res.redirect('/meus-anuncios');
  } catch (err) {
    console.error('Erro ao renovar anúncio:', err);
    req.flash('error_msg', 'Erro ao renovar anúncio');
    res.redirect('/meus-anuncios');
  }
});

app.post('/ads/display/:id', async (req, res) => {
  try {
    await PartnerAd.findByIdAndUpdate(req.params.id, { $inc: { displayCount: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/ads/click/:id', async (req, res) => {
  try {
    await PartnerAd.findByIdAndUpdate(req.params.id, { $inc: { clickCount: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/l/:code', async (req, res) => {
  try {
    const short = await ShortLink.findOne({ code: req.params.code });
    if (!short) {
      return res.status(404).send('Not found');
    }
    short.clickCount += 1;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const country = req.headers['cf-ipcountry'] || '';
    const ua = req.get('user-agent') || '';
    const app = (/WhatsApp/i.test(ua) ? 'WhatsApp' :
                /Telegram/i.test(ua) ? 'Telegram' :
                /Instagram/i.test(ua) ? 'Instagram' :
                /Facebook/i.test(ua) ? 'Facebook' : 'Web');
    short.logs.push({ ip, country, app, userAgent: ua });
    await short.save();
    if (short.ad) {
      await PartnerAd.findByIdAndUpdate(short.ad, { $inc: { clickCount: 1 } });
    }
    res.redirect(short.originalUrl);
  } catch (err) {
    res.status(500).send('Error');
  }
});




app.get('/grupos', isAuthenticated, garantirPlanoAtivoMiddleware, async (req, res) => {
  try {
    const allApis = await BotApi.find({
      status: true,
      $or: [
        { user: null },
        { user: req.user._id }
      ]
    });

    const botApis = [];
    for (const api of allApis) {
      const usados = await BotConfig.countDocuments({ botApi: api._id });
      if (api.gruposlimite === 0 || usados < api.gruposlimite) {
        botApis.push(api);
      }
    }

    const user = await usuario.findById(req.user._id).populate('bots');
    const planos = await Plano.find({});
    const cmdGuideDoc = await Tutorial.findOne({ tutorialId: 'commands' });
    const showCmdGuide = req.session.showCmdGuide;
    delete req.session.showCmdGuide;

    const limiteGrupos = user.planoContratado?.limiteGrupos || 0;
    const vencimentoPlano = user.planoVencimento;
    const usado = user.bots.length;
    const restante = Math.max(0, limiteGrupos - usado);

    res.render('grupos', {
      bots: user.bots,
      botApis,
      planos,
      nome: req.user.nome,
      saldo: req.user.saldo,
      limiteGrupos,
      vencimentoPlano,
      usado,
      restante,
      showCmdGuide,
      commandGuideMsg: cmdGuideDoc ? cmdGuideDoc.message : '',
      commandGuideFile: cmdGuideDoc ? cmdGuideDoc.fileName : '',
      commandGuideType: cmdGuideDoc ? cmdGuideDoc.type : '',
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});



app.get('/grupos/ativacoes', isAuthenticated, garantirGrupoCadastradoMiddleware, sincronizarStatusAdminMiddleware, async (req, res) => {
  try {
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');
    const user = await usuario.findById(req.user._id); // <- usa seu alias 'usuario'

    const primeiroGrupo = bots.length > 0 ? bots[0].groupId : null;
    const vencimento = user?.planoVencimento || null;
    let allowedCommands = user?.planoContratado?.allowedCommands || {};
    if (user?.planoContratado?.isFree) {
      const freeDoc = await Plano.findOne({ isFree: true });
      if (freeDoc) allowedCommands = freeDoc.allowedCommands || {};
    }

    const botsComVencimento = bots.map(bot => ({
      ...bot.toObject(),
      vencimento
    }));

    res.render('ativacoes', {
      bots: botsComVencimento,
      nome: user.nome,
      saldo: user.saldo,
      primeiroGrupo,
      allowedCommands,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('Erro ao carregar grupos:', err);
    res.redirect('/');
  }
});

app.get('/grupos/horario', isAuthenticated, garantirGrupoCadastradoMiddleware, sincronizarStatusAdminMiddleware, async (req, res) => {
  try {
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');
    let grupoSelecionado = null;
    if (req.query.grupo) {
      grupoSelecionado = bots.find(b => b.groupId === req.query.grupo) || null;
    }
    if (!grupoSelecionado && bots.length) grupoSelecionado = bots[0];

    res.render('horario', {
      bots,
      grupoSelecionado,
      nome: req.user.nome,
      saldo: req.user.saldo,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('Erro ao carregar horario:', err);
    req.flash('error_msg', 'Erro ao carregar os dados dos grupos.');
    res.redirect('/painel');
  }
});


// View para exibir o formulário
app.get('/grupos/mensagem', isAuthenticated, garantirGrupoCadastradoMiddleware, garantirGrupoCadastradoMiddleware, async (req, res) => {
  try {
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');
    res.render('enviarmensagem', {
      bots,
      nome: req.user.nome,
      saldo: req.user.saldo,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('Erro ao carregar bots:', err);
    req.flash('error_msg', 'Erro ao carregar seus grupos.');
    res.redirect('/painel');
  }
});

app.get('/grupos/tabela', isAuthenticated, garantirGrupoCadastradoMiddleware, garantirGrupoCadastradoMiddleware, async (req, res) => {
  try {
    // 1. busca todos os bots do usuário
    const botsRaw = await BotConfig.find({ user: req.user._id }).populate('botApi');

    // 2. busca o usuário para extrair o planoVencimento
    const user = await usuario.findById(req.user._id);
    const planoVenc = user?.planoVencimento || null;

    // 3. “anexa” o campo vencimento a cada bot
    const bots = botsRaw.map(b => {
      const obj = b.toObject();
      obj.vencimento = planoVenc;
      return obj;
    });

    // 4. renderiza passando 'bots' já com b.vencimento
    res.render('tabela', {
      bots,
      nome: user.nome,
      saldo: user.saldo,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('Erro ao carregar bots para tabela:', err);
    req.flash('error_msg', 'Erro ao carregar seus grupos.');
    res.redirect('/painel');
  }
});


// index.js (ou onde você coloca as rotas de páginas)
app.get('/grupos/ads', isAuthenticated, garantirGrupoCadastradoMiddleware, garantirGrupoCadastradoMiddleware, async (req, res) => {
  try {
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');

    // se veio ?grupo=..., usa-o; caso contrário pega o 1º grupo do usuário
    let grupoSelecionado = null;
    if (req.query.grupo) {
      grupoSelecionado = bots.find(b => b.groupId === req.query.grupo) || null;
    }
    if (!grupoSelecionado && bots.length) grupoSelecionado = bots[0];

    res.render('ads', {
      bots,
      grupoSelecionado,          // objeto BotConfig ou null
      nome: req.user.nome,
      saldo: req.user.saldo,
      layout: 'layouts/main'              // nome do arquivo --> views/ads.ejs
    });
  } catch (err) {
    console.error('Erro ao carregar anúncios:', err);
    req.flash('error_msg', 'Erro ao carregar os dados dos grupos.');
    res.redirect('/painel');
  }
});

app.get('/grupos/autorespostas', isAuthenticated, garantirGrupoCadastradoMiddleware, garantirGrupoCadastradoMiddleware, async (req, res) => {
  try {
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');
    let grupoSelecionado = null;
    if (req.query.grupo) {
      grupoSelecionado = bots.find(b => b.groupId === req.query.grupo) || null;
    }
    if (!grupoSelecionado && bots.length) grupoSelecionado = bots[0];

    res.render('autorespostas', {
      bots,
      grupoSelecionado,
      nome: req.user.nome,
      saldo: req.user.saldo,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('Erro ao carregar autorespostas:', err);
    req.flash('error_msg', 'Erro ao carregar os dados dos grupos.');
    res.redirect('/painel');
  }
});



// GET /conectarwhatsapp
app.get('/conectarwhatsapp', isAuthenticated, async (req, res) => {
  try {
    if (!req.user.planoContratado) {
      return res.redirect('/planos');
    }

    const instancias = await BotApi.find({ user: req.user._id }).lean();
    const servidores = await Server.find({ status: true }).lean();
    const limite = req.user.planoContratado.limiteInstancias; // 0 = sem instância dedicada
    const ilimitado = limite < 0; // valor negativo indicaria ilimitado
    const podeCriar = limite > 0 && instancias.length < limite;
    const mostrarTabela = instancias.length > 0;

    res.render('conectarwhatsapp', {
      layout: 'layouts/main',
      instancias,
      limite,
      servidores,
      ilimitado,
      siteUrl,
      usadas: instancias.length,
      podeCriar,
      mostrarTabela,
      masterKey: MASTER_APIKEY
    });
  } catch (err) {
    console.error('Erro ao carregar /conectarwhatsapp', err);
    req.flash('error_msg', 'Erro ao carregar instâncias');
    res.redirect('/');
  }
});

// POST /conectarwhatsapp/criar
app.post('/conectarwhatsapp/criar', isAuthenticated, async (req, res) => {
  const numero = (req.body.numero || '').replace(/\D/g, '');
  const serverId = req.body.serverId;
  if (!numero || !serverId) {
    req.flash('error_msg', 'Dados inválidos.');
    return res.redirect('/conectarwhatsapp');
  }

  let nova = null;
  try {
    await verificarLimiteInstancias(req.user);
    const server = await verificarCapacidadeServidor(serverId);

    nova = new BotApi({
      nome: numero,
      baseUrl: server.baseUrl,
      globalapikey: server.globalapikey,
      apikey: server.globalapikey,
      instance: numero,
      user: req.user._id,
      server: server._id
    });
    await nova.save();
    await new Promise(r => setTimeout(r, 300));

    await axios.post(`${server.baseUrl}/instance/pair/${numero}`, {}, {
      headers: { apikey: server.globalapikey }
    });

    await axios.post(`${server.baseUrl}/instance/pair/${numero}`, {}, {
      headers: { apikey: server.globalapikey }
    });

    req.flash('success_msg', 'Instância criada com sucesso!');
  } catch (err) {
    if (nova?._id) {
      try { await BotApi.deleteOne({ _id: nova._id }); } catch { }
    }
    console.error('Erro ao criar instância', err?.response?.data || err.message);
    req.flash('error_msg', err.message || 'Erro ao criar instância');
  }

  res.redirect('/conectarwhatsapp');
});

app.post('/conectarwhatsapp/acao/logout/:instance', isAuthenticated, async (req, res) => {
  try {
    const apiCfg = await BotApi.findOne({ instance: req.params.instance });
    if (!apiCfg) throw new Error('Instância não encontrada.');
    await axios.post(`${apiCfg.baseUrl}/instance/logout/${req.params.instance}`, {}, {
      headers: { apikey: apiCfg.globalapikey }
    });
    req.flash('success_msg', 'Logout realizado com sucesso.');
  } catch (err) {
    req.flash('error_msg', 'Erro ao deslogar instância.');
  }
  res.redirect('/conectarwhatsapp');
});


// POST /conectarwhatsapp/acao/restart/:instance
app.post('/conectarwhatsapp/acao/restart/:instance', isAuthenticated, async (req, res) => {
  try {
    const apiCfg = await BotApi.findOne({ instance: req.params.instance });
    if (!apiCfg) throw new Error('Instância não encontrada.');
    await axios.post(`${apiCfg.baseUrl}/instance/restart/${req.params.instance}`, {}, {
      headers: { apikey: apiCfg.globalapikey }
    });
    req.flash('success_msg', 'Instância reiniciada.');
  } catch (err) {
    req.flash('error_msg', 'Erro ao reiniciar instância.');
  }
  res.redirect('/conectarwhatsapp');
});


app.post('/conectarwhatsapp/acao/delete/:instance', isAuthenticated, async (req, res) => {
  try {
    console.log('📥 Iniciando exclusão da instância:', req.params.instance);

    const instancia = await BotApi.findOne({ instance: req.params.instance, user: req.user._id });
    if (!instancia) {
      console.log('❌ Instância não encontrada para este usuário.');
      req.flash('error_msg', 'Instância não encontrada.');
      return res.redirect('/conectarwhatsapp');
    }
    console.log('✅ Instância localizada:', instancia._id);

    // 1) Remove grupos, memórias e pastas locais no painel
    const grupos = await BotConfig.find({ botApi: instancia._id });
    console.log(`📦 Grupos vinculados encontrados: ${grupos.length}`);
    for (const grupo of grupos) {
      console.log(`➡️ Apagando grupo ${grupo.nomeGrupo || grupo.groupId} (${grupo._id})`);
      await Sorteio.deleteMany({ bot: grupo._id });
      await IAGroupMemory.deleteMany({ groupId: grupo.groupId });
      await usuario.updateOne({ _id: grupo.user }, { $pull: { bots: grupo._id } });
      const dir = path.join(__dirname, 'arquivos', grupo.groupId);
      if (fs.existsSync(dir)) {
        await fsPromises.rm(dir, { recursive: true, force: true });
        console.log(`🗑 Pasta de mídia apagada: ${dir}`);
      }
      await BotConfig.deleteOne({ _id: grupo._id });
      console.log(`✔️ Grupo apagado: ${grupo._id}`);
    }
    // remove quaisquer BotConfig restantes por segurança
    const fallbackDel = await BotConfig.deleteMany({ botApi: instancia._id });
    if (fallbackDel.deletedCount) {
      console.log(`⚠️ BotConfigs adicionais removidos: ${fallbackDel.deletedCount}`);
    }

    // 2) Apaga sessão WhatsApp no servidor remoto ANTES de excluir do banco
    try {
      await axios.post(
        `${instancia.baseUrl.replace(/\/+$/, '')}/instance/delete/${instancia.instance}`,
        {},
        { headers: { apikey: instancia.globalapikey } }
      );
      console.log(`🧹 Sessão WhatsApp apagada via API para: ${instancia.instance}`);
    } catch (err) {
      console.warn(`⚠️ Falha ao apagar sessão remota:`, err.message);
    }

    // 3) Agora sim, remove o registro da instância no painel
    const instDel = await BotApi.deleteOne({ _id: instancia._id });
    console.log(`🚮 Instância removida do banco: ${instDel.deletedCount}`);

    req.flash('success_msg', 'Instância e dados vinculados removidos com sucesso.');
  } catch (err) {
    console.error('❌ Erro geral ao excluir instância:', err);
    req.flash('error_msg', 'Erro ao remover instância.');
  }

  res.redirect('/conectarwhatsapp');
});


// POST /conectarwhatsapp/pair/:instance - gera código de pareamento ou QR
app.post('/conectarwhatsapp/pair/:instance', isAuthenticated, async (req, res) => {
  try {
    const api = await BotApi.findOne({ instance: req.params.instance, user: req.user._id });
    if (!api) return res.json({ success: false, message: 'Instância não encontrada' });

    const base = (api.baseUrl || '').replace(/\/+$/, '');
    try {
      const { data } = await axios.post(`${base}/instance/pair/${api.instance}`, {}, {
        headers: { apikey: api.globalapikey }
      });
      return res.json({ success: true, data });
    } catch (err) {
      try {
        const qrRes = await axios.get(`${base}/instance/qrcode/${api.instance}`, {
          headers: { apikey: api.globalapikey },
          responseType: 'arraybuffer'
        });
        const qr = `data:image/png;base64,${Buffer.from(qrRes.data, 'binary').toString('base64')}`;
        return res.json({ success: true, data: { modo: 'qr_code', qr } });
      } catch (e2) {
        return res.json({ success: false, message: e2.response?.data || e2.message });
      }
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});





app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {  // Usando ambos os middlewares
  try {
    // Desestruturação dos dados do usuário
    let { apikey, nome, limit, dinheiro, whatsapp, premium } = req.user;

    // Buscar o número total de usuários registrados
    const registrados = await Totalregistrados();

    // Contagens extras para o painel
    const servidoresQtd = await Server.countDocuments({});
    const apisQtd = await BotApi.countDocuments({});
    const gruposQtd = await BotConfig.countDocuments({});
    const planosVencidosQtd = await usuario.countDocuments({
      planoVencimento: { $lte: new Date() }
    });

    // Calcular o vencimento do premium (converte o timestamp para uma data legível)
    let vencimentoPremium = premium ? new Date(parseInt(premium)).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }) + ', ' + new Date(parseInt(premium)).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) : 'Sem premium';

    // Garantir que a página não será armazenada em cache
    res.set('Cache-Control', 'no-store');

    // Renderiza a página de admin
    const banner = await Banner.findOne().sort({ createdAt: -1 });
    res.render('admin/index', {
      nome: nome,
      apikey: apikey,
      limit: limit,
      dinheiro: dinheiro,
      whatsapp: whatsapp,         // Passando o número de WhatsApp
      vencimento: vencimentoPremium, // Passando o vencimento do premium
      registrados: registrados,   // Número total de registros
      servidoresQtd,
      apisQtd,
      gruposQtd,
      planosVencidosQtd,
      banner,
      layout: 'admin/layout/main'
    });

  } catch (err) {
    console.log(err);
    req.flash('error_msg', 'Houve um erro ao tentar carregar os dados do usuário');
    res.redirect('/');
  }
});


app.get('/saldo', isAuthenticated, async (req, res) => {
  try {
    const metodos = await ConfigPagamento.find({ status: true });

    const qrCode = req.session.qrCode || null;
    const pixCode = req.session.pixCode || null;
    const pagamentoId = req.session.pagamentoId || null;

    // Limpa sessão após uso
    req.session.qrCode = null;
    req.session.pixCode = null;
    req.session.pagamentoId = null; // <-- ADICIONADO

    res.render('saldo', {
      nome: req.user.nome,
      whatsapp: req.user.whatsapp,
      saldo: req.user.saldo,
      metodos,
      qrCode,
      pixCode,
      pagamentoId, // <-- ADICIONADO NA VIEW
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('[ERRO] Rota /saldo:', err);
    req.flash('error_msg', 'Erro ao carregar seus depósitos');
    res.redirect('/painel');
  }
});

app.get('/grupos/sorteio', isAuthenticated, garantirGrupoCadastradoMiddleware, garantirGrupoCadastradoMiddleware, async (req, res) => {
  try {
    // 1. busca todos os bots deste usuário
    const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');

    // 2. monta o objeto sorteiosPorGrupo
    const sorteiosPorGrupo = {};
    for (const bot of bots) {
      const lista = await Sorteio.find({ bot: bot._id, concluido: false });
      sorteiosPorGrupo[bot._id.toString()] = lista;
    }

    // 3. encontra o bot (BotConfig) selecionado pela query
    const grupoSelecionado = req.query.grupo
      ? bots.find(b => b.groupId === req.query.grupo)
      : bots[0] || null;

    // 4. busca o usuário e pega planoVencimento
    const user = await usuario.findById(req.user._id);
    const planoVenc = user?.planoVencimento || null;

    // 5. “anexa” o vencimento ao grupoSelecionado para a view
    if (grupoSelecionado) {
      // cria uma cópia leve para não alterar o original do Mongoose
      const gsObj = grupoSelecionado.toObject();
      gsObj.vencimento = planoVenc;
      // substitui a referência por essa cópia com o campo vencimento adicionado
      Object.assign(grupoSelecionado, gsObj);
    }

    // 6. renderiza a view, passando bots, grupoSelecionado (já com vencimento),
    //    sorteiosPorGrupo, nome e saldo do usuário
    res.render('sorteio', {
      bots,
      grupoSelecionado,
      sorteiosPorGrupo,
      nome: user.nome,
      saldo: user.saldo,
      path: req.path,
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error('❌ Erro ao carregar sorteios:', err);
    req.flash('error_msg', 'Erro ao carregar sorteios.');
    res.redirect('/painel');
  }
});

app.all('/mercadopago/pix', async (req, res) => {
  try {
    const method = req.method;
    const data = method === 'GET' ? req.query : req.body;

    console.log(`\n[WEBHOOK ${method}] Notificação recebida:`);
    console.log(JSON.stringify(data, null, 2));

    let pagamentoId = null;
    if (data?.data?.id) {
      pagamentoId = data.data.id;
    } else if (typeof data?.resource === 'string' && /\d+$/.test(data.resource)) {
      pagamentoId = data.resource.match(/(\d+)$/)[1];
    }

    if (!pagamentoId) {
      console.warn('[WEBHOOK] Notificação sem ID de pagamento.');
      return res.status(400).send('ID ausente');
    }

    const metodo = await ConfigPagamento.findOne({ gateway: 'mercadopago', tipo: 'pix', status: true });
    if (!metodo) {
      console.warn('[WEBHOOK] Método "mercadopago" não encontrado ou inativo.');
      return res.status(404).send('Método inválido');
    }

    const resultado = await verificarPagamentoPix(pagamentoId, metodo.nome);

    if (resultado.status === 'erro') {
      console.error('[WEBHOOK] Erro na verificação:', resultado.message);
    } else {
      console.log(`[WEBHOOK] Pagamento ${pagamentoId} verificado com status:`, resultado.status);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[WEBHOOK] Erro interno:', err);
    return res.status(500).send('Erro interno');
  }
});

app.all('/mercadopago/card', async (req, res) => {
  try {
    const method = req.method;
    const data = method === 'GET' ? req.query : req.body;

    console.log(`\n[WEBHOOK ${method}] Notificação cartão:`);
    console.log(JSON.stringify(data, null, 2));

    let pagamentoId = null;
    if (data?.data?.id) {
      pagamentoId = data.data.id;
    } else if (typeof data?.resource === 'string' && /\d+$/.test(data.resource)) {
      pagamentoId = data.resource.match(/(\d+)$/)[1];
    }

    if (!pagamentoId) {
      console.warn('[WEBHOOK] Notificação sem ID de pagamento.');
      return res.status(400).send('ID ausente');
    }

    const metodo = await ConfigPagamento.findOne({ gateway: 'mercadopago', tipo: 'cartao', status: true });
    if (!metodo) {
      console.warn('[WEBHOOK] Método "mercadopago_cartao" não encontrado ou inativo.');
      return res.status(404).send('Método inválido');
    }

    const resultado = await verificarPagamentoPix(pagamentoId, metodo.nome);

    if (resultado.status === 'erro') {
      console.error('[WEBHOOK] Erro na verificação:', resultado.message);
    } else {
      console.log(`[WEBHOOK] Pagamento ${pagamentoId} verificado com status:`, resultado.status);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[WEBHOOK] Erro interno:', err);
    return res.status(500).send('Erro interno');
  }
});

app.all('/asaas/pix', async (req, res) => {
  try {
    const data = req.body || req.query;
    const pagamentoId = data?.payment?.id || data?.id;
    if (!pagamentoId) {
      console.warn('[WEBHOOK ASAAS] Notificação sem ID de pagamento.');
      return res.status(400).send('ID ausente');
    }

    const metodo = await ConfigPagamento.findOne({ gateway: 'asaas', status: true });
    if (!metodo) {
      console.warn('[WEBHOOK ASAAS] Método "asaas" não encontrado ou inativo.');
      return res.status(404).send('Método inválido');
    }

    const resultado = await verificarPagamentoPix(pagamentoId, metodo.nome);

    if (resultado.status === 'erro') {
      console.error('[WEBHOOK ASAAS] Erro na verificação:', resultado.message);
    } else {
      console.log(`[WEBHOOK ASAAS] Pagamento ${pagamentoId} verificado com status:`, resultado.status);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[WEBHOOK ASAAS] Erro interno:', err);
    return res.status(500).send('Erro interno');
  }
});

app.get('/api-docs', isAuthenticated, async (req, res) => {
  try {
    const { apikey, nome, saldo, limit, whatsapp, vencimento } = req.user;
    res.render('apidocs', {
      siteUrl,
      apikey,
      nome,
      saldo,
      limit,
      whatsapp,
      vencimento,
      layout: 'layouts/main'
    });

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Erro ao carregar a documentação da API');
    res.redirect('/painel');
  }
});




cron.schedule('*/1 * * * *', async () => {
  try {
    const bots = await BotConfig.find({
      status: true,
      'adsMensagem.0': { $exists: true }
    }).populate('botApi');

    for (const bot of bots) {
      const api = bot.botApi;
      const groupId = bot.groupId;

      if (!api || !api.status || !api.baseUrl || !api.apikey || !api.instance) {
        console.warn(`⚠️ BotApi inválida para grupo ${groupId}. Pulando...`);
        continue;
      }

      const serverUrl = api.baseUrl;
      const instance = api.instance;
      const apikey = api.apikey;

      for (let anuncio of bot.adsMensagem) {
        try {
          const {
            caption,
            filePath,
            mimetype,
            fileName,
            frequencia,
            hasMedia,
            lastSent,
            mentionAll // Incluindo o campo mentionAll
          } = anuncio;

          const unidade = frequencia.slice(-1);
          const numero = parseInt(frequencia.slice(0, -1));
          const agora = new Date();

          if (unidade === 'm' && numero < 5) {
            continue;
          }

          const deltaMs = {
            m: numero * 60 * 1000,
            h: numero * 60 * 60 * 1000,
            d: numero * 24 * 60 * 60 * 1000
          }[unidade];

          const podeEnviar = !lastSent || (agora - new Date(lastSent)) >= deltaMs;

          if (!podeEnviar) {
            continue;
          }

          // Se tiver mídia
          if (hasMedia && filePath && mimetype) {
            try {
              const buffer = await fsPromises.readFile(filePath);  // Usando fsPromises para ler o arquivo
              const base64 = buffer.toString('base64');

              const mediaType = mimetype.startsWith('image/') ? 'image'
                : mimetype.startsWith('video/') ? 'video'
                  : 'document';

              // Corrigido para usar o sendMedia sem callback adicional
              await sendMedia(
                serverUrl,
                apikey,
                instance,
                groupId,
                mediaType,
                mimetype,
                caption,
                `data:${mimetype};base64,${base64}`,
                fileName,
                null, // Usando null como no seu código
                mentionAll  // Passando mentionAll para a função de envio de mídia
              );

            } catch (err) {
              console.error(`❌ Erro ao ler/enviar mídia para ${groupId}:`, err.message);
              continue;
            }

          } else if (caption) {
            try {
              // Corrigido para usar o sendText corretamente
              await sendText(
                serverUrl,
                apikey,
                instance,
                groupId,
                caption,
                null,
                mentionAll  // Passando mentionAll para a função de envio de texto
              );
            } catch (err) {
              console.error(`❌ Erro ao enviar texto para ${groupId}:`, err.message);
              continue;
            }
          } else {
            console.log(`⚠️ Anúncio sem mídia nem legenda em ${groupId}, ignorado.`);
            continue;
          }

          // Atualizar lastSent
          anuncio.lastSent = new Date();
        } catch (err) {
          console.error(`❌ Erro ao processar anúncio de ${bot.groupId}:`, err.message);
        }
      }

      try {
        await bot.save();  // Salvando o estado do bot
      } catch (saveErr) {
        console.error(`❌ Erro ao salvar bot ${groupId}:`, saveErr.message);
      }
    }
  } catch (err) {
  console.error('🔥 Erro geral na cron de anúncios:', err.message);
  }
}, {
  scheduled: true,
  timezone: 'America/Sao_Paulo'
});

// Cron de anúncios automáticos do Plano Free
cron.schedule('*/1 * * * *', async () => {
  try {
    const planoFree = await Plano.findOne({ isFree: true, active: true });
    if (!planoFree) return;
    const horaAtual = new Date().toTimeString().slice(0,5);
    if (!planoFree.adTimes.includes(horaAtual)) return;
    const bots = await BotConfig.find({}).populate('botApi').populate('user');
    for (const bot of bots) {
      const user = bot.user;
      if (!user.planoContratado?.isFree) continue;

      if (!bot.freeAds) bot.freeAds = { count: 0, lastDate: new Date() };
      const lastDate = bot.freeAds.lastDate ? new Date(bot.freeAds.lastDate) : new Date(0);
      const today = new Date();
      if (lastDate.toDateString() !== today.toDateString()) {
        bot.freeAds.count = 0;
        bot.freeAds.lastDate = today;
      }
      if (bot.freeAds.count >= planoFree.dailyAdLimit) continue;

      const api = bot.botApi;
      if (!api || !api.status || !api.baseUrl || !api.apikey || !api.instance) continue;

      const ad = await PartnerAd.findOne({ user: user._id, active: true }).sort({ createdAt: -1 });
      if (!ad) continue;

      const pathFile = path.join('public', 'img', ad.fileName);
      try {
        const buffer = await fsPromises.readFile(pathFile);
        const base64 = buffer.toString('base64');
        const mediaType = ad.type === 'image' ? 'image' : 'video';
        await sendMedia(api.baseUrl, api.apikey, api.instance, bot.groupId, mediaType,
          ad.type === 'image' ? 'image/png' : 'video/webm', ad.text,
          `data:${ad.type === 'image' ? 'image/png' : 'video/webm'};base64,${base64}`,
          ad.fileName);
        bot.freeAds.count += 1;
        await bot.save();
      } catch(err) {
        console.error('Erro envio free ad:', err.message);
      }
    }
  } catch(err) {
    console.error('Erro cron plano free:', err.message);
  }
}, { scheduled: true, timezone: 'America/Sao_Paulo' });





app.use('/api', mainrouter);
app.use('/usuario', userRouters);
app.use('/moderador', premiumRouters);
app.use('/admin', adminRouter);
app.get('/lang', (req, res) => {
  const lang = req.query.lang;
  if (translations[lang]) {
    res.cookie('lang', lang, { maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  const backURL = req.get('Referrer') || '/';
  res.redirect(backURL);
});
app.use('/webhook', webhookRoutes);

app.use(function (req, res, next) {
  if (res.statusCode == '200') {
    res.render('semresultado', {
      layout: 'layouts/main'
    });
  }
});

app.set('json spaces', 4);

async function startServer() {
  try {
    await conectar_db();
    await loadTranslations();
    await updateSitemap();
    // Run initial checks before starting the server
    await abrirefechargruposautomatico();
    await processarSorteios();
    app.listen(PORT, () => {
      console.log(`Equipevip API está rodando no host: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Erro ao iniciar servidor:', err);
  }
}

startServer();
module.exports = { app, loadTranslations };


