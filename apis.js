sayo = process.cwd()


/*******funcoes NECESSÁRIAS********/
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const cookiesPath = './ytcookies.txt';
var express = require('express');
var router = express.Router();
var { exec } = require('child_process')
var fetch = require('node-fetch')
var canvacord = require('canvacord').Canvas
var fs = require('fs')
var { spawn } = require('child_process');
var path = require('path')
var util = require('util')
var zrapi = require("zrapi");
const axios = require("axios");
const url = require('url');
const http = require('http');
const https = require('https');
const cheerio = require("cheerio");
const request = require('request');
const knights = require("knights-canvas");
//const ytdlexec = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const puppeteer = require('puppeteer');
const snapInsta = require('./funcoes/instagram');
const FormData = require('form-data');
const { tmpdir } = require('os');
const { v4: uuidv4 } = require('uuid');

var d = new Date
//var { xvideosofc } = require('./funcoes/xvideos');

//TODAS AS APIS/SCRAP
const {
  styletext, //FONTE DAS LETRAS
  playstore, //pesquisar app da play
  gpwhatsapp, // LINK DE GRUPOS ALEATÓRIOS
  hentaistube, //HENTAISTUBE PESQUISA
  nerding, // NERDING PESQUISA
  apkmodhacker, //APKMOD PESQUISA
  xvideos, //BLOG XVIDEOS PESQUISA
  uptodown, //UPTODOWN PESQUISA
  mediafire, //MEDIAFIRE DOWNLOAD
  pornhub, //PORNHUB PESQUISA
  soundl, //SOUNDCLOUD DOWNLOAD
  st, //STICKER SEARCH
  gpsrc, //PESQUISAR GRUPOS
  dafontSearch, //FONTS PESQUISA
  dafontDown,  //FONTS DOWNLOAD
  igstalk, // INSTAGRAM STALK
  ff, // FOGO GRATIS PESQUISA
  papeldeparede, //PESQUISAR PAPEL DE PAREDE
  htdl, //HENTAISTUBE DOWNLOAD
  // xvideoss, //OFF
  // xvideosdl, //OFF
  assistithtdl, //ASSISTIRHENTAI DOWNLOAD
  assistitht, //ASSISTIRHENTAI PESQUISA
  pornogratis, //PORNOGRATIS PESQUISA
  wallmob, //WALLMOB PESQUISA
  ytDonlodMp3, //YTMP3 BAIXAR ÁUDIOS DO YT VIA LINK
  ytPlayMp3, //PLAY BAIXAR ÁUDIOS DO YT VIA NOME
  ytPlayMp4, //PLAYVÍDEO BAIXAR VÍDEOS DO YT VIA NOME
  ytSearch, //PESQUISA NO YT EM FORMA DE API
  TelegraPh, //UPAR ARQUIVOS NO TELEGRA.PH
  tiktokDL

} = require("./funcoes/api");

/*const { 
pasteggr
} = require("./funcoes/pastegg");*/

const {
  CanvasSenpai
} = require("./funcoes/card/1")
const canva = new CanvasSenpai();

const {
  verificar_apikey,
  adicionar_limit,
  isLimit,
  verificar_limit
} = require("./db/db");

/*const { 
usuario 
} = require('./db/model');*/

const {
  apikeypremium
} = require("./configuracao");

/*******FIM DAS funcoes NECESSÁRIAS********/

var criador = ['DouglasReis']; // Nome do criador

resposta = { //MSG DE ERRO NO SERVIDOR
  semkey: {
    status: false,
    criador: `${criador}`,
    código: 406,
    mensagem:
      'por favor faça login e consiga uma key aleatoria'
  },
  cdtxt: {
    status: false,
    criador: `${criador}`,
    código: 406,
    mensagem:
      'insira o texto na url'
  },
  cdimg: {
    status: false,
    criador: `${criador}`,
    código: 406,
    mensagem:
      'Insira a imagem na url'
  },
  error: {
    status: false,
    criador: `${criador}`,
    mensagem:
      'ops :/ deu erro no servidor interno'
  }
}

/*******ALGUMAS funcoes********/
async function getBuffer(url) {
  he = await fetch(url).then(c => c.buffer())
  return he
}
async function getJson(url) {
  he = await fetch(url).then(c => c.json())
  return he
}
function getRandom(nans) {
  he = nans[Math.floor(Math.random() * nans.length)]
  return he
}

// Exemplo de implementação da função getFinalURL
async function getFinalURL(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return response.headers.get('location');
  } catch (error) {
    console.error('Erro ao obter URL final:', error);
    return null;
  }
}

