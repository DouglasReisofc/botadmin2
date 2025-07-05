# 🚀 Baileys API - Versão Melhorada

Uma API robusta e confiável para WhatsApp usando a biblioteca Baileys, com melhorias significativas em estabilidade, reconexão e gerenciamento de sessões.

## ✨ Principais Melhorias

### 🔄 Gerenciamento de Conexão Aprimorado
- **Reconexão Inteligente**: Sistema de reconexão com backoff exponencial
- **Monitoramento de Saúde**: Verificação contínua do status da conexão
- **Limpeza Automática**: Remoção automática de sessões corrompidas
- **Timeout Configurável**: Timeouts ajustáveis para diferentes cenários

### 📱 Sistema de Pareamento Robusto
- **Retry Automático**: Tentativas automáticas em caso de falha
- **Validação de Código**: Validação rigorosa dos códigos de pareamento
- **Formatação Inteligente**: Formatação automática dos códigos (XXXX-XXXX)
- **Detecção de Expiração**: Verificação automática de códigos expirados

### 💬 Envio de Mensagens Confiável
- **Retry com Backoff**: Sistema de retry inteligente para mensagens
- **Validação de Entrada**: Validação completa dos dados de entrada
- **Verificação de Conexão**: Verificação de conexão antes do envio
- **Suporte a Mídia**: Melhor suporte para diferentes tipos de mídia

### 📊 Sistema de Logging Avançado
- **Logs Estruturados**: Logs em formato JSON para melhor análise
- **Categorização**: Logs separados por tipo (conexão, mensagens, erros)
- **Rotação Automática**: Limpeza automática de logs antigos
- **Debug Detalhado**: Modo debug para desenvolvimento

## 🛠️ Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente (opcional)
cp .env.example .env

# Iniciar o servidor
npm start
```

## 📋 Configuração

As configurações estão centralizadas no arquivo `config/settings.js`:

```javascript
const { settings, getSetting, setSetting } = require('./config/settings');

// Obter configuração
const timeout = getSetting('connection.connectTimeoutMs');

// Definir configuração
setSetting('connection.maxReconnectAttempts', 10);
```

### Principais Configurações

- **connection.maxReconnectAttempts**: Máximo de tentativas de reconexão (padrão: 5)
- **connection.reconnectBaseDelay**: Delay base para reconexão (padrão: 1000ms)
- **messaging.maxRetryAttempts**: Tentativas de retry para mensagens (padrão: 2)
- **messaging.maxFileSize**: Tamanho máximo de arquivo (padrão: 64MB)

## 🔌 Endpoints da API

### Gerenciamento de Instâncias

#### Criar Instância
```http
POST /api/instance
Content-Type: application/json
x-api-key: YOUR_API_KEY

{
  "name": "instance_name",
  "webhook": "https://your-webhook.com/endpoint",
  "apiKey": "instance_api_key"
}
```

#### Obter Status da Instância
```http
GET /api/instance/{instance_name}/status
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY
```

#### Gerar QR Code ou Código de Pareamento
```http
POST /api/instance/{instance_name}/pair?mode=pair
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY

{
  "number": "5511999999999"
}
```

#### Reiniciar Instância
```http
POST /api/instance/{instance_name}/restart
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY
```

#### Deletar Instância
```http
DELETE /api/instance/{instance_name}
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY
```

### Envio de Mensagens

#### Enviar Mensagem de Texto
```http
POST /api/message
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY

{
  "instance": "instance_name",
  "number": "5511999999999",
  "message": "Olá! Esta é uma mensagem de teste.",
  "ghost": false,
  "quotedId": "optional_message_id"
}
```

#### Enviar Mídia
```http
POST /api/message/media
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY

{
  "instance": "instance_name",
  "number": "5511999999999",
  "caption": "Legenda da mídia",
  "media": "base64_encoded_media",
  "mimetype": "image/jpeg",
  "ghost": false,
  "quotedId": "optional_message_id"
}
```

#### Enviar Enquete
```http
POST /api/message/poll
x-api-key: YOUR_API_KEY
x-instance-key: INSTANCE_KEY

