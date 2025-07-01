const express = require('express');
const { verificar_nome, adicionar_dinheiro, resetar_todos_limit } =
    require('../db/db');
const { addPremium, deletePremium, tokens, checkPremium, changeKey, resetOneLimit } =
    require('../db/premium');
const { isAuthenticated } = require('../funcoes/auth');
const { limitCount } = require('../configuracao');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('premium/index', {
        layout: 'layouts/main'
    })
})

router.get('/add', (req, res) => {
    res.render('premium/add', {
        layout: 'layouts/main'
    });
});

router.post('/add', async (req, res) => {
    let { username, expired, customKey, token } = req.body;
    if (token != tokens) {
        req.flash('error_msg', 'Token inválido');
        return res.redirect('/moderador/add');
    }
    let checking = await verificar_nome(username);
    if (!checking) {
        req.flash('error_msg', 'Usuário não registrado/encontrado');
        return res.redirect('/moderador/add');
    } else {
        let checkPrem = await checkPremium(username)
        if (checkPrem) {
            req.flash('error_msg', 'Este usuário já tem Premium');
            return res.redirect('/moderador/add');
        } else {
            addPremium(username, customKey, expired)
            req.flash('success_msg', `Sucesso ao adicionar Premium vip para o ${username}`);
            return res.redirect('/moderador');
        }
    }
})

router.get('/delete', (req, res) => {
    res.render('premium/delete', {
        layout: 'layouts/main'
    });
});

router.post('/delete', async (req, res) => {
    let { username, token } = req.body;
    if (token != tokens) {
        req.flash('error_msg', 'Token inválido');
        return res.redirect('/moderador/delete');
    }
    let checking = await verificar_nome(username);
    if (!checking) {
        req.flash('error_msg', 'Usuário não registrado/encontrado');
        return res.redirect('/moderador/delete');
    } else {
        let checkPrem = await checkPremium(username)
        if (checkPrem) {
            deletePremium(username);
            req.flash('success_msg', `O Premium do  ${username} foi retirado com sucesso`);
            return res.redirect('/moderador');
        } else {
            req.flash('error_msg', 'Este usuário não e Premium');
            return res.redirect('/moderador/delete');
        }
    };
});

router.get('/custom', isAuthenticated, (req, res) => {
    res.render('premium/custom', {
        layout: 'layouts/main'
    });
})

router.post('/custom', isAuthenticated, async (req, res) => {
    let { customKey } = req.body;
    let { username } = req.user
    let checkPrem = await checkPremium(username);
    if (checkPrem) {
        changeKey(username, customKey)
        req.flash('success_msg', `Sua apikey foi modificada para: ${customKey}`);
        return res.redirect('/painel');
    } else {
        req.flash('error_msg', 'Você não e um usuário Premium :/');
        return res.redirect('/painel');
    }
})

router.get('/limit', (req, res) => {
    res.render('premium/limit', {
        layout: 'layouts/main'
    });
})

router.post('/limit', async (req, res) => {
    let { username, token } = req.body;
    if (token != tokens) {
        req.flash('error_msg', 'Token inválido');
        return res.redirect('/moderador/limit');
    }
    let reset = await checkPremium(username);
    if (!reset) {
        resetOneLimit(username)
        req.flash('success_msg', `Limit do ${username} foi resetado com sucesso, para: ${limitCount}`);
        return res.redirect('/moderador');
    } else {
        req.flash('error_msg', 'Não e possível redefinir uma apikey Premium');
        return res.redirect('/moderador/limit');
    }
})

router.get('/addd', (req, res) => {
    res.render('premium/addinheiro', {
        layout: 'layouts/main'
    });
});

router.post('/addd', async (req, res) => {
    let { username, quantia, token } = req.body;
    if (token != tokens) {
        req.flash('error_msg', 'Token inválido');
        return res.redirect('/moderador/add');
    }
    let checking = await verificar_nome(username);
    if (!checking) {
        req.flash('error_msg', 'Usuário não registrado/encontrado');
        return res.redirect('/moderador/add');
    } else {
        adicionar_dinheiro(username, quantia)
        req.flash('success_msg', `Sucesso ao adicionar Dinheiro vip para o ${username}`);
        return res.redirect('/moderador');
    }
})


router.post('/resetall', (req, res) => {
    let { token } = req.body;
    if (token != tokens) {
        req.flash('error_msg', 'Token inválido');
        return res.redirect('/moderador');
    } else {
        resetar_todos_limit();
        req.flash('success_msg', `Todos os limits das apikeys foram resetados`);
        return res.redirect('/moderador');
    }
})

module.exports = router;