// Função para acionar o script Python de download de vídeo
async function downloadVideoWithPython(videoUrl) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [path.join(__dirname, 'video_downloader.py'), videoUrl]);

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `Processo Python finalizado com código ${code}`));
      }

      const videoId = stdout.trim();
      if (!videoId) {
        return reject(new Error('ID de vídeo não retornado pelo script Python'));
      }

      const info = spawn('python3', [path.join(__dirname, 'video_info.py'), videoId]);
      let infoOut = '';
      let infoErr = '';

      info.stdout.on('data', (d) => {
        infoOut += d.toString();
      });
      info.stderr.on('data', (d) => {
        infoErr += d.toString();
      });

      info.on('close', (code2) => {
        if (code2 !== 0) {
          return reject(new Error(infoErr.trim() || `Processo de info finalizado com código ${code2}`));
        }
        try {
          const json = JSON.parse(infoOut);
          resolve(json);
        } catch (e) {
          reject(new Error('Erro ao analisar dados do vídeo'));
        }
      });
    });
  });
}


/*****************************************
*                                                                 
*                                                                          
*╔══╗╔═╦╗  ╔══╗╔══╗╔═╦╗╔═╗   *
*║╔╗║╚╗║║  ║══╣║╔╗║╚╗║║║║║   *
*║╔╗║╔╩╗║  ╠══║║╠╣║╔╩╗║║║║   *
*╚══╝╚══╝  ╚══╝╚╝╚╝╚══╝╚═╝   *
*────────  ───────────────   *        
*                                                                         
******************************************/

/******************************************

NULIS

function nulis(nome) {
    let fontPath = './arquivos/Zahraaa.ttf'
    let inputPath = './arquivos/nulis.jpg'
    let outputPath = './tmp/nuliss.jpg'
    let tgl = d.toLocaleDateString('id-Id')
    let hari = d.toLocaleDateString('id-Id', { weekday: 'long' })
    return spawn('convert', [
        inputPath,
        '-font',
        fontPath,
        '-size',
        '1024x784',
        '-pointsize',
        '20',
        '-interline-spacing',
        '1',
        '-annotate',
        '+806+78',
        hari,
        '-font',
        fontPath,
        '-size',
        '1024x784',
        '-pointsize',
        '18',
        '-interline-spacing',
        '1',
        '-annotate',
        '+806+102',
        tgl,
        '-font',
        fontPath,
        '-size',
        '1024x784',
        '-pointsize',
        '20',
        '-interline-spacing',
        '-7.5',
        '-annotate',
        '+344+142',
        nome,
        outputPath
    ]);
};
**********************************/

//API REST....



router.get('/verkey', async (req, res) => {
  const apikey = req.query.apikey;
  if (apikey === undefined) return res.json(resposta.semkey)
  const veri_key = await verificar_apikey(apikey);
  if (!veri_key) return res.json({ status: false, criador: `${criador}`, mensagem: "essa apikey não está registrada" })
  const limit = await verificar_limit(apikey);
  res.send({ status: 200, apikey: apikey, limit: limit });
});

/*router.get('/inforg', async (req, res) => {
let usuarios = await usuario.findOne({_id: id});
    res.json({ status : false, criador : `${criador}`, mensagem : usuario.find({})})
});*/

//router.get('/xvideos', xvideosofc);

router.get('/card/welcome', async (req, res) => {
  const cdapikey = req.query.apikey;
  const nome = req.query.nome;
  const nomegp = req.query.nomegp;
  const fotogp = req.query.fotogp;
  const perfil = req.query.perfil;
  const membros = req.query.membros;
  const fundo = req.query.fundo;
  if (!nome) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô nome" })
  if (!nomegp) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô nomegp" })
  if (!membros) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô membros" })
  if (!fotogp) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô fotogp" })
  if (!perfil) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô perfil" })
  if (!fundo) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô fundo" })
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  var image = await new knights.Welcome()
    .setUsername(`${nome}`)
    .setGuildName(`${nomegp}`)
    .setGuildIcon(`${fotogp}`)
    .setMemberCount(`${membros}`)
    .setAvatar(`${perfil}`)
    .setBackground(`${fundo}`)
    .toAttachment();
  data = image.toBuffer();
  res.type('png')
  res.send(data)
});

