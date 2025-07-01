const mongoose = require('mongoose');
const { dbURI, useradmin, passadmin } = require('../configuracao');
const { usuario } = require('./model');
const { Plano } = require('./planos');
const { getHashedPassword } = require('../funcoes/function'); // Importa a função de hash

async function conectar_db() {
  try {
    // Conecta ao MongoDB usando a URI completa (inclui usuário e senha)
    await mongoose.connect(dbURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('[INFO] Conectado a DB com sucesso!');

    // Verificar se o admin já existe
    const adminExistente = await usuario.findOne({ nome: useradmin }).exec();

    // Se o admin não existir, cria o usuário admin
    if (!adminExistente) {
      const hashedPassword = await getHashedPassword(passadmin);
      await usuario.create({
        nome: useradmin,
        senha: hashedPassword,
        apikey: 'adminapikey',
        defaultKey: 'adminapikey',
        premium: null,
        limit: 999999999999,
        saldo: 1000,
        status: 'ativo',
      });
      console.log('[INFO] Usuário Admin criado com sucesso!');
    } else {
      console.log('[INFO] Usuário admin já existe.');
    }

    // Garante que o plano gratuito padrão exista
    const planoFree = await Plano.findOne({ isFree: true }).exec();
    if (!planoFree) {
      await Plano.create({
        nome: 'Plano Free',
        preco: 0,
        duracao: 0,
        descricao: 'Plano gratuito básico',
        limiteGrupos: 1,
        limiteInstancias: 0,
        isFree: true,
        active: true,
        dailyAdLimit: 1,
        adTimes: ['12:00']
      });
      console.log('[INFO] Plano Free criado.');
    }
  } catch (err) {
    console.error('[ERROR] Falha ao conectar ao DB:', err);
    throw err;
  }
}

module.exports.conectar_db = conectar_db;
