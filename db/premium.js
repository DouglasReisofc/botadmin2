const { usuario } = require('./model');
const toMs = require('ms');
const { limitCount, limitPremium, tokens } = require('../configuracao');
module.exports.tokens = tokens;

/********************
 FUNÇÕES PREMIUM
 *********************/

// Adiciona o plano premium ao usuário
async function addPremium(username, customKey, expired) {
    // Converte a data de expiração em formato Date
    const expirationDate = new Date(Date.now() + toMs(expired));  // Converte o tempo de expiração para uma data
    try {
        await usuario.updateOne({ nome: username }, {
            apikey: customKey,
            premium: expirationDate,  // Armazena a data de expiração diretamente
            limit: limitPremium
        });
        console.log(`Premium adicionado para ${username}. Expira em: ${expirationDate}`);
    } catch (err) {
        console.error('Erro ao adicionar premium:', err);
        throw err;
    }
}

// Verifica se o plano premium do usuário expirou
async function ExpiredTime() {
    let users = await usuario.find({});
    for (let data of users) {
        let { premium, defaultKey, username } = data;
        if (!premium || premium === null) continue;

        // Verifica se a data de expiração passou
        if (Date.now() >= premium.getTime()) {  // Compara a data atual com a data de expiração
            try {
                await usuario.updateOne({ nome: username }, {
                    apikey: defaultKey,
                    premium: null,  // Reseta o campo premium quando expirar
                    limit: limitCount
                });
                console.log(`O Premium de ${username} acabou`);
            } catch (err) {
                console.error('Erro ao expirar premium:', err);
            }
        }
    }
}

// Apaga o plano premium do usuário
async function deletePremium(username) {
    let users = await usuario.findOne({ nome: username });
    let key = users.defaultKey;
    try {
        await usuario.updateOne({ nome: username }, { apikey: key, premium: null, limit: limitCount });
    } catch (err) {
        console.error('Erro ao excluir premium:', err);
        throw err;
    }
}

// Verifica se o usuário tem plano premium ativo
async function checkPremium(username) {
    let users = await usuario.findOne({ nome: username });
    if (!users || users.premium === null) {
        return false;
    }
    // Verifica se a data de expiração do premium ainda é válida
    return new Date() < users.premium;
}

// Muda a chave de API do usuário
async function changeKey(username, key) {
    try {
        await usuario.updateOne({ nome: username }, { apikey: key });
    } catch (err) {
        console.error('Erro ao mudar chave de API:', err);
        throw err;
    }
}

// Reseta o limite de uso do usuário
async function resetOneLimit(username) {
    let users = await usuario.findOne({ nome: username });
    if (users !== null) {
        try {
            await usuario.updateOne({ nome: username }, { limit: limitCount });
        } catch (err) {
            console.error('Erro ao resetar limite:', err);
            throw err;
        }
    }
}

module.exports.addPremium = addPremium;
module.exports.ExpiredTime = ExpiredTime;
module.exports.deletePremium = deletePremium;
module.exports.checkPremium = checkPremium;
module.exports.changeKey = changeKey;
module.exports.resetOneLimit = resetOneLimit;
