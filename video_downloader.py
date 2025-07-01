import yt_dlp
import os
import sys
import json
import uuid
from datetime import datetime

# Arquivos de cookies
yt_cookies_file = 'ytcookies.txt'
insta_cookies_file = 'instacookies.txt'

def gerar_id_unico():
    return str(uuid.uuid4())

def salvar_dados_video(url, info, id_unico, pasta_downloads):
    video_url = f"https://botadmin.shop/api/play/{id_unico}"
    caminho_arquivo = os.path.join(pasta_downloads, f"{id_unico}.mp4")

    dados_video = {
        'id': id_unico,
        'url': url,
        'data': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'titulo': info.get('title', 'Desconhecido'),
        'descricao': info.get('description', ''),
        'uploader': info.get('uploader', ''),
        'thumbnail': info.get('thumbnail', ''),
        'duration': info.get('duration', 0),
        'view_count': info.get('view_count', 0),
        'like_count': info.get('like_count', 0),
        'video_url': video_url,
        'file_path': caminho_arquivo
    }

    arquivo_json = 'videos.json'
    dados_existentes = {}

    if os.path.exists(arquivo_json):
        try:
            with open(arquivo_json, 'r') as f:
                dados_existentes = json.load(f)
        except Exception as e:
            sys.stderr.write(f"Erro ao ler JSON: {str(e)}\n")

    dados_existentes[id_unico] = dados_video

    try:
        with open(arquivo_json, 'w') as f:
            json.dump(dados_existentes, f, indent=4)
    except Exception as e:
        sys.stderr.write(f"Erro ao salvar JSON: {str(e)}\n")

def verificar_cookies(cookies_file):
    """Função para verificar se o arquivo de cookies existe e é legível."""
    if not os.path.exists(cookies_file):
        sys.stderr.write(f"Arquivo de cookies não encontrado: {cookies_file}\n")
        return False
    
    try:
        with open(cookies_file, 'r') as f:
            cookies = f.read()
        if cookies:
            sys.stderr.write(f"Cookies carregados com sucesso de {cookies_file}.\n")
            return True
    except Exception as e:
        sys.stderr.write(f"Erro ao ler o arquivo de cookies: {str(e)}\n")
    
    return False

def baixar_video(url, pasta_downloads='tmp'):
    try:
        if not os.path.exists(pasta_downloads):
            os.makedirs(pasta_downloads)

        id_unico = gerar_id_unico()

        # Configuração padrão
        # "bestvideo*+bestaudio/best" seleciona a melhor combinação de
        # vídeo e áudio disponível. Mantemos a saída silenciosa para não
        # interferir no código Node.
        ydl_opts = {
            # Captura o melhor vídeo e áudio disponíveis,
            # mesclando-os em MP4 quando necessário
            'format': 'bestvideo*+bestaudio/best',
            'outtmpl': os.path.join(pasta_downloads, f'{id_unico}.mp4'),
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'noprogress': True
        }

        # Verifica se é um link do YouTube
        if 'youtube' in url or 'youtu.be' in url:
            sys.stderr.write(f"Link do YouTube detectado: {url}\n")
            if verificar_cookies(yt_cookies_file):
                ydl_opts['cookiefile'] = yt_cookies_file
            else:
                sys.stderr.write("Erro: Não foi possível carregar os cookies do YouTube.\n")
                return None

        # Verifica se é um link do Instagram
        elif 'instagram.com' in url:
            sys.stderr.write(f"Link do Instagram detectado: {url}\n")
            if verificar_cookies(insta_cookies_file):
                ydl_opts['cookiefile'] = insta_cookies_file
            else:
                sys.stderr.write("Erro: Não foi possível carregar os cookies do Instagram.\n")
                return None

        # Inicializa o yt-dlp com as opções definidas
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            sys.stderr.write("Iniciando download...\n")
            info = ydl.extract_info(url, download=True)
            salvar_dados_video(url, info, id_unico, pasta_downloads)
            sys.stderr.write(f"Download concluído! ID único do vídeo: {id_unico}\n")
            return id_unico

    except Exception as e:
        sys.stderr.write(f"Erro no download: {str(e)}\n")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("URL não fornecida\n")
        sys.exit(1)

    url = sys.argv[1]
    resultado = baixar_video(url)
    if resultado:
        print(resultado, flush=True)
        sys.exit(0)
    else:
        sys.exit(1)
