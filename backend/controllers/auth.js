require('dotenv').config();
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const normalizeRole = (rol) => {
  const value = (rol ?? '').toString().trim().toLowerCase();

  if (value === '3' || value === 'administrador' || value === 'admin') {
    return 'administrador';
  }

  if (value === '2' || value === 'organizador') {
    return 'organizador';
  }

  if (value === '1' || value === 'usuario') {
    return 'usuario';
  }

  return value || 'usuario';
};

const resolveUserRoleColumn = async (connection) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME IN ('rol', 'id_rol', 'rol_id')
     ORDER BY FIELD(COLUMN_NAME, 'id_rol', 'rol_id', 'rol')
     LIMIT 1`
  );

  return rows[0]?.COLUMN_NAME || null;
};

const getRoleRawValue = (usuario = {}) => (
  usuario.id_rol
  ?? usuario.rol_id
  ?? usuario.rol
  ?? usuario.role_value
  ?? null
);

// Registrar usuario
exports.registrar = async (req, res) => {
  const { nombre, email, password, telefono } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const connection = await pool.getConnection();
    let resultado;

    try {
      [resultado] = await connection.query(
        'CALL sp_registrar_usuario(?, ?, ?, ?)',
        [nombre, email, hashedPassword, telefono || null]
      );
    } finally {
      await connection.release();
    }

    if (resultado[0][0].resultado !== 'ok') {
      return res.status(400).json({
        success: false,
        message: resultado[0][0].mensaje
      });
    }

    let idUsuario = Number(resultado[0][0].id_usuario);

    // Tomamos el usuario real desde BD para evitar inconsistencias de SP en id_usuario.
    let usuario = null;
    try {
      const connUser = await pool.getConnection();
      try {
        const roleColumn = await resolveUserRoleColumn(connUser);
        const query = roleColumn
          ? `SELECT id, nombre, email, telefono, ${roleColumn} AS role_value FROM usuarios WHERE email = ? LIMIT 1`
          : 'SELECT id, nombre, email, telefono FROM usuarios WHERE email = ? LIMIT 1';

        const [rows] = await connUser.query(query, [email]);
        usuario = rows?.[0] || null;
      } finally {
        await connUser.release();
      }
    } catch (userFetchError) {
      console.warn('Aviso en registrar: no se pudo obtener usuario por email:', userFetchError.message);
    }

    if (usuario?.id) {
      idUsuario = Number(usuario.id);
    }

    if (!usuario) {
      usuario = {
        id: Number.isNaN(idUsuario) ? null : idUsuario,
        nombre,
        email,
        telefono: telefono || null,
        id_rol: 1
      };
    }

    const rawRole = getRoleRawValue(usuario);
    const rolNormalizado = normalizeRole(rawRole);

    const token = jwt.sign(
      {
        id: idUsuario,
        email: usuario?.email || email,
        nombre: usuario?.nombre || nombre,
        rol: rolNormalizado,
        rol_id: Number.isNaN(Number(rawRole)) ? null : Number(rawRole)
      },
      process.env.JWT_SECRET || 'mi_super_secreto_eventos_2026',
      { expiresIn: 86400 }
    );

    try {
      const connSesion = await pool.getConnection();
      try {
        await connSesion.query(
          'CALL sp_guardar_sesion(?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
          [idUsuario, token, req.ip || '127.0.0.1']
        );
      } finally {
        await connSesion.release();
      }
    } catch (sessionError) {
      console.warn('Aviso en registrar: no se pudo guardar sesion en BD:', sessionError.message);
    }

    return res.status(201).json({
      success: true,
      message: resultado[0][0].mensaje,
      id_usuario: idUsuario,
      token,
      usuario: {
        id: idUsuario,
        nombre: usuario?.nombre || nombre,
        email: usuario?.email || email,
        rol: rolNormalizado,
        rol_id: Number.isNaN(Number(rawRole)) ? null : Number(rawRole),
        telefono: usuario?.telefono || telefono || null
      }
    });
  } catch (error) {
    console.error('Error en registrar:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// Iniciar sesión
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_iniciar_sesion(?)',
      [email]
    );

    await connection.release();

    const usuario = resultado[0][0];

    if (!usuario) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const rawRole = getRoleRawValue(usuario);
    const rolNormalizado = normalizeRole(rawRole);

    // Generar token
    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: rolNormalizado,
        rol_id: Number.isNaN(Number(rawRole)) ? null : Number(rawRole)
      },
      process.env.JWT_SECRET || 'mi_super_secreto_eventos_2026',
      { expiresIn: 86400 }
    );

    // Guardar sesión en BD
    const connSesion = await pool.getConnection();
    await connSesion.query(
      'CALL sp_guardar_sesion(?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [usuario.id, token, req.ip || '127.0.0.1']
    );
    await connSesion.release();

    res.json({
      success: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: rolNormalizado,
        rol_id: Number.isNaN(Number(rawRole)) ? null : Number(rawRole),
        telefono: usuario.telefono
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Cerrar sesión
exports.logout = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(400).json({ error: 'Token no proporcionado' });
  }

  try {
    const connection = await pool.getConnection();
    await connection.query('CALL sp_cerrar_sesion(?)', [token]);
    await connection.release();

    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
};

// Obtener perfil actual (rol sincronizado desde BD)
exports.obtenerPerfil = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const roleColumn = await resolveUserRoleColumn(connection);

    const query = roleColumn
      ? `SELECT id, nombre, email, telefono, ${roleColumn} AS role_value FROM usuarios WHERE id = ? LIMIT 1`
      : 'SELECT id, nombre, email, telefono FROM usuarios WHERE id = ? LIMIT 1';

    const [rows] = await connection.query(query, [req.user.id]);
    await connection.release();

    const usuario = rows?.[0];
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const rawRole = getRoleRawValue(usuario);
    const rolNormalizado = normalizeRole(rawRole);

    return res.json({
      success: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono,
        rol: rolNormalizado,
        rol_id: Number.isNaN(Number(rawRole)) ? null : Number(rawRole)
      }
    });
  } catch (error) {
    console.error('Error en obtenerPerfil:', error);
    return res.status(500).json({ error: 'Error al obtener perfil' });
  }
};

const resolverClientIdMercadoPago = (inputClientId) => (
  inputClientId
  || process.env.MERCADOPAGO_OAUTH_CLIENT_ID
  || process.env.APP_ID
  || process.env.CLIENT_ID
);

const resolverRedirectUriMercadoPago = (inputRedirectUri, req) => {
  if (inputRedirectUri) return inputRedirectUri;
  if (process.env.MERCADOPAGO_OAUTH_REDIRECT_URI) return process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;

  const appBaseUrl = process.env.APP_BASE_URL;
  if (appBaseUrl) {
    return `${appBaseUrl.replace(/\/$/, '')}/pages/mercadopago-callback.html`;
  }

  if (req) {
    return `${req.protocol}://${req.get('host')}/pages/mercadopago-callback.html`;
  }

  return null;
};

