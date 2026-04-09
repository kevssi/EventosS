const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const { authMiddleware } = require('../middleware/auth');

// Rutas públicas
router.post('/registrar', authController.registrar);
router.post('/login', authController.login);
router.get('/mercadopago/oauth/url', authController.obtenerUrlOAuthMercadoPago);
router.get('/mercadopago/oauth/iniciar', authController.iniciarOAuthMercadoPago);
router.get('/mercadopago/oauth/callback', authController.callbackOAuthMercadoPago);
router.post('/mercadopago/oauth/token', authController.intercambiarCodigoOAuthMercadoPago);

// Rutas protegidas
router.post('/logout', authMiddleware, authController.logout);
router.get('/perfil', authMiddleware, authController.obtenerPerfil);
router.put('/perfil', authMiddleware, authController.actualizarPerfil);
router.post('/mercadopago/oauth/token/guardar', authMiddleware, authController.guardarTokenOAuthMercadoPago);
router.post('/mercadopago/oauth/refresh', authMiddleware, authController.intercambiarRefreshTokenOAuthMercadoPago);
router.get('/mercadopago/oauth/token', authMiddleware, authController.obtenerEstadoTokenOAuthMercadoPago);
router.post('/mercadopago/oauth/vincular', authMiddleware, authController.vincularOAuthMercadoPago);

module.exports = router;
