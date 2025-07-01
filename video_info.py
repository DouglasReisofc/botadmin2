import os
import sys
import json

def obter_informacoes_video(id_unico):
    """Obtém as informações do vídeo usando o ID único e retorna essas informações em formato JSON."""
    try:
        # Caminho do arquivo JSON onde as informações dos vídeos são armazenadas
        arquivo_json = 'videos.json'

        if not os.path.exists(arquivo_json):
            raise FileNotFoundError(f"Arquivo JSON {arquivo_json} não encontrado.")

        # Tenta carregar os dados existentes do arquivo JSON
        with open(arquivo_json, 'r') as f:
            dados_existentes = json.load(f)

        # Verificar se o ID único existe nos dados
        if id_unico not in dados_existentes:
            raise KeyError(f"ID {id_unico} não encontrado nos dados.")

        # Recuperar as informações associadas ao ID único
        video_info = dados_existentes[id_unico]

        # Retorna as informações do vídeo em formato JSON
        return json.dumps({
            'status': 'success',
            'video_info': video_info
        })

    except Exception as e:
        # Caso haja algum erro, retorna uma resposta de erro
        return json.dumps({
            'status': 'error',
            'message': str(e)
        })

if __name__ == "__main__":
    # O ID único do vídeo será passado como argumento
    id_unico = sys.argv[1]

    # Obter as informações do vídeo com o ID único
    result = obter_informacoes_video(id_unico)
    print(result)  # Retorna as informações do vídeo em formato JSON
