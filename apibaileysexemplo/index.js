require('./loadEnv')();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { restoreInstances, syncRegisteredInstances } = require('./sessions/sessionManager');
const { initDb } = require('./db');

const app = express();

// Configurações de middleware mais robustas
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-instance-key']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware de log para debug
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Status endpoint para verificar instâncias
app.get('/status', async (req, res) => {
  try {
    const { listInstances } = require('./sessions/sessionManager');
    const instances = await listInstances();
    res.json({
      status: 'running',
      instances: instances.length,
      details: instances
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', routes);
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/README.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'README.md'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🚀 Iniciando servidor Baileys API...');

    // Inicializar banco de dados
    console.log('📦 Inicializando storage...');
    await initDb();
    console.log('✅ Storage inicializado');

    // Aguardar um pouco antes de restaurar instâncias
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restaurar instâncias existentes
    console.log('🔄 Restaurando instâncias...');
    try {
      await restoreInstances();
      console.log('✅ Instâncias restauradas');
    } catch (err) {
      console.warn('⚠️ Erro ao restaurar instâncias:', err.message);
    }

    // Sincronizar instâncias registradas
    console.log('🔄 Sincronizando instâncias registradas...');
    try {
      await syncRegisteredInstances();
      console.log('✅ Instâncias sincronizadas');
    } catch (err) {
      console.warn('⚠️ Erro ao sincronizar instâncias:', err.message);
    }

    // Iniciar servidor HTTP
    const server = app.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Status: http://localhost:${PORT}/status`);
    });

    // Graceful shutdown melhorado
    let isShuttingDown = false;

    async function gracefulShutdown(signal) {
      if (isShuttingDown) {
        console.log('⚠️ Shutdown já em andamento...');
        return;
      }

      isShuttingDown = true;
      console.log(`🛑 Recebido ${signal}, iniciando shutdown graceful...`);

      // Parar de aceitar novas conexões
      server.close(async () => {
        try {
          console.log('📡 Servidor HTTP fechado');

          // Importar e executar shutdown das instâncias WhatsApp
          const { shutdownAllInstances } = require('./sessions/sessionManager');
          await shutdownAllInstances();

          console.log('✅ Shutdown graceful concluído');
          process.exit(0);
        } catch (err) {
          console.error('❌ Erro durante shutdown:', err.message);
          process.exit(1);
        }
      });

      // Forçar encerramento após 15 segundos
      setTimeout(() => {
        console.error('⏰ Timeout no shutdown graceful, forçando encerramento...');
        process.exit(1);
      }, 15000);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err) {
    console.error('❌ Falha ao iniciar servidor:', err);
    process.exit(1);
  }
}

// Capturar erros não tratados
process.on('uncaughtException', (err) => {
  console.error('❌ Exceção não capturada:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  console.error('Promise:', promise);
});

startServer();
