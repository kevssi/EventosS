const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.get('/evento/:id_evento', authMiddleware, reportesController.reporteVentasEvento);
router.get('/admin/general', authMiddleware, requireAdmin, reportesController.reporteGeneralAdmin);
router.get('/admin/usuarios', authMiddleware, requireAdmin, reportesController.listarUsuarios);
router.post('/admin/desactivar-usuario', authMiddleware, requireAdmin, reportesController.desactivarUsuario);
router.delete('/admin/usuarios/:id_usuario', authMiddleware, requireAdmin, reportesController.eliminarUsuario);

module.exports = router;
