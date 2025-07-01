const { usuario } = require('./model');
const { Bot } = require('./botConfig');
const { Plano } = require('./planos');  // Importa o modelo Plano
const { limitCount, dinheiroCount, premiumdays, limitPremium } = require('../configuracao');

async function add_usuario(nome, senha, apikey, whatsapp = null, codigoVerificacao = null) {
    let obj = {
        nome,
        senha,
        apikey,
        defaultKey: apikey,
        premium: new Date(Date.now() + premiumdays * 24 * 60 * 60 * 1000), // data de expiração do trial
        limit: limitCount,  // Limite de uso, conforme sua lógica
        saldo: dinheiroCount,  // Saldo, se necessário
        whatsapp,
        whatsappVerificado: false,  // Novo campo para verificar se o WhatsApp foi verificado
        codigoVerificacao,  // Novo campo para armazenar o código de verificação
        status: 'ativo',
        admin: false,  // Usuário comum (não admin)
    };

    // Criação do usuário no banco de dados
    return usuario.create(obj);
}



// Função para verificar se o nome do usuário já existe
async function verificar_nome(nome) {
    let usuarios = await usuario.findOne({ nome: nome });
    return usuarios ? usuarios.nome : false;
}

// Função para pegar a apikey do usuário
async function pegar_apikey(id) {
    let usuarios = await usuario.findOne({ _id: id });
    return { apikey: usuarios.apikey, nome: usuarios.nome };
}

// Função para verificar se a apikey existe
async function verificar_apikey(apikey) {
    let db = await usuario.findOne({ apikey: apikey });
    return db ? db.apikey : false;
}


async function adicionar_limit(apikey) {
    let key = await usuario.findOne({ apikey: apikey });
    let min = key.limit - 1;
    return usuario.updateOne({ apikey: apikey }, { limit: min });
}

// Função para verificar o limite de requisições da API
async function verificar_limit(apikey) {
    let key = await usuario.findOne({ apikey: apikey });
    return key.limit;
}

// Função para verificar se o limite de requisições foi atingido
async function isLimit(apikey) {
    let key = await usuario.findOne({ apikey: apikey });
    return key.limit <= 0;
}

// Função para verificar o saldo de um usuário
async function verificar_dinheiro(apikey) {
    let key = await usuario.findOne({ apikey: apikey });
    return key.saldo;
}

// Função para adicionar dinheiro ao saldo de um usuário
async function adicionar_dinheiro(nome, quantia) {
    let key = await usuario.findOne({ nome: nome });
    let dindin = key.saldo + quantia;
    return usuario.updateOne({ nome: nome }, { saldo: dindin });
}

// Função para total de usuários registrados
async function Totalregistrados() {
    let db = await usuario.find({});
    return db.length;
}

// Função para atualizar o status de um usuário
async function atualizar_status(username, status) {
    return usuario.updateOne({ nome: username }, { status: status });
}

// Função para resetar o limite de todos os usuários (relacionado à API)
async function resetar_todos_limit() {
    const users = await usuario.find({});
    for (const data of users) {
        const ativo = data.premium && data.premium > new Date();
        const limit = ativo ? limitPremium : limitCount;
        await usuario.updateOne({ _id: data._id }, { limit });
    }
}











// Função para adicionar saldo ao usuário
async function adicionarSaldo(usuarioId, valor) {
    const usuario = await usuario.findById(usuarioId);
    usuario.saldo += valor;  // Adiciona o valor ao saldo existente
    await usuario.save();
    return usuario;
}

// Função para atualizar os dados de um usuário
async function editar_usuario(id, nome, whatsapp, status) {
    try {
        // Atualiza o nome, whatsapp e status do usuário
        const updatedUser = await usuario.findByIdAndUpdate(
            id,
            { nome, whatsapp, status },
            { new: true }  // Retorna o usuário atualizado
        );
        return updatedUser;
    } catch (err) {
        throw new Error('Erro ao editar o usuário: ' + err.message);
    }
}

// Função para excluir um usuário
async function excluir_usuario(id) {
    try {
        // Remove o usuário pelo ID
        const deletedUser = await usuario.findByIdAndDelete(id);
        return deletedUser;
    } catch (err) {
        throw new Error('Erro ao excluir o usuário: ' + err.message);
    }
}


// Exportando funções de usuários e outros
module.exports.add_usuario = add_usuario;
module.exports.verificar_nome = verificar_nome;
module.exports.pegar_apikey = pegar_apikey;
module.exports.verificar_apikey = verificar_apikey;
module.exports.adicionar_limit = adicionar_limit;
module.exports.verificar_limit = verificar_limit;
module.exports.adicionar_dinheiro = adicionar_dinheiro;
module.exports.verificar_dinheiro = verificar_dinheiro;
module.exports.isLimit = isLimit;
module.exports.Totalregistrados = Totalregistrados;
module.exports.resetar_todos_limit = resetar_todos_limit;
module.exports.adicionarSaldo = adicionarSaldo;
