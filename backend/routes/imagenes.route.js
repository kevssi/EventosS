const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { subirImagen, eliminarImagen } = require('../controllers/imagenes');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../../frontend/publi/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
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