router.get('/card/goodbye', async (req, res) => {
  const cdapikey = req.query.apikey;
  const nome = req.query.nome;
  const nomegp = req.query.nomegp;
  const fotogp = req.query.fotogp;
  const perfil = req.query.perfil;
  const membros = req.query.membros;
  const fundo = req.query.fundo;
  if (!nome) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô nome" })
  if (!nomegp) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô nomegp" })
  if (!membros) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô membros" })
  if (!fotogp) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô fotogp" })
  if (!perfil) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô perfil" })
  if (!fundo) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô fundo" })
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  var image = await new knights.Goodbye()
    .setUsername(`${nome}`)
    .setGuildName(`${nomegp}`)
    .setGuildIcon(`${fotogp}`)
    .setMemberCount(`${membros}`)
    .setAvatar(`${perfil}`)
    .setBackground(`${fundo}`)
    .toAttachment();
  data = image.toBuffer();
  res.type('png')
  res.send(data)
});

router.get('/card/menu', async (req, res) => {
  const cdapikey = req.query.apikey;
  const nome = req.query.nome;
  const bateria = req.query.bateria;
  const outro = req.query.outro;
  const perfil = req.query.perfil;
  const fundo = req.query.fundo;
  const msg = req.query.msg;
  if (!nome) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô nome" })
  if (!msg) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô msg" })
  if (!bateria) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô bateria" })
  if (!outro) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô outro" })
  if (!perfil) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô perfil" })
  if (!fundo) return res.json({ status: false, criador: `${criador}`, message: "coloque o parametrô fundo" })
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643' });
  adicionar_limit(cdapikey);
  let X = await canva.profile(
    {
      name: msg,
      discriminator: bateria,
      avatar: perfil,
      rank: nome,
      xp: outro,
      background: fundo,
      blur: false
    })
  ç = X.toBuffer();
  res.type('png')
  res.send(ç)
});

router.get('/textpro/joker-logo', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/create-logo-joker-online-934.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});



router.get('/textpro/neon', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/neon-light-text-effect-online-882.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/matrix', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/matrix-style-text-effect-online-884.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/batman', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/make-a-batman-logo-online-free-1066.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/magma', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/create-a-magma-hot-text-effect-online-1030.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/pornhub', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/pornhub-style-logo-online-generator-free-977.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/thor', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-thor-logo-style-text-effect-online-1064.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/avengers', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-3d-avengers-logo-online-974.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/marvel1', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-logo-style-marvel-studios-ver-metal-972.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/marvel2', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-logo-style-marvel-studios-online-971.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/metal3d', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/text-logo-3d-metal-galaxy-943.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/ninja', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-wolf-logo-galaxy-online-936.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
})

router.get('/textpro/wolf', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  texto1 = req.query.texto1
  texto2 = req.query.texto2
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 1 Invalido" })
  if (!texto1) return res.json({ status: false, criador: `criador`, mensagem: "Texto 2 Invalido" })
  zrapi.textpro("https://textpro.me/create-wolf-logo-galaxy-online-936.html", [texto1, texto2])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/thunder', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/online-thunder-text-effect-generator-1031.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/metal', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/hot-metal-text-effect-843.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/neondevil', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/create-neon-devil-wings-text-effect-online-free-1014.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/bearmascote', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/online-black-and-white-bear-mascot-logo-creation-1012.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/textpro/minion', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  if (cdapikey === undefined) return res.json(resposta.semkey)
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  let { texto } = req.query
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque Um Texto Valido" })
  zrapi.textpro("https://textpro.me/minion-text-effect-3d-online-978.html", [texto,])
    .then((data) => {
      res.json({
        status: true,
        c贸digo: 200,
        criador: `${criador}`,
        resultado: data
      })
    })
});

router.get('/canvas/*', async (req, res) => {
  var cdapikey = req.query.apikey;
  let { url, texto } = req.query
  try {
    const check = await verificar_apikey(cdapikey);
    if (!check) return res.status(403).send({
      status: 403,
      mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
    });
    let limit = await isLimit(cdapikey);
    if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
    adicionar_limit(cdapikey);
    switch (req.path.replace(/\/canvas/, '').toLowerCase()) {
      case '/trigger':
      case '/trigger/':
        if (!url) return res.status(408).send(resposta.cdimg)
        res.type('gif')
        res.send(await canvacord.trigger(url))
        break
      case '/changemymind':
      case '/changemymind/':
        if (!texto) return res.status(408).send(resposta.cdimg)
        res.type('jpg')
        res.send(await canvacord.changemymind(texto))
        break
      case '/clyde':
      case '/clyde/':
        if (!texto) return res.status(408).send(resposta.cdimg)
        res.type('jpg')
        res.send(await canvacord.clyde(texto))
        break
      default:
        res.status(200).json({
          status: 200,
          error: 'A página que você está procurando não foi encontrada',
          endpoint: req.path
        })
    }
  } catch (e) {
    console.error(e)
    res.type('text/json')
    res.status(400).send(resposta.error)
  }
})



