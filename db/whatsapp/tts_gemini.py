tts_gemini.py - usando gtts como fallback gratuito

from gtts import gTTS import sys import json import os

def gerar_audio(texto, filename="saida_gtts.mp3"): tts = gTTS(text=texto, lang='pt-br') tts.save(filename) print(json.dumps({"file": os.path.abspath(filename)}))

if name == "main": try: if len(sys.argv) > 1: dados = json.loads(sys.argv[1]) texto = dados.get("text", "Olá, tudo bem?") gerar_audio(texto) else: gerar_audio("Olá Douglas, esta é uma voz alternativa charmosa usando gTTS!") except Exception as e: print(json.dumps({"error": str(e)}))

