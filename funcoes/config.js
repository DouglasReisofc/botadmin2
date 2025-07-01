const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs'); // Importando bcrypt
const { usuario } = require('../db/model'); // O modelo de usuário

module.exports = function (passport) {
    // Configurando a estratégia local do passport
    passport.use(new LocalStrategy(
        async (nome, senha, done) => {
            try {
                // Procurar o usuário pelo nome
                const usuarios = await usuario.findOne({ nome });

                // Verifica se o usuário existe
                if (!usuarios) {
                    return done(null, false, {
                        message: 'Não encontrei este nome na minha db',
                    });
                }

                // Comparar a senha fornecida com o hash da senha armazenada no banco de dados
                const isMatch = await bcrypt.compare(senha, usuarios.senha);

                // Se a senha não for válida
                if (!isMatch) {
                    return done(null, false, {
                        message: 'Nome ou senha inválidos',
                    });
                }

                // Senha correta, retorna o usuário
                return done(null, usuarios);
            } catch (err) {
                return done(err);
            }
        })
    );

    // Serializando o usuário para armazenar o ID na sessão
    passport.serializeUser(function (user, done) {
        done(null, user.id);
    });

    // Desserializando o usuário a partir da sessão
    passport.deserializeUser(async function (id, done) {
        try {
            const user = await usuario.findById(id).exec();
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}