// -------------- INSTAGRAM DOWNLOADER -----------------
router.get('/download/instagram', async (req, res) => {
  const { apikey, url } = req.query;

  if (!apikey) return res.json(resposta.semkey);

  const keyOK = await verificar_apikey(apikey);
  if (!keyOK) return res.status(403).json({
    status: 403,
    mensagem: `apikey ${apikey} não encontrada, registre-se primeiro!`
  });

  const acabou = await isLimit(apikey);
  if (acabou) return res.status(403).json({
    status: 403,
    message: 'seu limit acabou compre o premium com 592995333643.'
  });
  adicionar_limit(apikey);

  if (!url)
    return res.json({ status: false, criador, mensagem: 'Coloque o parâmetro url' });

  const regexIG = /^https?:\/\/(www\.)?instagram\.com\/([a-zA-Z0-9_.-]+\/)?(reel|p|tv|stories|s)\/[a-zA-Z0-9_.-]+/i;
  if (!regexIG.test(url))
    return res.json({ status: false, mensagem: 'URL do Instagram inválida.' });

  try {
    const links = await snapInsta(url);
    return res.json({
      status: true,
      código: 200,
      criador,
      resultado: links
    });
  } catch (e) {
    console.error('Erro no Insta-DL:', e);
    return res.status(500).json({
      status: false,
      mensagem: 'Erro ao processar o link do Instagram.',
      error: e.message
    });
  }
});


router.get('/download/ytmp3', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  link = req.query.link
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  if (!link) return res.json({ status: false, criador: `criador`, mensagem: "Coloque o link" })
  ytDonlodMp3(link).then((akk) => {
    res.json({
      status: true,
      código: 200,
      criador: `${criador}`,
      resultado: akk
    })
  }).catch(e => {
    res.sendFile(error)
  })
})



// Rota de download
router.get('/download/globalvideo', async (req, res) => {
  let responseSent = false; // Controle de resposta única

  const sendError = (status, message) => {
    if (!responseSent) {
      responseSent = true;
      res.status(status).json({ status: false, mensagem: message });
    }
  };

  const sendSuccess = (data) => {
    if (!responseSent) {
      responseSent = true;
      res.json({ status: true, mensagem: 'Sucesso', dados: data });
    }
  };

  try {
    const { apikey, url } = req.query;
    if (!apikey || !url) {
      return sendError(400, 'Forneça apikey e URL');
    }

    console.log('Iniciando operação...');
    const videoInfo = await downloadVideoWithPython(url);
    sendSuccess(videoInfo);
  } catch (error) {
    console.error('Erro no processo:', error);
    sendError(500, error.message || 'Erro interno');
  }
});

router.get('/play/:id', (req, res) => {
  const videoId = req.params.id;
  const videoPath = path.join(__dirname, 'tmp', `${videoId}.mp4`);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({
      status: false,
      message: 'Vídeo não encontrado no caminho especificado.'
    });
  }

  // Desativar cache
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Enviar o arquivo como link direto
  res.sendFile(videoPath, (err) => {
    if (err && err.message !== 'Request aborted') {
      console.error('Erro ao enviar vídeo:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          status: false,
          message: 'Erro ao enviar o vídeo.',
          error: err.message
        });
      }
    }
    // Caso contrário, ignora "request aborted"
  });
});




router.get('/download/play', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  let nome = req.query.nome;

  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });

  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({
    status: 403,
    message: 'seu limit acabou compre o premium com 592995333643 .'
  });

  adicionar_limit(cdapikey);

  if (!nome) {
    return res.json({
      status: false,
      criador: `criador`,
      mensagem: "Coloque o nome"
    });
  }

  ytPlayMp3(nome).then((akk) => {
    res.json({
      status: true,
      código: 200,
      criador: `${criador}`,
      resultado: akk
    });
  }).catch(e => {
    // Aqui usamos o argumento "e" para capturar o erro
    console.error("Erro ao executar ytPlayMp3:", e); // Adicione log para depuração
    res.status(500).send({ status: 500, mensagem: "Erro interno no servidor", erro: e.message });
  });
});

// dentro do seu router já configurado:

