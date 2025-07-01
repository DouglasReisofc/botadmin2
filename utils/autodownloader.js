const axios = require('axios');
const { sendMedia, sendText } = require('../db/waActions');
const { basesiteUrl } = require('../configuracao');
const siteUrl = basesiteUrl;

// 🔐 Lista única de domínios suportados
const LINKS_SUPORTADOS = {
    instagram: 'instagram.com',
    tiktok: 'tiktok.com',
    kwai: 'kwai.com',
    facebook: 'facebook.com',
    youtube: 'youtu.be',
};

// 🔍 Detecta a plataforma com base no link
function detectarPlataforma(link) {
    try {
        const url = new URL(link);
        const hostname = url.hostname;

        for (const [plataforma, dominio] of Object.entries(LINKS_SUPORTADOS)) {
            if (hostname.includes(dominio)) return plataforma;
        }
    } catch { }
    return null;
}

// 🧠 Função principal
async function processarAutoDownloader(link, remoteJid, server_url, apikey, instance) {
    const plataforma = detectarPlataforma(link);

    if (!plataforma) {
        console.log('⚠️ Nenhuma plataforma suportada no link:', link);
        return;
    }

    console.log(`📥 Processando mídia ${plataforma}: ${link}`);

    try {
        await sendText(
            server_url,
            apikey,
            instance,
            remoteJid,
            'Estou baixando seu vídeo, por favor aguarde até a API retornar corretamente.'
        );
    } catch (err) {
        console.warn('⚠️ Erro ao enviar mensagem de aguardo:', err.message);
    }

    try {
        switch (plataforma) {
            case 'instagram': {
                const { data } = await axios.get(`${siteUrl}/api/download/instagram`, {
                    params: { apikey: 'equipevipadm', url: link }
                });

                if (!data?.status || !Array.isArray(data.resultado)) {
                    console.warn('⚠️ Resposta inesperada da API Instagram:', data);
                    return null;
                }

                for (const item of data.resultado) {
                    if (!item.url || typeof item.url !== 'string') continue;

                    const tipo = (item.tipo || '').toLowerCase();
                    const mimetype = tipo.includes('photo') ? 'image/jpeg' : 'video/mp4';
                    const tipoEnvio = tipo.includes('photo') ? 'image' : 'document';

                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        tipoEnvio,
                        mimetype,
                        '',
                        item.url,
                        `insta_${Date.now()}_${Math.random().toString(36).substring(2)}.${tipoEnvio === 'image' ? 'jpg' : 'mp4'}`
                    );
                }

                return true;
            }

            case 'tiktok': {
                const { data } = await axios.get(`${siteUrl}/api/download/tiktok`, {
                    params: { apikey: 'equipevipadm', url: link }
                });

                if (data?.code !== 0 || !data.data) {
                    console.warn('⚠️ Resposta inesperada da API TikTok:', data);
                    return null;
                }

                const d = data.data;
                const cdnBase = 'https://www.tikwm.com';

                const caption = [
                    `🎬 *${d.title || 'Sem título'}*`,
                    `👤 Autor: ${d.author?.nickname || 'Desconhecido'}`,
                    `💬 Comentários: ${d.comment_count ?? 'N/A'}`,
                    `❤️ Curtidas: ${d.digg_count ?? 'N/A'}`,
                    `👀 Visualizações: ${d.play_count ?? 'N/A'}`,
                    `🔁 Compartilhamentos: ${d.share_count ?? 'N/A'}`,
                ].join('\n');

                if (Array.isArray(d.images) && d.images.length > 0) {
                    for (let i = 0; i < d.images.length; i++) {
                        const imageUrl = d.images[i];
                        await sendMedia(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            'image',
                            'image/jpeg',
                            i === 0 ? caption : '',
                            imageUrl,
                            `tiktok_image_${i + 1}_${Date.now()}.jpg`
                        );
                    }

                    return true;
                }

                if (d.hdplay || d.play) {
                    const rawPath = d.hdplay || d.play;
                    const videoUrl = rawPath.startsWith('http') ? rawPath : `${cdnBase}${rawPath}`;
                    const fileName = `tiktok_${Date.now()}.mp4`;

                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'document',
                        'video/mp4',
                        caption,
                        videoUrl,
                        fileName
                    );

                    return true;
                }

                console.warn('⚠️ Nenhuma mídia encontrada no retorno do TikTok.');
                return null;
            }

            case 'kwai':
            case 'youtube':
            case 'facebook': {
                const { data } = await axios.get(`${siteUrl}/api/download/globalvideo`, {
                    params: { apikey: 'equipevipadm', url: link }
                });

                const info = data?.dados?.video_info;
                if (!data?.status || !info?.video_url) {
                    console.warn(`⚠️ Resposta inesperada da API ${plataforma}:`, data);
                    return null;
                }

                const m = info;
                const caption = [
                    `🎬 *${m.titulo || 'Sem título'}*`,
                    `⏱️ Duração: ${m.duration}s`,
                    `👀 Visualizações: ${m.view_count ?? 'N/A'}`,
                    `❤️ Curtidas: ${m.like_count ?? 'N/A'}`,
                ].join('\n');

                const fileName = `${plataforma}_${Date.now()}.mp4`;

                await sendMedia(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    'document',
                    'video/mp4',
                    caption,
                    m.video_url,
                    fileName
                );

                return true;
            }

            default:
                console.warn('⚠️ Plataforma não tratada:', plataforma);
                return null;
        }

    } catch (err) {
        console.error(`❌ Erro ao processar mídia ${plataforma}:`, err.message);
        return null;
    }
}

// Exportação da função principal e dos links permitidos (opcionalmente reutilizável)
module.exports = {
    processarAutoDownloader,
    LINKS_SUPORTADOS
};
