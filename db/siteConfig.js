const mongoose = require('mongoose');

const DEFAULT_DARK_THEME = {
  '--preto-absoluto': '#000000',
  '--preto-secundario': '#0a0a0a',
  '--destaque-verde': '#15ff00',
  '--destaque-azul': '#00f3ff',
  '--destaque-rosa': '#ff0066',
  '--destaque-laranja': '#ff9800',
  '--texto-branco': '#ffffff',
  '--texto-cinza': '#cccccc',
  '--texto-azulescuro': '#001aff',
  '--sombra-neon': '0 0 15px rgba(0, 255, 136, 0.3)',
  '--degrade-preto': 'linear-gradient(45deg, #000000, #0a0a0a)',
  '--gradiente-card': 'linear-gradient(145deg, #0a0a0a, #003a2d, #002f3f)',
  '--fundo-input': 'rgba(255,255,255,0.05)',
  '--borda-card': 'rgba(255, 255, 255, 0.1)',
  '--fundo-alerta': 'rgba(255, 255, 255, 0.03)',
  '--fundo-menu': 'rgba(255,255,255,0.05)'
};

const DEFAULT_LIGHT_THEME = {
  '--preto-absoluto': '#ffffff',
  '--preto-secundario': '#f5f5f5',
  '--destaque-verde': '#00b100',
  '--destaque-azul': '#0099ff',
  '--destaque-rosa': '#cc6699',
  '--destaque-laranja': '#ff9800',
  '--texto-branco': '#000000',
  '--texto-cinza': '#342424',
  '--sombra-neon': '0 0 15px rgba(0, 255, 0, 0.763)',
  '--degrade-preto': 'linear-gradient(45deg, #ffffff, #f5f5f5)',
  '--gradiente-card': 'linear-gradient(145deg, #f0f0f0, #d4f5e5, #d4eaf5)',
  '--fundo-input': 'rgba(0,0,0,0.05)',
  '--borda-card': 'rgba(0, 0, 0, 0.1)',
  '--fundo-alerta': 'rgba(0, 0, 0, 0.03)',
  '--fundo-menu': 'rgba(0,0,0,0.05)'
};

const DEFAULT_SEO = {
  title: 'Bot Admin - Automatizar Grupos',
  description: 'Controle Total do WhatsApp com IA e automação inteligente.',
  keywords: 'WhatsApp, Automação, Bot, IA, Controle de Grupos, API',
  image: '/img/banner.png'
};

const DEFAULT_PAGE_SEO = {
  title: '',
  description: '',
  keywords: '',
  image: '/img/banner.png'
};

const DEFAULT_BLOG_SEO = {
  title: 'Blog - Bot Admin',
  description: 'Dicas, novidades e tutoriais sobre automação para WhatsApp.',
  keywords: 'blog, bot admin, automação, whatsapp, ia',
  image: '/img/banner.png'
};

const DEFAULT_TUTORIALS_SEO = {
  title: 'Tutoriais - Bot Admin',
  description: 'Aprenda a usar o Bot Admin com guias passo a passo.',
  keywords: 'tutoriais, guia, bot admin, automação',
  image: '/img/banner.png'
};

const DEFAULT_TERMS_SEO = {
  title: 'Termos de Uso - Bot Admin',
  description: 'Termos e condições para utilizar o Bot Admin.',
  keywords: 'termos de uso, bot admin',
  image: '/img/banner.png'
};

const DEFAULT_PRIVACY_SEO = {
  title: 'Política de Privacidade - Bot Admin',
  description: 'Como protegemos seus dados no Bot Admin.',
  keywords: 'privacidade, dados, bot admin',
  image: '/img/banner.png'
};

const DEFAULT_LOGIN_SEO = {
  title: 'Entrar - Bot Admin',
  description: 'Faça login para gerenciar seus bots no Bot Admin.',
  keywords: 'entrar bot admin, login whatsapp bot',
  image: '/img/banner.png'
};