router.get('/geraraudio', async (req, res) => {
  const { apikey, texto, voz } = req.query;

  // 1) Validação de API Key
  if (!apikey) return res.status(400).json({ status: false, mensagem: 'Parâmetro apikey é obrigatório.' });
  if (!await verificar_apikey(apikey)) return res.status(403).json({ status: false, mensagem: 'API key não encontrada.' });
  if (await isLimit(apikey)) return res.status(403).json({ status: false, mensagem: 'Seu limite acabou. Compre o premium.' });
  adicionar_limit(apikey);

  // 2) Validação de texto
  if (!texto || texto.length < 2) {
    return res.status(400).json({ status: false, mensagem: 'Texto muito curto.' });
  }

  // 3) Validação de voz
  const vozesDisponiveis = {
    laizza: 'tt-pt_female_laizza',
    br004: 'tt-br_004',
    lhays: 'tt-pt_female_lhays',
    ludmilla: 'tt-bp_female_ludmilla',
    bueno: 'tt-pt_male_bueno',
    ivete: 'tt-bp_female_ivete',
    br003: 'tt-br_003',
    br001: 'tt-br_001',
    br002: 'tt-br_002',
    br005: 'tt-br_005'
  };

  const vozKey = voz?.toLowerCase();
  if (!vozKey || !vozesDisponiveis[vozKey]) {
    return res.status(400).json({
      status: false,
      mensagem: 'Voz inválida. Use uma destas chaves: ' + Object.keys(vozesDisponiveis).join(', ')
    });
  }

  const voiceCode = vozesDisponiveis[vozKey];

  try {
    // 4) Requisição TTS
    const form = new FormData();
    form.append('selectedVoiceValue', voiceCode);
    form.append('text', texto);

    const response = await axios.post('https://ttsvibes.com/?/generate', form, {
      headers: {
        ...form.getHeaders(),
        Origin: 'https://ttsvibes.com',
        Referer: 'https://ttsvibes.com/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)',
        Accept: 'application/json'
      }
    });

    const arr = JSON.parse(response.data.data);
    const base64 = arr[2];
    if (!base64) throw new Error('Base64 não retornado.');

    const mp3Buffer = Buffer.from(base64, 'base64');

    // 5) Converte MP3 → OGG com libopus
    const tempInput = path.join(tmpdir(), `input_${Date.now()}.mp3`);
    const tempOutput = path.join(tmpdir(), `output_${Date.now()}.ogg`);
    fs.writeFileSync(tempInput, mp3Buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .toFormat('ogg')
        .audioCodec('libopus')
        .audioBitrate('64k')
        .save(tempOutput)
        .on('end', resolve)
        .on('error', reject);
    });

    const oggBuffer = fs.readFileSync(tempOutput);
    res.set('Content-Type', 'audio/ogg; codecs=opus');
    res.set('Content-Disposition', 'inline; filename="voz.ogg"');
    res.send(oggBuffer);

    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);
  } catch (err) {
    console.error('Erro ao gerar/converter áudio:', err.response?.data || err.message);
    res.status(500).json({ status: false, mensagem: 'Erro ao gerar ou converter áudio.' });
  }
});


router.get('/geraraudio2', async (req, res) => {
  const { apikey, texto } = req.query;

  // 🔐 Validação da apikey
  if (!apikey)
    return res.status(400).json({ status: false, mensagem: 'Parâmetro apikey é obrigatório.' });

  if (!await verificar_apikey(apikey))
    return res.status(403).json({ status: false, mensagem: 'API key inválida.' });

  if (await isLimit(apikey))
    return res.status(403).json({ status: false, mensagem: 'Limite excedido. Compre o premium.' });

  adicionar_limit(apikey);

  // 📝 Validação do texto
  if (!texto || texto.length < 2)
    return res.status(400).json({ status: false, mensagem: 'Texto muito curto.' });

  // ✅ VOZ FIXA (padrão)
  const voiceId = 'VM017102415062058QR'; // ID fixo da voz, como solicitado
  const style = 'Conversational';
  const tempMp3 = path.join(tmpdir(), `murf_${uuidv4()}.mp3`);
  const tempOgg = path.join(tmpdir(), `murf_${uuidv4()}.ogg`);

  try {
    const murf = axios.create({
      baseURL: 'https://murf.ai/Prod/anonymous-tts',
      headers: {
        'Accept': 'audio/mpeg',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Origin': 'https://murf.ai',
        'Referer': 'https://murf.ai/text-to-speech'
      },
      responseType: 'stream'
    });

    const resp = await murf.get('/audio', {
      params: { text: texto, voiceId, style }
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempMp3);
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await new Promise((resolve, reject) => {
      ffmpeg(tempMp3)
        .toFormat('ogg')
        .audioCodec('libopus')
        .audioBitrate('64k')
        .save(tempOgg)
        .on('end', resolve)
        .on('error', reject);
    });

    const oggBuffer = fs.readFileSync(tempOgg);
    res.set('Content-Type', 'audio/ogg; codecs=opus');
    res.set('Content-Disposition', 'inline; filename="voz.ogg"');
    res.send(oggBuffer);

    fs.unlinkSync(tempMp3);
    fs.unlinkSync(tempOgg);
  } catch (err) {
    console.error('❌ Erro ao gerar áudio:', err.message);
    res.status(500).json({ status: false, mensagem: 'Erro ao gerar ou converter áudio.' });
  }
});

router.get('/download/playv', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  nome = req.query.nome
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  if (!nome) return res.json({ status: false, criador: `criador`, mensagem: "Coloque o nome" })
  ytPlayMp4(nome).then((akk) => {
    res.json({
      status: true,
      código: 200,
      criador: `${criador}`,
      resultado: akk
    })
  }).catch(e => {
    res.sendFile(error)
  })
})