const construirUrlOAuthMercadoPago = ({
  state,
  codeChallenge,
  codeChallengeMethod,
  clientId,
  redirectUri
}) => {
  if (!clientId) {
    throw new Error('Falta configurar client_id de Mercado Pago (MERCADOPAGO_OAUTH_CLIENT_ID o APP_ID).');
  }

  if (!redirectUri) {
    throw new Error('Falta redirect_uri de Mercado Pago (MERCADOPAGO_OAUTH_REDIRECT_URI).');
  }

  const finalState = state || crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: finalState,
    redirect_uri: redirectUri
  });

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', codeChallengeMethod || 'S256');
  }

  return {
    url: `https://auth.mercadopago.com/authorization?${params.toString()}`,
    state: finalState
  };
};

// Genera la URL OAuth de Mercado Pago sin afectar el resto del sistema
exports.obtenerUrlOAuthMercadoPago = async (req, res) => {
  try {
    const { state, code_challenge, code_challenge_method, client_id, redirect_uri } = req.query;
    const resolvedClientId = resolverClientIdMercadoPago(client_id);
    const resolvedRedirectUri = resolverRedirectUriMercadoPago(redirect_uri, req);

    const data = construirUrlOAuthMercadoPago({
      state,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      clientId: resolvedClientId,
      redirectUri: resolvedRedirectUri
    });

    res.json({
      success: true,
      authorization_url: data.url,
      state: data.state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'No se pudo construir la URL de autorizacion'
    });
  }
};

// Redirecciona directamente a Mercado Pago para autorizar
exports.iniciarOAuthMercadoPago = async (req, res) => {
  try {
    const { state, code_challenge, code_challenge_method, client_id, redirect_uri } = req.query;
    const resolvedClientId = resolverClientIdMercadoPago(client_id);
    const resolvedRedirectUri = resolverRedirectUriMercadoPago(redirect_uri, req);

    const data = construirUrlOAuthMercadoPago({
      state,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      clientId: resolvedClientId,
      redirectUri: resolvedRedirectUri
    });

    res.redirect(data.url);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'No se pudo iniciar autorizacion OAuth'
    });
  }
};

