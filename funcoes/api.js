const axios = require("axios");
const cheerio = require("cheerio");
const request = require('request');
const ytdl = require("ytdl-core");
const yts = require('yt-search');
//const ytdlexec = require('youtube-dl-exec');
const { fetch } = require("undici");
const { lookup } = require("mime-types");
const { SocksProxyAgent } = require('socks-proxy-agent');
const { createGunzip, createBrotliDecompress } = require('zlib');
const https = require('https');
const search = require('yt-search');
const BodyForm = require('form-data');
const fs = require('fs');





//FONTES MODIFICADAS
function styletext(texto) {
  return new Promise((resolve, reject) => {
    axios.get('http://qaz.wtf/u/convert.cgi?text=' + texto)
      .then(({ data }) => {
        let $ = cheerio.load(data)
        let hasil = []
        $('table > tbody > tr').each(function (a, b) {
          hasil.push({ nome: $(b).find('td:nth-child(1) > span').text(), fonte: $(b).find('td:nth-child(2)').text().trim() })
        })
        resolve(hasil)
      })
  })
}

//upload no telegra
function TelegraPh(Path) {
  return new Promise(async (resolve, reject) => {
    if (!fs.existsSync(Path)) return reject(new Error("File not Found"))
    try {
      const form = new BodyForm();
      form.append("file", fs.createReadStream(Path))
      const data = await axios({
        url: "https://telegra.ph/upload",
        method: "POST",
        headers: {
          ...form.getHeaders()
        },
        data: form
      })
      return resolve("https://telegra.ph" + data.data[0].src)
    } catch (err) {
      return reject(new Error(String(err)))
    }
  })
}

//playstore
function playstore(name) {
  return new Promise((resolve, reject) => {
    axios.get('https://play.google.com/store/search?q=' + name + '&c=apps')
      .then(({ data }) => {
        const $ = cheerio.load(data)
        let ln = [];
        let nm = [];
        let dv = [];
        let lm = [];
        const result = [];
        $('div.wXUyZd > a').each(function (a, b) {
          const link = 'https://play.google.com' + $(b).attr('href')
          ln.push(link);
        })
        $('div.b8cIId.ReQCgd.Q9MA7b > a > div').each(function (d, e) {
          const name = $(e).text().trim()
          nm.push(name);
        })
        $('div.b8cIId.ReQCgd.KoLSrc > a > div').each(function (f, g) {
          const dev = $(g).text().trim();
          dv.push(dev)
        })
        $('div.b8cIId.ReQCgd.KoLSrc > a').each(function (h, i) {
          const limk = 'https://play.google.com' + $(i).attr('href');
          lm.push(limk);
        })
        for (let i = 0; i < ln.length; i++) {
          result.push({
            name: nm[i],
            link: ln[i],
            developer: dv[i],
            link_dev: lm[i]
          })
        }
        resolve(result)
      })
      .catch(reject)
  })
}

//wallpaper.mob.org
function wallmob() {
  return new Promise((resolve, reject) => {
    axios.get(`https://wallpaper.mob.org/gallery/tag=anime/`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.image-gallery-image ").each((_, say) => {
        var img = $(say).find("img").attr('src');
        var resultado = {
          img: img
        }
        postagem.push(resultado)
      })
      //  console.log(tod.data)
      resolve(postagem)
    }).catch(reject)
  });
}

//Assistirhentai Pesquisa
function assistitht(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://www.assistirhentai.com/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.videos").each((_, say) => {
        var nome = $(say).find("h2").text().trim();
        var img = $(say).find("img").attr('src');
        var link = $(say).find("a").attr('href');
        var data_up = $(say).find("span.video-data").text().trim();
        var tipo = $(say).find("span.selo-tipo").text().trim();
        var eps = $(say).find("span.selo-tempo").text().trim();
        var resultado = {
          nome: nome,
          img: img,
          link: link,
          data_up: data_up,
          tipo: tipo,
          total_ep: eps
        }
        postagem.push(resultado)
      })
      //  console.log(tod.data)
      resolve(postagem)
    }).catch(reject)
  });
}

