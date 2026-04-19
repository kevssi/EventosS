require('dotenv').config();
console.log('🚀 Iniciando backend EventosS...');
const express = require('express');
const cors = require('cors');

const app = express();


// Middleware
app.use(cors({
  origin: [
    'https://eventos-s.vercel.app',
    'http://localhost:5000',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Webhook Stripe necesita body RAW antes de express.json
app.use('/api/boletos/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

// Servir archivos estáticos del frontend solo en desarrollo local
if (!process.env.VERCEL) {
  app.use(express.static('../frontend'));
}

// Rutas
const authRoutes = require('./routes/auth');
const eventosRoutes = require('./routes/eventos');
const boletosRoutes = require('./routes/boletos');
const reportesRoutes = require('./routes/reportes');
const adminRoutes = require('./routes/admin');

// Registro de rutas
app.use('/api/auth', authRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/boletos', boletosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/imagenes', require('./routes/imagenes.route'));

// Nueva ruta para subir imágenes a Cloudinary
const uploadRouter = require('./routes/upload');
app.use('/api/upload', uploadRouter);

// Ruta de bienvenida
app.get('/api', (req, res) => {
  res.json({
    message: 'API Sistema de Venta de Boletos',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      eventos: '/api/eventos',
      boletos: '/api/boletos',
      reportes: '/api/reportes',
      admin: '/api/admin'
    }
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

module.exports = app;

// Only start HTTP server when run directly (not when loaded as a serverless function)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✓ Servidor ejecutándose en puerto ${PORT}`);
    console.log(`✓ URL: http://localhost:${PORT}`);
  });

  // Manejo global de errores no capturados
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
  });
}