router.get('/download/mediafire', async (req, res) => {
  const cdapikey = req.query.apikey;
  const link = req.query.link;

  console.log('Received API Key:', cdapikey);  // Log para verificar a chave da API
  console.log('Received Link:', link);  // Log para verificar o link recebido

  if (cdapikey === undefined) {
    return res.json(resposta.semkey);
  }

  // Verificando se a chave da API é válida
  const check = await verificar_apikey(cdapikey);
  if (!check) {
    return res.status(403).send({
      status: 403,
      mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
    });
  }

  // Verificando se o limite de requisições foi atingido
  let limit = await isLimit(cdapikey);
  if (limit) {
    return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  }

  // Atualizando o limite de requisições
  adicionar_limit(cdapikey);

  // Validando o link fornecido
  const mediafireRegex = /^(https?:\/\/)?(www\.)?mediafire\.com\/.+$/i;
  if (!mediafireRegex.test(link)) {
    return res.json({ status: 400, message: "Link inválido. Forneça um link do Mediafire válido." });
  }

  try {
    console.log('Calling mediafire function with link:', link);  // Log antes de chamar a função
    let result = await mediafire(link);

    // Responde com os dados do arquivo
    let output = `*乂 MEDIAFIRE - DOWNLOADER*\n\n`;
    output += `◦ Nome do Arquivo : ${result.filename}\n`;
    output += `◦ Tipo : ${result.type}\n`;
    output += `◦ Tamanho : ${result.size}\n`;
    output += `◦ Link de Download : ${result.download}`;

    console.log('Result:', result);  // Log para verificar o resultado

    res.json({
      criador: `${criador}`,  // Defina o criador se necessário
      nome: result.filename,
      mime: result.mimetype,
      size: result.size,
      link: result.download,
    });
  } catch (e) {
    console.error('Error during processing the link:', e);  // Log para capturar o erro
    return res.status(500).send({ status: 500, message: "Erro ao processar o link Mediafire", error: e });
  }
});

// Rota para pesquisa no YouTube
router.get('/download/ytsearch', async (req, res) => {
  const cdapikey = req.query.apikey; // A API key do usuário
  const nome = req.query.nome; // O nome do vídeo ou música

  if (!cdapikey) {
    return res.json(resposta.semkey); // Caso a API key não seja fornecida, retorna erro
  }

  // Verifica se a API key é válida
  const check = await verificar_apikey(cdapikey);
  if (!check) {
    return res.status(403).send({
      status: 403,
      mensagem: `API key ${cdapikey} não encontrada. Por favor, registre-se primeiro!`
    });
  }

  // Verifica o limite de requisições do usuário
  let limit = await isLimit(cdapikey);
  if (limit) {
    return res.status(403).send({
      status: 403,
      message: 'Seu limite acabou. Compre o premium com 592995333643.'
    });
  }

  // Atualiza o limite do usuário
  adicionar_limit(cdapikey);

  // Verifica se o parâmetro de pesquisa (nome) foi fornecido
  if (!nome) {
    return res.json({
      status: false,
      criador: 'criador',
      mensagem: 'Por favor, forneça um nome de vídeo ou música com o parâmetro ?nome=nome-da-musica'
    });
  }

  try {
    // Chama a função ytSearch para buscar vídeos
    const searchResults = await ytSearch(nome);
    if (searchResults.length === 0) {
      return res.json({
        status: false,
        mensagem: 'Nenhum vídeo encontrado para o nome fornecido.'
      });
    }

    // Retorna os resultados da pesquisa
    res.json({
      status: true,
      código: 200,
      criador: 'criador',
      resultados: searchResults
    });
  } catch (error) {
    console.error('Erro ao buscar no YouTube:', error);
    res.status(500).json({
      status: false,
      mensagem: 'Erro ao realizar a pesquisa no YouTube.',
      error: error.message
    });
  }
});