//Assistirhentai dl
function assistithtdl(link) {
  return new Promise((resolve, reject) => {
    axios.get(`${link}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.meio").each((_, say) => {
        var nome = $(say).find("h1.post-titulo").text().trim();
        var img = $(say).find("img").attr('src');
        var descrição = $(say).find("p").text().trim();
        var link = $(say).find("source").attr('src');
        var resultado = {
          nome: nome,
          capa: img,
          descrição: descrição,
          link_dl: link
        }
        postagem.push(resultado)
      })
      //  console.log(tod.data)
      resolve(postagem)
    }).catch(reject)
  });
}

//Porno gratis
function pornogratis(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://pornogratis.vlog.br/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.videos-row").each((_, say) => {
        var nome = $(say).find("a").attr('title');
        var img = $(say).find("img").attr('src');
        var link = $(say).find("a").attr('href');
        var resultado = {
          nome: nome,
          img: img,
          link: link
        }
        postagem.push(resultado)
      })
      //  console.log(tod.data)
      resolve(postagem)
    }).catch(reject)
  });
}

function xvideoss(nome) {
  var link = `https://www.xvideos.com/?k=${nome}`;
  var data = [];
  var xv = [];
  request(link, (err, req, body) => {
    if (err) return console.log(err);
    const Sayo_Reg = /<\/div><div class=\".+?\"><p class=\".+?\"><a href=\".+?\" .+? <span class=\".+?\"><\/span>/g;
    const datas = body.match(Sayo_Reg);
    data.push(...datas);
    var Sayo_Regk = /\"\/.+?\"/g;
    var Sayo_Regkk = /title=\".+?\">/g;
    //var Sayo_Regkkk = /\"duration\">.+?/g;
    for (let index of data) {
      var Akame_R = index.match(Sayo_Regk);
      var Akame_RR = index.match(Sayo_Regkk);
      var Akame_RRR = Akame_RR[0].split('title=').join('').split('>').join('');
      //var Akame_RRRR = index.match(Sayo_Regkkk);
      var opções = {
        título: JSON.parse(Akame_RRR),
        //duração: JSON.parse(Akame_RRRR),
        link: 'https://www.xvideos.com' + JSON.parse(Akame_R[0]),
      };
      //console.log(opções)
      xv.push(opções);
    }
  });
};

function xvideosdl(link) {
  const ___Xvdlkkk = [];
  request(link, (err, req, body) => {
    var ___Sayo_Reg = /html5player\.setVideoTitle\(\'.+?\'\)/g;
    var ___Título_vD = body.match(___Sayo_Reg)[0].split('html5player.setVideoTitle(\'').join('').split('\')').join('');
    var __Link_dO_Video_rrr = /html5player\.setVideoUrlHigh\(\'.+?\'\)/g;
    var __Link_dO_Video_r = body.match(__Link_dO_Video_rrr)[0].split('html5player.setVideoUrlHigh').join('').split('(').join('').split(')').join('').split('\'').join('');
    var __Duração_do_Vd_sec_dos_ofc011 = /class=\"duration\">.+?<\/span>/g;
    var __Duração_do_Vd_sec_dos_ofc = body.match(__Duração_do_Vd_sec_dos_ofc011)[0].split('class=\"duration\">').join('').split('<').join('').split('span>').join('').split('/').join('');
    var __Duração_do_Vd_sec_dos = __Duração_do_Vd_sec_dos_ofc.endsWith(' min') ? ' minutes' : '' || __Duração_do_Vd_sec_dos_ofc.endsWith(' sec') ? ' seconds' : '';
    var __Duração_do_Vd = __Duração_do_Vd_sec_dos_ofc.split(' ')[0] + __Duração_do_Vd_sec_dos;
    var __Visualizações___k = /class=\"mobile-hide\">.+?<\/strong>/g;
    var __Visualizações_k = body.match(__Visualizações___k)[0].split('class=\"mobile-hide\">').join('').split('</strong>').join('');
    var __Criador = /html5player\.setUploaderName\(\'.+?\'\)/g;
    var __Criador_do_Video_safado = body.match(__Criador)[0].split('html5player.setUploaderName(\'').join('').split('\')').join('');
    var obj = {
      criador_vd: __Criador_do_Video_safado,
      título: ___Título_vD,
      link: __Link_dO_Video_r,
      duração: __Duração_do_Vd,
      visualizações: __Visualizações_k
    };
    ___Xvdlkkk.push(obj);
    //console.log(obj)
  })
}

function htdl(link) {
  return new Promise((resolve, reject) => {
    axios.get(`${link}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.toggle").each((_, say) => {
        var link = $(say).find("video").attr('src');
        var resultado = {
          link: link
        }
        postagem.push(resultado)
      })
      //  console.log(tod.data)
      resolve(postagem)
    }).catch(reject)
  });
}

function papeldeparede(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://wall.alphacoders.com/search.php?search=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.boxgrid").each((_, say) => {
        var titulo = $(say).find("a").attr('title');
        var link1 = $(say).find("a").attr('href');
        var link = `https://wall.alphacoders.com${link1}`
        var img = $(say).find("img").attr('src');
        var resultado = {
          titulo: titulo,
          img: img,
          link: link
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

function xnxxdl(link_video) {
  return new Promise((resolve, reject) => {
    fetch(link_video, { method: 'get' }).then(sexokk => sexokk.text()).then(sexokk => {
      var sayo = cheerio.load(sexokk, { xmlMode: false }); resolve({
        criador: "Dark",
        resultado: { título: sayo('meta[property="og:title"]').attr('content'), duração: sayo('meta[property="og:duration"]').attr('content'), img: sayo('meta[property="og:image"]').attr('content'), tipo_vd: sayo('meta[property="og:video:type"]').attr('content'), vd_altura: sayo('meta[property="og:video:width"]').attr('content'), vd_largura: sayo('meta[property="og:video:height"]').attr('content'), informações: sayo('span.metadata').text(), resultado2: { qualidade_baixa: (sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setVideoUrlLow\\(\'(.*?)\'\\);') || [])[1], qualidade_alta: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setVideoUrlHigh\\(\'(.*?)\'\\);' || [])[1], qualidade_HLS: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setVideoHLS\\(\'(.*?)\'\\);' || [])[1], capa: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setThumbUrl\\(\'(.*?)\'\\);' || [])[1], capa69: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setThumbUrl169\\(\'(.*?)\'\\);' || [])[1], capa_slide: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setThumbSlide\\(\'(.*?)\'\\);' || [])[1], capa_slide_grande: sayo('#video-player-bg > script:nth-child(6)').html().match('html5player.setThumbSlideBig\\(\'(.*?)\'\\);' || [])[1] } }
      })
    }).catch(err => reject({ code: 503, status: false, result: err }))
  })
}

//WIKIPEDIA
var wiki = async (query) => {
  var res = await axios.get(`https://pt.m.wikipedia.org/wiki/${query}`)
  var $ = cheerio.load(res.data)
  var postagem = []
  var titulo = $('#mf-section-0').find('p').text()
  var capa = $('#mf-section-0').find('div > div > a > img').attr('src')
  capaofc = capa ? capa : '//pngimg.com/uploads/wikipedia/wikipedia_PNG35.png'
  img = 'https:' + capaofc
  var título = $('h1#section_0').text()
  postagem.push({ titulo, img })
  return postagem
}

//FF
function ff(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://www.ffesportsbr.com.br/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("article.home-post.col-xs-12.col-sm-12.col-md-4.col-lg-4.py-3").each((_, say) => {
        var titulo = $(say).find("h2").text().trim();
        var keywords = $(say).find("ul").text().trim();
        var publicado = $(say).find("span").text().trim();
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img").attr('src');
        var resultado = {
          titulo: titulo,
          keywords: keywords,
          publicado: publicado,
          img: img,
          link: link
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}




//DAFONTE
const dafontSearch = async (query) => {
  const base = `https://www.dafont.com`
  const res = await axios.get(`${base}/search.php?q=${query}`)
  const $ = cheerio.load(res.data)
  const sayo = []
  const total = $('div.dffont2').text().replace(` fonts on DaFont for ${query}`, '')
  $('div').find('div.container > div > div.preview').each(function (a, b) {
    $('div').find('div.container > div > div.lv1left.dfbg').each(function (c, d) {
      $('div').find('div.container > div > div.lv1right.dfbg').each(function (e, f) {
        let link = `${base}/` + $(b).find('a').attr('href')
        let titulo = $(d).text()
        let estilo = $(f).text()
        sayo.push({ titulo, estilo, total, link })
      })
    })
  })
  return sayo
}

const dafontDown = async (link) => {
  const des = await axios.get(link)
  const sup = cheerio.load(des.data)
  const result = []
  let estilo = sup('div').find('div.container > div > div.lv1right.dfbg').text()
  let titulo = sup('div').find('div.container > div > div.lv1left.dfbg').text()
  try {
    isi = sup('div').find('div.container > div > span').text().split('.ttf')
    saida = sup('div').find('div.container > div > span').eq(0).text().replace('ttf', 'zip')
  } catch {
    isi = sup('div').find('div.container > div > span').text().split('.otf')
    saida = sup('div').find('div.container > div > span').eq(0).text().replace('otf', 'zip')
  }
  let download = 'http:' + sup('div').find('div.container > div > div.dlbox > a').attr('href')
  result.push({ estilo, titulo, isi, saida, download })
  return result
}

//GRUPO
function gpsrc(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://zaplinksbrasil.com.br/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.grupo").each((_, say) => {
        var titulo = $(say).find("a").attr('title');
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img").attr('src');
        var conteudo = $(say).find("div.listaCategoria").text().trim();
        var resultado = {
          titulo: titulo,
          img: img,
          conteudo: conteudo,
          link: link
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//STICKER SEARCH
function st(nome) {
  return new
    Promise((resolve, reject) => {
      axios.get(`https://getstickerpack.com/stickers?query=${query}`)
        .then(({
          data
        }) => {
          const $ = cheerio.load(data)
          const link = [];
          $('#stickerPacks > div > div:nth-child(3) > div > a')
            .each(function (a, b) {
              link.push($(b).attr('href'))
            })
          rand = link[Math.floor(Math.random() * link.length)]
          axios.get(rand)
            .then(({
              data
            }) => {
              const $$ = cheerio.load(data)
              const url = [];
              $$('#stickerPack > div > div.row > div > img')
                .each(function (a, b) {
                  url.push($$(b).attr('src').split('&d=')[0])
                })
              resolve({
                criador: '@Dark',
                titulo: $$('#intro > div > div > h1').text(),
                autor: $$('#intro > div > div > h5 > a').text(),
                autor_link: $$('#intro > div > div > h5 > a').attr('href'),
                figurinhas: url
              })
            })
        })
    })
}

//SOUND CLOUD DOWNLOAD
function soundl(link) {
  return new Promise((resolve, reject) => {
    const opções = {
      method: 'POST',
      url: "https://www.klickaud.co/download.php",
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      formData: {
        'value': link,
        '2311a6d881b099dc3820600739d52e64a1e6dcfe55097b5c7c649088c4e50c37': '710c08f2ba36bd969d1cbc68f59797421fcf90ca7cd398f78d67dfd8c3e554e3'
      }
    };
    request(opções, async function (error, response, body) {
      console.log(body)
      if (error) throw new Error(error);
      const $ = cheerio.load(body)
      resolve({
        titulo: $('#header > div > div > div.col-lg-8 > div > table > tbody > tr > td:nth-child(2)').text(),
        total_downloads: $('#header > div > div > div.col-lg-8 > div > table > tbody > tr > td:nth-child(3)').text(),
        capa: $('#header > div > div > div.col-lg-8 > div > table > tbody > tr > td:nth-child(1) > img').attr('src'),
        link_dl: $('#dlMP3').attr('onclick').split(`downloadFile('`)[1].split(`',`)[0]
      });
    });
  })
}

//PORNHUB
function pornhub(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://pt.pornhub.com/video/search?search=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("li.pcVideoListItem.js-pop.videoblock.videoBox").each((_, say) => {
        var titulo = $(say).find("a").attr('title');
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img").attr('data-thumb_url');
        var duração = $(say).find("var.duration").text().trim();
        var qualidade = $(say).find("span.hd-thumbnail").text().trim();
        var autor = $(say).find("div.usernameWrap").text().trim();
        var visualizações = $(say).find("span.views").text().trim();
        var data_upload = $(say).find("var.added").text().trim();
        var hype = $(say).find("div.value").text().trim();
        var link2 = `https://pt.pornhub.com${link}`
        var resultado = {
          titulo: titulo,
          img: img,
          duração: duração,
          qualidade: qualidade,
          autor: autor,
          visualizações: visualizações,
          data_upload: data_upload,
          hype: hype,
          link: link2
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//XVIDEOS
function xvideos(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://xvideosporno.blog.br/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.postbox").each((_, say) => {
        var titulo = $(say).find("a").attr('title');
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img").attr('src');
        var duração = $(say).find("time.duration-top").text().trim();
        var qualidade = $(say).find("b.hd-top").text().trim();
        var resultado = {
          titulo: titulo,
          img: img,
          duração: duração,
          qualidade: qualidade,
          link: link
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//UPTODOWN
function uptodown(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://br.uptodown.com/android/search/${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.item").each((_, say) => {
        var titulo = $(say).find("div.name").text().trim();
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img.app_card_img.lazyload").attr('data-src');
        var descrição = $(say).find("div.description").text().trim();
        var resultado = {
          titulo: titulo,
          link: link,
          icone: img,
          descrição: descrição
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//GRUPOS WHATSAPP
function gpwhatsapp() {
  return new Promise((resolve, reject) => {
    axios.get(`https://gruposwhats.app/`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.col-12.col-md-6.col-lg-4.mb-4.col-group").each((_, say) => {
        var nome = $(say).find("h5.card-title").text().trim();
        var descrição = $(say).find("p.card-text").text().trim();
        var link = $(say).find("a.btn.btn-success.btn-block.stretched-link.font-weight-bold").attr('href');
        var img = $(say).find("img.card-img-top.lazy").attr('data-src');
        var resultado = {
          nome: nome,
          link: link,
          descrição: descrição,
          img: img
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}


//HENTAIS TUBE
function hentaistube(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://www.hentaistube.com/buscar/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.epiItem").each((_, say) => {
        var titulo = $(say).find("div.epiItemNome").text().trim();
        var link = $(say).find("a").attr('href');
        var img = $(say).find("img").attr('src');
        var resultado = {
          titulo: titulo,
          link: link,
          img: img
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}


//NERDING
function nerding(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://www.nerding.com.br/search?q=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.col-sm-6.col-xs-12.item-boxed-cnt").each((_, say) => {
        var titulo = $(say).find("h3.title").text().trim();
        var descrição = $(say).find("p.summary").text().trim();
        var imagem = $(say).find("img.lazyload.img-responsive").attr('src');
        var link = $(say).find("a.pull-right.read-more").attr('href');
        var review = $(say).find("span.label-post-category").text().trim();
        //    var autor = $(say).find("p.post-meta-inner").text().trim();
        var resultado = {
          titulo: titulo,
          descrição: descrição,
          imagem: imagem,
          review: review,
          link: link
          //      autor: autor
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//APKMODHACKER
function apkmodhacker(nome) {
  return new Promise((resolve, reject) => {
    axios.get(`https://apkmodhacker.com/?s=${nome}`).then(tod => {
      const $ = cheerio.load(tod.data)
      var postagem = [];
      $("div.post-inner.post-hover").each((_, say) => {
        var nome = $(say).find("h2.post-title.entry-title").text().trim();
        var descrição = $(say).find("div.entry.excerpt.entry-summary").text().trim();
        var imagem = $(say).find("img.attachment-thumb-medium.size-thumb-medium.wp-post-image").attr('src');
        var link = $(say).find("a").attr('href');
        var categoria = $(say).find("p.post-category").text().trim();
        var horario_upload = $(say).find("time.published.updated").attr('datetime');
        var resultado = {
          nome: nome,
          descrição: descrição,
          categoria: categoria,
          imagem: imagem,
          link: link,
          horario_upload: horario_upload
        }
        postagem.push(resultado)
      })
      resolve(postagem)
    }).catch(reject)
  });
}

//YTMP3
async function ytDonlodMp3(url) {
  return new Promise((resolve, reject) => {
    try {
      const id = ytdlgetVideoID(url)
      const yutub = ytdlgetInfo(`https://www.youtube.com/watch?v=${id}`)
        .then((data) => {
          let pormat = data.formats
          let audio = []
          for (let i = 0; i < pormat.length; i++) {
            if (pormat[i].mimeType == 'audio/webm; codecs=\"opus\"') {
              let aud = pormat[i]
              audio.push(aud.url)
            }
          }
          const title = data.player_response.microformat.playerMicroformatRenderer.title.simpleText
          const thumb = data.player_response.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0].url
          const channel = data.player_response.microformat.playerMicroformatRenderer.ownerChannelName
          const views = data.player_response.microformat.playerMicroformatRenderer.viewCount
          const published = data.player_response.microformat.playerMicroformatRenderer.publishDate

          const result = {
            título: title,
            thumb: thumb,
            canal: channel,
            publicado: published,
            visualizações: views,
            link: audio[1]
          }
          return (result)
        })
      resolve(yutub)
    } catch (error) {
      reject(error);
    }
    console.log(error)
  })
}









//PLAY
async function ytPlayMp3(query) {
  return new Promise((resolve, reject) => {
    try {
      const search = yts(query)
        .then((data) => {
          const url = []
          const pormat = data.all
          for (let i = 0; i < pormat.length; i++) {
            if (pormat[i].type == 'video') {
              let dapet = pormat[i]
              url.push(dapet.url)
            }
          }
          const id = ytdlgetVideoID(url[0])
          const yutub = ytdlgetInfo(`https://www.youtube.com/watch?v=${id}`)
            .then((data) => {
              let pormat = data.formats
              let audio = []
              let video = []
              for (let i = 0; i < pormat.length; i++) {
                if (pormat[i].mimeType == 'audio/webm; codecs=\"opus\"') {
                  let aud = pormat[i]
                  audio.push(aud.url)
                }
              }
              const title = data.player_response.microformat.playerMicroformatRenderer.title.simpleText
              const thumb = data.player_response.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0].url
              const channel = data.player_response.microformat.playerMicroformatRenderer.ownerChannelName
              const views = data.player_response.microformat.playerMicroformatRenderer.viewCount
              const published = data.player_response.microformat.playerMicroformatRenderer.publishDate
              const result = {
                título: title,
                thumb: thumb,
                canal: channel,
                publicado: published,
                visualizações: views,
                link: audio[0]
              }
              return (result)
            })
          return (yutub)
        })
      resolve(search)
    } catch (error) {
      reject(error)
    }
    console.log(error)
  })
}

//PLAY VÍDEO
async function ytPlayMp4(query) {
  return new Promise((resolve, reject) => {
    try {
      const search = yts(query)
        .then((data) => {
          const url = []
          const pormat = data.all
          for (let i = 0; i < pormat.length; i++) {
            if (pormat[i].type == 'video') {
              let dapet = pormat[i]
              url.push(dapet.url)
            }
          }
          const id = ytdlgetVideoID(url[0])
          const yutub = ytdlgetInfo(`https://www.youtube.com/watch?v=${id}`)
            .then((data) => {
              let pormat = data.formats
              let video = []
              for (let i = 0; i < pormat.length; i++) {
                if (pormat[i].container == 'mp4' && pormat[i].hasVideo == true && pormat[i].hasAudio == true) {
                  let vid = pormat[i]
                  video.push(vid.url)
                }
              }
              const title = data.player_response.microformat.playerMicroformatRenderer.title.simpleText
              const thumb = data.player_response.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0].url
              const channel = data.player_response.microformat.playerMicroformatRenderer.ownerChannelName
              const views = data.player_response.microformat.playerMicroformatRenderer.viewCount
              const published = data.player_response.microformat.playerMicroformatRenderer.publishDate
              const result = {
                título: title,
                thumb: thumb,
                canal: channel,
                publicado: published,
                visualizações: views,
                url: video[0]
              }
              return (result)
            })
          return (yutub)
        })
      resolve(search)
    } catch (error) {
      reject(error)
    }
    console.log(error)
  })
}

// Caminho para o arquivo de cookies
const cookiesFile = '../ytcookies.txt';

// Função de pesquisa
async function ytSearch(query) {
  return new Promise((resolve, reject) => {
    search(query, function (err, results) {
      if (err) {
        reject(err);
      } else {
        resolve(results.videos); // Retorna os vídeos encontrados
      }
    });
  });
}


async function tiktokDL(url) {
  const domain = 'https://www.tikwm.com/';
  const headers = {
    'accept': 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'sec-ch-ua': '"Chromium";v="104", " Not A;Brand";v="99", "Google Chrome";v="104"',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
  };

  const params = new URLSearchParams({
    'url': url,
    'count': 12,
    'cursor': 0,
    'web': 1,
    'hd': 1,
  });

  const response = await fetch(domain + 'api/', {
    method: 'POST',
    headers: headers,
    body: params,
  });

  const data = await response.json();

  // Retorna o JSON bruto da API
  return data;
}



async function mediafire(url) {
  return new Promise(async (resolve, reject) => {
    try {
      // Cabeçalhos fornecidos para a requisição
      const headers = {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'sec-ch-ua': '"Chromium";v="104", " Not A;Brand";v="99", "Google Chrome";v="104"',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
      };

      // Requisição para o Mediafire
      const response = await axios({
        url: url,
        method: "GET",
        headers: headers,
        timeout: 5000, // Timeout de 5 segundos para aguardar
      });

      // Aguarda 3 segundos para garantir que a página "Just a moment" seja carregada
      setTimeout(async () => {
        try {
          // Log para verificar a resposta do HTML carregado
          const html = response.data;
          const $ = cheerio.load(html);

          // Verificação para garantir que os dados estão na página
          const filename = $(".dl-btn-label").attr("title");
          const size = $('.download_link .input').text().trim().match(/\((.*?)\)/)[1];
          const ext = filename.split(".").pop();
          const mimetype = lookup(ext.toLowerCase()) || "application/" + ext.toLowerCase();
          const download = $(".input").attr("href");

          // Se os dados forem encontrados, resolva a promessa
          if (filename && download) {
            resolve({
              filename,
              size,
              ext,
              mimetype,
              download,
            });
          } else {
            reject(new Error("Não foi possível encontrar os dados do arquivo."));
          }
        } catch (err) {
          console.error("Erro ao processar o conteúdo após espera:", err);
          reject(new Error("Erro ao tentar extrair dados do link."));
        }
      }, 3000); // Espera de 3 segundos para aguardar o redirecionamento da página

    } catch (err) {
      console.error("Erro no scraping:", err);  // Log completo do erro
      reject(new Error("Erro ao tentar extrair dados do link."));
    }
  });
}



module.exports = { styletext, playstore, gpwhatsapp, hentaistube, nerding, apkmodhacker, xvideos, uptodown, mediafire, pornhub, soundl, st, gpsrc, dafontSearch, dafontDown, ff, papeldeparede, htdl, xvideoss, xvideosdl, assistithtdl, assistitht, pornogratis, wallmob, ytDonlodMp3, ytPlayMp3, ytPlayMp4, ytSearch, TelegraPh, tiktokDL }

//xvideos('porno').then((data) => console.log(data))