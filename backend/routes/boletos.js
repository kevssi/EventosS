
const express = require('express');
const router = express.Router();
const boletosController = require('../controllers/boletos');
const { authMiddleware } = require('../middleware/auth');

// Webhook MercadoPago (no requiere auth)
router.post('/webhook/mercadopago', boletosController.webhookMercadoPago);

// Webhook Stripe (no requiere auth ni express.json)
router.post('/webhook/stripe', boletosController.webhookStripe);

// Rutas públicas
router.get('/tipos/:id_evento', boletosController.listarTiposBoleto);
router.get('/detalle-qr', boletosController.detalleBoletoPorQR);
router.get('/detalle-publico/:id', boletosController.detalleBoletoPublico);
router.post('/verificar-disponibilidad', boletosController.verificarDisponibilidad);

// Rutas protegidas
router.post('/comprar', authMiddleware, boletosController.comprarBoletos);
router.post('/pago/mercadopago/preferencia', authMiddleware, boletosController.crearPreferenciaMercadoPago);
router.get('/pago/mercadopago/retorno', authMiddleware, boletosController.validarRetornoMercadoPago);
router.post('/pago/stripe/sesion', authMiddleware, boletosController.crearSesionStripe);
router.post('/pago/confirmar', authMiddleware, boletosController.confirmarPago);
router.get('/ordenes/:id_orden/verificar-pago', authMiddleware, boletosController.verificarPagoOrden);
router.get('/mis-boletos', authMiddleware, boletosController.misBoletos);
router.get('/detalle/:id', authMiddleware, boletosController.detalleBoleto);
router.post('/usar', authMiddleware, boletosController.usarBoleto);
router.get('/ordenes/listar', authMiddleware, boletosController.misOrdenes);
router.delete('/ordenes/:id/cancelar', authMiddleware, boletosController.cancelarOrden);

module.exports = router;
