const express = require('express');
const router = express.Router();
const eventosController = require('../controllers/eventos');
const { authMiddleware, requireOrganizadorOrAdmin, requireAdmin } = require('../middleware/auth');

// Rutas públicas
router.get('/categorias/listar', eventosController.listarCategorias);
router.get('/imagen-artista', eventosController.obtenerImagenArtista);
router.get('/mis-eventos/listar', authMiddleware, requireOrganizadorOrAdmin, eventosController.listarMisEventos);
router.get('/admin/pendientes', authMiddleware, requireAdmin, eventosController.listarEventosPendientes);
router.get('/', eventosController.listarEventos);
router.get('/:id', eventosController.obtenerEvento);

// Rutas protegidas
router.post('/', authMiddleware, requireOrganizadorOrAdmin, eventosController.crearEvento);
router.put('/:id', authMiddleware, requireOrganizadorOrAdmin, eventosController.actualizarEvento);
router.delete('/:id/cancelar', authMiddleware, requireOrganizadorOrAdmin, eventosController.cancelarEvento);
router.patch('/:id/estado', authMiddleware, requireAdmin, eventosController.cambiarEstadoEvento);

module.exports = router;