// Callback OAuth: devuelve code/state para posterior intercambio por access_token
exports.callbackOAuthMercadoPago = async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({
      success: false,
      error,
      error_description: error_description || 'Autorizacion rechazada'
    });
  }

  res.json({
    success: true,
    code: code || null,
    state: state || null,
    message: 'Callback recibido. Intercambia este code por access_token en tu backend.'
  });
};

// Intercambia code OAuth por access_token (equivalente a OAuthCreateRequest del SDK)
exports.intercambiarCodigoOAuthMercadoPago = async (req, res) => {
  const {
    code,
    redirect_uri,
    code_verifier,
    client_id,
    client_secret
  } = req.body;

  const clientId = resolverClientIdMercadoPago(client_id);
  const clientSecret = client_secret || process.env.MERCADOPAGO_OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const defaultRedirectUri = resolverRedirectUriMercadoPago(redirect_uri, req);

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      success: false,
      error: 'Falta configurar MERCADOPAGO_OAUTH_CLIENT_ID o MERCADOPAGO_OAUTH_CLIENT_SECRET'
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'El parametro code es requerido'
    });
  }

  const payload = {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: defaultRedirectUri
  };

  if (code_verifier) {
    payload.code_verifier = code_verifier;
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(502).json({
        success: false,
        error: mpData?.message || 'No se pudo intercambiar el code por token',
        details: mpData
      });
    }

    res.json({
      success: true,
      access_token: mpData.access_token,
      token_type: mpData.token_type,
      expires_in: mpData.expires_in,
      scope: mpData.scope,
      user_id: mpData.user_id,
      refresh_token: mpData.refresh_token,
      live_mode: mpData.live_mode
    });
  } catch (error) {
    console.error('Error en intercambiarCodigoOAuthMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar OAuth token en Mercado Pago'
    });
  }
};

const asegurarTablaTokensMercadoPago = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mercadopago_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_usuario INT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NULL,
      token_type VARCHAR(40) NULL,
      scope VARCHAR(255) NULL,
      expires_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

const guardarTokenMercadoPagoUsuario = async ({
  idUsuario,
  accessToken,
  refreshToken,
  tokenType,
  scope,
  expiresIn
}) => {
  const connection = await pool.getConnection();

  try {
    await asegurarTablaTokensMercadoPago(connection);

    const expiresAt = Number.isFinite(Number(expiresIn))
      ? new Date(Date.now() + Number(expiresIn) * 1000)
      : null;

    await connection.query(
      `
        INSERT INTO mercadopago_tokens (
          id_usuario,
          access_token,
          refresh_token,
          token_type,
          scope,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          access_token = VALUES(access_token),
          refresh_token = VALUES(refresh_token),
          token_type = VALUES(token_type),
          scope = VALUES(scope),
          expires_at = VALUES(expires_at)
      `,
      [
        idUsuario,
        accessToken,
        refreshToken || null,
        tokenType || null,
        scope || null,
        expiresAt
      ]
    );
  } finally {
    await connection.release();
  }
};

const obtenerTokenMercadoPagoUsuario = async (idUsuario) => {
  const connection = await pool.getConnection();

  try {
    await asegurarTablaTokensMercadoPago(connection);
    const [rows] = await connection.query(
      `
        SELECT id_usuario, access_token, refresh_token, token_type, scope, expires_at, updated_at
        FROM mercadopago_tokens
        WHERE id_usuario = ?
        LIMIT 1
      `,
      [idUsuario]
    );

    return rows[0] || null;
  } finally {
    await connection.release();
  }
};

// Guarda manualmente tokens OAuth de Mercado Pago para el usuario autenticado
exports.guardarTokenOAuthMercadoPago = async (req, res) => {
  const {
    access_token,
    refresh_token,
    token_type,
    scope,
    expires_in
  } = req.body;

  if (!access_token) {
    return res.status(400).json({
      success: false,
      error: 'access_token es requerido'
    });
  }

  try {
    await guardarTokenMercadoPagoUsuario({
      idUsuario: req.user.id,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenType: token_type,
      scope,
      expiresIn: expires_in
    });

    res.json({
      success: true,
      message: 'Token de Mercado Pago guardado correctamente'
    });
  } catch (error) {
    console.error('Error en guardarTokenOAuthMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo guardar el token de Mercado Pago'
    });
  }
};

