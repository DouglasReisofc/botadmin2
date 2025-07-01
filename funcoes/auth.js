module.exports = {
  // Middleware para garantir que o usuário está autenticado
  isAuthenticated: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    req.flash('error_msg', '⚠️ Você precisa estar logado para acessar esta página.');
    return res.redirect('/');
  },

  // Middleware para garantir que o usuário não está autenticado
  notAuthenticated: function (req, res, next) {
    if (!req.isAuthenticated()) {
      return next();
    }
    res.redirect('/painel');
  },

  // Middleware para garantir que o usuário é um admin
  isAdmin: function (req, res, next) {
    if (req.isAuthenticated() && req.user.admin) {
      return next();
    }
    req.flash('error_msg', '❌ Você não tem permissão para acessar esta página.');
    res.redirect('/painel');
  },

  // Middleware para garantir que o WhatsApp do usuário está verificado
  isWhatsappVerified: function (req, res, next) {
    if (req.isAuthenticated() && req.user.whatsappVerificado) {
      return next();
    }
    req.flash('error_msg', '⚠️ Você precisa verificar o WhatsApp antes de acessar o painel. Um novo código foi enviado.');
    res.redirect('/usuario/verificar-whatsapp');
  }
};
