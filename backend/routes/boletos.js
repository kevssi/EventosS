const express = require('express');
const router = express.Router();
const boletosController = require('../controllers/boletos');
const { authMiddleware } = require('../middleware/auth');

// Rutas públicas
router.get('/tipos/:id_evento', boletosController.listarTiposBoleto);
router.get('/detalle-qr', boletosController.detalleBoletoPorQR);
router.get('/detalle-publico/:id', boletosController.detalleBoletoPublico);
router.post('/verificar-disponibilidad', boletosController.verificarDisponibilidad);

// Rutas protegidas
router.post('/comprar', authMiddleware, boletosController.comprarBoletos);
router.post('/pago/mercadopago/preferencia', authMiddleware, boletosController.crearPreferenciaMercadoPago);
router.post('/pago/confirmar', authMiddleware, boletosController.confirmarPago);
router.get('/mis-boletos', authMiddleware, boletosController.misBoletos);
router.get('/detalle/:id', authMiddleware, boletosController.detalleBoleto);
router.post('/usar', authMiddleware, boletosController.usarBoleto);
router.get('/ordenes/listar', authMiddleware, boletosController.misOrdenes);
router.delete('/ordenes/:id/cancelar', authMiddleware, boletosController.cancelarOrden);

module.exports = router;
