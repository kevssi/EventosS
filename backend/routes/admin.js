const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Solicitud de organizador por parte del usuario autenticado
router.post('/solicitudes-organizador', authMiddleware, adminController.crearSolicitudOrganizador);
router.get('/solicitudes-organizador/mia', authMiddleware, adminController.obtenerMiSolicitudOrganizador);

// Gestion administrativa de solicitudes
router.get('/solicitudes-organizador', authMiddleware, requireAdmin, adminController.listarSolicitudesOrganizador);
router.post('/solicitudes-organizador/:id/aprobar', authMiddleware, requireAdmin, adminController.aprobarSolicitudOrganizador);
router.post('/solicitudes-organizador/:id/rechazar', authMiddleware, requireAdmin, adminController.rechazarSolicitudOrganizador);

// Gestion de administradores
router.get('/administradores', authMiddleware, requireAdmin, adminController.listarAdministradores);
router.post('/administradores', authMiddleware, requireAdmin, adminController.crearAdministrador);
router.put('/administradores/:id/password', authMiddleware, requireAdmin, adminController.cambiarPasswordAdministrador);

module.exports = router;