{
  "instance": "instance_name",
  "number": "5511999999999",
  "question": "Qual sua cor favorita?",
  "options": ["Azul", "Verde", "Vermelho", "Amarelo"],
  "multiple": false
}
```

### Monitoramento

#### Health Check
```http
GET /health
```

#### Status do Servidor
```http
GET /status
```

## 🔧 Recursos Avançados

### Sistema de Retry Inteligente

O sistema implementa retry com backoff exponencial:

```javascript
const retryHandler = require('./utils/retryHandler');

// Retry para código de pareamento
const code = await retryHandler.retryPairingCode(
  async (number) => await sock.requestPairingCode(number),
  phoneNumber,
  { maxAttempts: 3, baseDelay: 2000 }
);

// Retry para envio de mensagem
const result = await retryHandler.retryMessageSend(
  async () => await sock.sendMessage(jid, content),
  { maxAttempts: 2, baseDelay: 1000 }
);
```

### Gerenciamento de Conexão

```javascript
const connectionManager = require('./utils/connectionManager');

// Verificar saúde da conexão
const health = connectionManager.getConnectionHealth(sock);

// Aguardar conexão
await connectionManager.waitForConnection(sock, 10000);

// Gerenciar reconexão
await connectionManager.handleReconnection(instanceName, restartFunction);
```

### Logging Avançado

```javascript
const { logger } = require('./utils/logger');

// Log de conexão
logger.connection('instance_name', 'connected', { user: userInfo });

// Log de mensagem
logger.message('instance_name', 'sent', 'target_number', 'text', true);

// Log de código de pareamento
logger.pairCode('instance_name', 'phone_number', 'XXXX-XXXX', true);
```

## 🐛 Solução de Problemas

### Problemas Comuns

1. **Instância não conecta**
   - Verifique se o número está correto
   - Confirme se o código de pareamento foi inserido
   - Verifique os logs em `logs/connections.log`

2. **Mensagens não são enviadas**
   - Verifique se a instância está conectada
   - Confirme se o número de destino é válido
   - Verifique os logs em `logs/messages.log`

3. **Reconexão constante**
   - Verifique a estabilidade da internet
   - Confirme se não há múltiplas instâncias com o mesmo número
   - Verifique os logs de erro em `logs/error.log`

### Logs Disponíveis

- `logs/app.log` - Logs gerais da aplicação
- `logs/error.log` - Logs de erro
- `logs/connections.log` - Logs de conexão
- `logs/messages.log` - Logs de mensagens
- `logs/pairing.log` - Logs de pareamento
- `logs/debug.log` - Logs de debug (apenas em modo desenvolvimento)

## 📈 Monitoramento

### Métricas Disponíveis

O endpoint `/status` fornece informações detalhadas:

```json
{
  "status": "running",
  "instances": 3,
  "details": [
    {
      "name": "instance1",
      "status": "open",
      "connected": true,
      "number": "5511999999999"
    }
  ]
}
```

### Health Check

O endpoint `/health` fornece informações básicas do servidor:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 50000000,
    "heapTotal": 30000000,
    "heapUsed": 20000000
  }
}
```

## 🔒 Segurança

- **Autenticação por API Key**: Todas as requisições requerem chave de API
- **Validação de Entrada**: Validação rigorosa de todos os parâmetros
- **Sanitização**: Limpeza automática de dados de entrada
- **Rate Limiting**: Controle de taxa de requisições (configurável)

## 🚀 Performance

- **Conexões Persistentes**: Reutilização de conexões WebSocket
- **Cache Inteligente**: Cache de mensagens e contatos
- **Cleanup Automático**: Limpeza automática de recursos não utilizados
- **Otimização de Memória**: Gerenciamento eficiente de memória

## 📝 Changelog

### v2.0.0 - Melhorias Principais
- ✅ Sistema de reconexão inteligente
- ✅ Retry automático para mensagens
- ✅ Logging estruturado
- ✅ Validação robusta de entrada
- ✅ Configurações centralizadas
- ✅ Melhor tratamento de erros
- ✅ Health checks e monitoramento
- ✅ Cleanup automático de sessões

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🆘 Suporte

Para suporte, abra uma issue no GitHub ou entre em contato através dos canais oficiais.

---

**Desenvolvido com ❤️ para a comunidade brasileira**