const DEFAULT_SIGNUP_SEO = {
  title: 'Cadastrar - Bot Admin',
  description: 'Crie sua conta e automatize o WhatsApp com o Bot Admin.',
  keywords: 'cadastrar bot admin, registrar whatsapp bot',
  image: '/img/banner.png'
};

const DEFAULT_LOGO = '/img/logo.webp';
const DEFAULT_LOGO_STYLE = '';

const siteConfigSchema = new mongoose.Schema({
  themeDark: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...DEFAULT_DARK_THEME }) },
  themeLight: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...DEFAULT_LIGHT_THEME }) },
  seo: {
    title: { type: String, default: DEFAULT_SEO.title },
    description: { type: String, default: DEFAULT_SEO.description },
    keywords: { type: String, default: DEFAULT_SEO.keywords },
    image: { type: String, default: DEFAULT_SEO.image }
  },
  blogSeo: {
    title: { type: String, default: DEFAULT_BLOG_SEO.title },
    description: { type: String, default: DEFAULT_BLOG_SEO.description },
    keywords: { type: String, default: DEFAULT_BLOG_SEO.keywords },
    image: { type: String, default: DEFAULT_BLOG_SEO.image }
  },
  tutorialsSeo: {
    title: { type: String, default: DEFAULT_TUTORIALS_SEO.title },
    description: { type: String, default: DEFAULT_TUTORIALS_SEO.description },
    keywords: { type: String, default: DEFAULT_TUTORIALS_SEO.keywords },
    image: { type: String, default: DEFAULT_TUTORIALS_SEO.image }
  },
  termsSeo: {
    title: { type: String, default: DEFAULT_TERMS_SEO.title },
    description: { type: String, default: DEFAULT_TERMS_SEO.description },
    keywords: { type: String, default: DEFAULT_TERMS_SEO.keywords },
    image: { type: String, default: DEFAULT_TERMS_SEO.image }
  },
  privacySeo: {
    title: { type: String, default: DEFAULT_PRIVACY_SEO.title },
    description: { type: String, default: DEFAULT_PRIVACY_SEO.description },
    keywords: { type: String, default: DEFAULT_PRIVACY_SEO.keywords },
    image: { type: String, default: DEFAULT_PRIVACY_SEO.image }
  },
  loginSeo: {
    title: { type: String, default: DEFAULT_LOGIN_SEO.title },
    description: { type: String, default: DEFAULT_LOGIN_SEO.description },
    keywords: { type: String, default: DEFAULT_LOGIN_SEO.keywords },
    image: { type: String, default: DEFAULT_LOGIN_SEO.image }
  },
  signupSeo: {
    title: { type: String, default: DEFAULT_SIGNUP_SEO.title },
    description: { type: String, default: DEFAULT_SIGNUP_SEO.description },
    keywords: { type: String, default: DEFAULT_SIGNUP_SEO.keywords },
    image: { type: String, default: DEFAULT_SIGNUP_SEO.image }
  },
  logo: { type: String, default: DEFAULT_LOGO },
  logoStyle: { type: String, default: DEFAULT_LOGO_STYLE },
  whatsappNumber: { type: String, default: '559295333643' },
  messageBaseUrl: { type: String, default: 'https://wzap.assinazap.shop' },
  messageApiKey: { type: String, default: 'A762E6A59827-4C78-8162-3056A928430C' },
  messageInstance: { type: String, default: '5592991129258' },
  telegramToken: { type: String, default: '' },
  telegramChatId: { type: String, default: '' },
  telegramChannelId: { type: String, default: '' },
  telegramNotify: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = {
  SiteConfig: mongoose.model('SiteConfig', siteConfigSchema),
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_SEO,
  DEFAULT_PAGE_SEO,
  DEFAULT_BLOG_SEO,
  DEFAULT_TUTORIALS_SEO,
  DEFAULT_TERMS_SEO,
  DEFAULT_PRIVACY_SEO,
  DEFAULT_LOGIN_SEO,
  DEFAULT_SIGNUP_SEO,
  DEFAULT_LOGO,
  DEFAULT_LOGO_STYLE
};