// Refresca token OAuth de Mercado Pago y lo guarda para el usuario autenticado
exports.intercambiarRefreshTokenOAuthMercadoPago = async (req, res) => {
  const { refresh_token, client_id, client_secret } = req.body;
  const clientId = resolverClientIdMercadoPago(client_id);
  const clientSecret = client_secret || process.env.MERCADOPAGO_OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      success: false,
      error: 'Falta configurar MERCADOPAGO_OAUTH_CLIENT_ID o MERCADOPAGO_OAUTH_CLIENT_SECRET'
    });
  }

  try {
    const tokenGuardado = await obtenerTokenMercadoPagoUsuario(req.user.id);
    const refreshToken = refresh_token || tokenGuardado?.refresh_token;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'No hay refresh_token disponible para este usuario'
      });
    }

    const mpResponse = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      })
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(502).json({
        success: false,
        error: mpData?.message || 'No se pudo refrescar el token',
        details: mpData
      });
    }

    await guardarTokenMercadoPagoUsuario({
      idUsuario: req.user.id,
      accessToken: mpData.access_token,
      refreshToken: mpData.refresh_token,
      tokenType: mpData.token_type,
      scope: mpData.scope,
      expiresIn: mpData.expires_in
    });

    res.json({
      success: true,
      access_token: mpData.access_token,
      refresh_token: mpData.refresh_token,
      token_type: mpData.token_type,
      expires_in: mpData.expires_in,
      scope: mpData.scope,
      user_id: mpData.user_id,
      live_mode: mpData.live_mode
    });
  } catch (error) {
    console.error('Error en intercambiarRefreshTokenOAuthMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'Error al refrescar token de Mercado Pago'
    });
  }
};

// Estado del token OAuth guardado para el usuario autenticado
exports.obtenerEstadoTokenOAuthMercadoPago = async (req, res) => {
  try {
    const tokenGuardado = await obtenerTokenMercadoPagoUsuario(req.user.id);

    if (!tokenGuardado) {
      return res.json({
        success: true,
        vinculado: false
      });
    }

    res.json({
      success: true,
      vinculado: true,
      token_type: tokenGuardado.token_type,
      scope: tokenGuardado.scope,
      expires_at: tokenGuardado.expires_at,
      updated_at: tokenGuardado.updated_at,
      access_token_preview: `${String(tokenGuardado.access_token).slice(0, 8)}...`,
      has_refresh_token: Boolean(tokenGuardado.refresh_token)
    });
  } catch (error) {
    console.error('Error en obtenerEstadoTokenOAuthMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo obtener el estado del token'
    });
  }
};

// Vincula OAuth (code -> token -> guardar) en un solo paso para el usuario autenticado
exports.vincularOAuthMercadoPago = async (req, res) => {
  const {
    code,
    redirect_uri,
    code_verifier,
    client_id,
    client_secret
  } = req.body;

  const clientId = resolverClientIdMercadoPago(client_id);
  const clientSecret = client_secret || process.env.MERCADOPAGO_OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const defaultRedirectUri = resolverRedirectUriMercadoPago(redirect_uri, req);

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      success: false,
      error: 'Falta configurar MERCADOPAGO_OAUTH_CLIENT_ID o MERCADOPAGO_OAUTH_CLIENT_SECRET'
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'El parametro code es requerido'
    });
  }

  const payload = {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: defaultRedirectUri
  };

  if (code_verifier) {
    payload.code_verifier = code_verifier;
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(502).json({
        success: false,
        error: mpData?.message || 'No se pudo intercambiar el code por token',
        details: mpData
      });
    }

    await guardarTokenMercadoPagoUsuario({
      idUsuario: req.user.id,
      accessToken: mpData.access_token,
      refreshToken: mpData.refresh_token,
      tokenType: mpData.token_type,
      scope: mpData.scope,
      expiresIn: mpData.expires_in
    });

    res.json({
      success: true,
      message: 'Mercado Pago vinculado correctamente',
      scope: mpData.scope,
      expires_in: mpData.expires_in,
      has_refresh_token: Boolean(mpData.refresh_token)
    });
  } catch (error) {
    console.error('Error en vincularOAuthMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo vincular Mercado Pago'
    });
  }
};
