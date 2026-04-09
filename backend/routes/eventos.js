const express = require('express');
const router = express.Router();
const eventosController = require('../controllers/eventos');
const { authMiddleware, requireOrganizadorOrAdmin } = require('../middleware/auth');

// Rutas públicas
router.get('/categorias/listar', eventosController.listarCategorias);
router.get('/imagen-artista', eventosController.obtenerImagenArtista);
router.get('/', eventosController.listarEventos);
router.get('/:id', eventosController.obtenerEvento);

// Rutas protegidas
router.post('/', authMiddleware, requireOrganizadorOrAdmin, eventosController.crearEvento);
router.put('/:id', authMiddleware, requireOrganizadorOrAdmin, eventosController.actualizarEvento);
router.delete('/:id/cancelar', authMiddleware, requireOrganizadorOrAdmin, eventosController.cancelarEvento);

module.exports = router;