router.get('/ferramentas/fonte', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  var texto = req.query.texto
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  if (!texto) return res.json({ status: false, criador: `criador`, mensagem: "Coloque o texto" })
  styletext(texto).then(i => {
    res.json({
      status: true,
      código: 200,
      criador: `${criador}`,
      resultado: i
    })
  }).catch(e => {
    res.sendFile(error)
  })
})

router.get('/ferramentas/telegraph', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  link = req.query.link
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  if (!link) return res.json({ status: false, criador: `criador`, mensagem: "Coloque o link" })
  ran = getRandom('.jpg')
  rano = getRandom('.jpg')
  buff = await getBuffer(link)
  fs.writeFileSync(ran, buff)
  i = await TelegraPh(ran)
  res.json({
    status: true,
    código: 200,
    criador: `${criador}`,
    resultado: util.format(i)
  })
})

router.get('/download/tiktok', async (req, res) => {
  try {
    const cdapikey = req.query.apikey;
    const url = req.query.url;

    // Verificação da API Key
    const check = await verificar_apikey(cdapikey);
    if (!check) {
      return res.status(403).json({
        status: 403,
        mensagem: `API key ${cdapikey} não encontrada. Registre-se primeiro!`
      });
    }

    // Verificação de limite
    const limit = await isLimit(cdapikey);
    if (limit) {
      return res.status(403).json({
        status: 403,
        mensagem: 'Limite excedido. Para acesso premium contate 592995333643'
      });
    }

    adicionar_limit(cdapikey);

    // Validação de URL
    if (!url) {
      return res.status(400).json({
        status: false,
        mensagem: 'Parâmetro URL é obrigatório'
      });
    }

    // Processamento do TikTok
    const result = await tiktokDL(url);

    // Verificação de resposta da API
    if (!result || typeof result !== 'object' || result.code !== 0) {
      return res.status(500).json({
        status: result?.code || 500,
        mensagem: result?.msg || 'Erro ao processar o vídeo ou resposta inválida da API'
      });
    }

    // Retorna o JSON bruto
    return res.status(200).json(result);

  } catch (error) {
    console.error('Erro no endpoint TikTok:', error);
    res.status(500).json({
      status: false,
      mensagem: 'Erro interno no servidor'
    });
  }
});


router.get('/wallmob', async (req, res) => {
  const cdapikey = req.query.apikey;

  try {
    const check = await verificar_apikey(cdapikey);
    if (!check) {
      return res.status(403).send({
        status: 403,
        mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
      });
    }

    let limit = await isLimit(cdapikey);
    if (limit) {
      return res.status(403).send({
        status: 403,
        message: 'Seu limite acabou, compre o premium com 592995333643 .'
      });
    }

    adicionar_limit(cdapikey);

    const result = await wallmob();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter informações do wallpaper.mob.org' });
  }
});




//conteudos +18 \\


router.get('/pesquisar/xvideos', async (req, res, next) => {
  var cdapikey = req.query.apikey;
  nome = req.query.nome
  const check = await verificar_apikey(cdapikey);
  if (!check) return res.status(403).send({
    status: 403,
    mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
  });
  let limit = await isLimit(cdapikey);
  if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
  adicionar_limit(cdapikey);
  if (!nome) return res.json({ status: false, criador: `criador`, mensagem: "Coloque o nome" })
  xvideos(nome).then(i => {
    res.json({
      status: true,
      código: 200,
      criador: `${criador}`,
      resultado: i
    })
  }).catch(e => {
    res.sendFile(error)
  })
})

router.get('/pesquisar/pornogratis', async (req, res, next) => {
  const cdapikey = req.query.apikey;
  const nome = req.query.nome;
  const check = await verificar_apikey(cdapikey);
  if (!check) {
    return res.status(403).send({
      status: 403,
      mensagem: `A API Key '${cdapikey}' não foi encontrada. Por favor, registre-se primeiro!`
    });
  }
  const limit = await isLimit(cdapikey);
  if (limit) {
    return res.status(403).send({
      status: 403,
      mensagem: 'Seu limite de uso da API Key foi atingido. Compre o premium para obter acesso ilimitado.'
    });
  }
  adicionar_limit(cdapikey);
  if (!nome) {
    return res.json({
      status: false,
      mensagem: 'Por favor, forneça um nome para a pesquisa.'
    });
  }
  try {
    const resultados = await pornogratis(nome);
    res.json({
      status: true,
      código: 200,
      resultados: resultados
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      mensagem: 'Ocorreu um erro ao realizar a pesquisa.'
    });
  }
});

