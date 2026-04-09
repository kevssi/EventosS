require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static('../frontend'));

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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✓ Servidor ejecutándose en puerto ${PORT}`);
  console.log(`✓ URL: http://localhost:${PORT}`);
});
