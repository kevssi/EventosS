const express = require('express');
const multer = require('multer');
const { subirImagen, eliminarImagen } = require('../controllers/imagenes');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Usar memoria en lugar de disco (compatible con Vercel serverless)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Solo se permiten imagenes'));
    cb(null, true);
  }
});

// Subir imagen (requiere autenticación)
router.post('/upload', authMiddleware, upload.single('imagen'), subirImagen);

// Eliminar imagen (requiere autenticación)
router.post('/delete', authMiddleware, eliminarImagen);

module.exports = router;
