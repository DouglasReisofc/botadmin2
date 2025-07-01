const fs = require('fs/promises');
const path = require('path');
const { Post } = require('../db/post');
const { CommandInfo } = require('../db/commandInfo');
const { Tutorial } = require('../db/tutorial');
const { Banner } = require('../db/banner');
const { basesiteUrl } = require('../configuracao');

function escapeXml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function updateSitemap() {
  try {
    const base = basesiteUrl;
    const banner = await Banner.findOne().sort({ createdAt: -1 });

    const posts = await Post.find().select('slug fileName type title message');
    const postUrls = posts.map(p => {
      const title = escapeXml(p.title);
      const desc = escapeXml((p.message || '').split(/\r?\n/)[0].slice(0,160));
      let media = '';
      if (p.fileName) {
        const url = `${base}${p.fileName}`;
        if (p.type === 'video') {
          media = `    <video:video>\n      <video:content_loc>${url}</video:content_loc>\n      <video:title>${title}</video:title>\n      <video:description>${desc}</video:description>\n    </video:video>`;
        } else if (p.type === 'image') {
          media = `    <image:image>\n      <image:loc>${url}</image:loc>\n      <image:title>${title}</image:title>\n    </image:image>`;
        }
      }
      return `  <url>\n    <loc>${base}/blog/${p.slug}</loc>\n${media}\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    }).join('\n');

    const commands = await CommandInfo.find().select('slug fileName type name');
    const commandUrls = commands.map(c => {
      const title = escapeXml(c.name);
      let media = '';
      if (c.fileName) {
        const url = `${base}${c.fileName}`;
        if (c.type === 'video') {
          media = `    <video:video>\n      <video:content_loc>${url}</video:content_loc>\n      <video:title>${title}</video:title>\n    </video:video>`;
        } else if (c.type === 'image') {
          media = `    <image:image>\n      <image:loc>${url}</image:loc>\n      <image:title>${title}</image:title>\n    </image:image>`;
        }
      }
      return `  <url>\n    <loc>${base}/comandos/${c.slug}</loc>\n${media}\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    }).join('\n');

    const tutorials = await require('../db/tutorial').Tutorial.find({ tutorialId: { $ne: 'commands' } }).select('slug fileName type title message');
    const tutorialUrls = tutorials.map(t => {
      const title = escapeXml(t.title);
      const desc = escapeXml((t.message || '').split(/\r?\n/)[0].slice(0,160));
      let media = '';
      if (t.fileName) {
        const url = `${base}${t.fileName}`;
        if (t.type === 'video') {
          media = `    <video:video>\n      <video:content_loc>${url}</video:content_loc>\n      <video:title>${title}</video:title>\n      <video:description>${desc}</video:description>\n    </video:video>`;
        } else if (t.type === 'image') {
          media = `    <image:image>\n      <image:loc>${url}</image:loc>\n      <image:title>${title}</image:title>\n    </image:image>`;
        }
      }
      return `  <url>\n    <loc>${base}/tutorials/${t.slug}</loc>\n${media}\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
    }).join('\n');

    const homeMedia = banner && banner.fileName
      ? (banner.type === 'video'
          ? `    <video:video>\n      <video:content_loc>${base}/img/${banner.fileName}</video:content_loc>\n      <video:title>Banner</video:title>\n    </video:video>`
          : `    <image:image>\n      <image:loc>${base}/img/${banner.fileName}</image:loc>\n      <image:title>Banner</image:title>\n    </image:image>`)
      : '';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="https://www.google.com/schemas/sitemap-video/1.1" xmlns:image="https://www.google.com/schemas/sitemap-image/1.1">\n  <url>\n    <loc>${base}/</loc>\n${homeMedia}\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${base}/entrar</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n  <url>\n    <loc>${base}/cadastrar</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n  <url>\n    <loc>${base}/tutorials</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n${commandUrls}\n${tutorialUrls}\n  <url>\n    <loc>${base}/blog</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n  <url>\n    <loc>${base}/termos</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n  <url>\n    <loc>${base}/privacidade</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n${postUrls}\n</urlset>`;

    await fs.writeFile(path.join('public', 'sitemap.xml'), xml);
  } catch (err) {
    console.error('Erro ao atualizar sitemap:', err);
  }
}

module.exports = { updateSitemap };
