const express = require('express');
const multer = require('multer');
const { subirImagen, eliminarImagen } = require('../controllers/imagenes');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({});
const upload = multer({ storage });

// Subir imagen (requiere autenticación)
router.post('/upload', authMiddleware, upload.single('imagen'), subirImagen);

// Eliminar imagen (requiere autenticación)
router.post('/delete', authMiddleware, eliminarImagen);

module.exports = router;