router.get('/nsfw/hentai', async (req, res) => {
  var cdapikey = req.query.apikey;
  try {
    const check = await verificar_apikey(cdapikey);
    if (!check) return res.status(403).send({
      status: 403,
      mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
    });
    let limit = await isLimit(cdapikey);
    if (limit) return res.status(403).send({ status: 403, message: 'seu limit acabou compre o premium  com  592995333643  .' });
    adicionar_limit(cdapikey);
    end = getRandom(["waifu", "neko"])
    let { url } = await getJson(`https://api.waifu.pics/nsfw/${end}`)
    let buffer = await getBuffer(url)
    res.type('png')
    res.send(buffer)
  } catch {
    res.type('text/json')
    res.status(400).send(resposta.error)
  }
})


router.get('/sfw/anime', async (req, res) => {
  const cdapikey = req.query.apikey;
  const tipo = req.query.tipo?.toLowerCase();

  // Lista oficial baseada na imagem enviada
  const TIPOS_VALIDOS = [
    'waifu', 'neko', 'shinobu', 'megumin', 'bully', 'cuddle', 'cry', 'hug',
    'awoo', 'kiss', 'lick', 'pat', 'smug', 'bonk', 'yeet', 'blush', 'smile',
    'wave', 'highfive', 'handhold', 'nom', 'bite', 'glomp', 'slap', 'kill',
    'kick', 'happy', 'wink', 'poke', 'dance', 'cringe'
  ];

  try {
    const check = await verificar_apikey(cdapikey);
    if (!check) return res.status(403).json({
      status: 403,
      mensagem: `apikey: ${cdapikey} não encontrada, por favor registre-se primeiro!`
    });

    let limit = await isLimit(cdapikey);
    if (limit) return res.status(403).json({
      status: 403,
      message: 'seu limit acabou, compre o premium com 592995333643.'
    });

    // 🔍 Validação do tipo
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({
        status: 400,
        message: `❌ Tipo inválido. Use um dos seguintes:`,
        disponiveis: TIPOS_VALIDOS
      });
    }

    adicionar_limit(cdapikey);

    const { url } = await getJson(`https://api.waifu.pics/sfw/${tipo}`);
    const buffer = await getBuffer(url);

    res.type('gif');
    res.send(buffer);
  } catch (err) {
    console.error('❌ Erro /sfw/anime:', err.message);
    res.status(500).json({
      status: 500,
      error: 'Erro ao buscar gif do tipo solicitado.'
    });
  }
});








//AREA DE CONSULTAS \\




router.get('/cnpj', async (req, res, next) => {
  const cdapikey = req.query.apikey;
  const cnpj = req.query.cnpj;

  if (cdapikey === undefined) return res.json(resposta.semkey);

  const check = await verificar_apikey(cdapikey);
  if (!check) {
    return res.status(403).send({
      status: 403,
      mensagem: `A API key ${cdapikey} não foi encontrada. Por favor, registre-se primeiro!`
    });
  }

  let limit = await isLimit(cdapikey);
  if (limit) {
    return res.status(403).send({
      status: 403,
      message: 'Seu limite acabou. Compre o premium com 592995333643 .'
    });
  }

  adicionar_limit(cdapikey);

  fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`)
    .then(e => e.json())
    .then(data => {
      if (data) {
        res.json({
          status: true,
          codigo: 200,
          criador: `${criador}`,
          ...data
        });
      } else {
        res.json({
          status: false,
          codigo: 404,
          mensagem: 'Dados não encontrados'
        });
      }
    });
});

router.get('/municipios', async (req, res, next) => {
  const cdapikey = req.query.apikey;
  const uf = req.query.uf;
  if (cdapikey === undefined) return res.json(resposta.semkey);
  const check = await verificar_apikey(cdapikey);
  if (!check) {
    return res.status(403).send({
      status: 403,
      mensagem: `A API key ${cdapikey} não foi encontrada. Por favor, registre-se primeiro!`
    });
  }

  let limit = await isLimit(cdapikey);
  if (limit) {
    return res.status(403).send({
      status: 403,
      message: 'Seu limite acabou. Compre o premium com 592995333643 .'
    });
  }

  adicionar_limit(cdapikey);

  fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}?providers=dados-abertos-br,gov,wikipedia`)
    .then(e => e.json())
    .then(data => {
      if (data) {
        res.json({
          status: true,
          codigo: 200,
          criador: `${criador}`,
          ...data
        });
      } else {
        res.json({
          status: false,
          codigo: 404,
          mensagem: 'Dados não encontrados'
        });
      }
    });
});


module.exports = router