// --- STRIPE INTEGRACIÓN ---
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Crear sesión de Stripe Checkout
exports.crearSesionStripe = async (req, res) => {
  try {
    const { ordenes = [], evento_titulo } = req.body;
    if (!Array.isArray(ordenes) || ordenes.length === 0) {
      return res.status(400).json({ success: false, error: 'Debes enviar al menos una orden para pagar' });
    }

    const items = ordenes.map((orden, idx) => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: evento_titulo ? `${evento_titulo} - Orden #${orden.id_orden || idx + 1}` : `Boletos - Orden #${orden.id_orden || idx + 1}`
        },
        unit_amount: Math.round(Number(orden.total || 0) * 100), // Stripe usa centavos
      },
      quantity: 1
    })).filter(item => item.price_data.unit_amount > 0);

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'No se pudieron construir items válidos para Stripe' });
    }

    const ordenIds = ordenes.map(o => o.id_orden).filter(Boolean).join(',');
    const appBaseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: items,
      success_url: `${appBaseUrl}/pages/mis-boletos.html?pago=success`,
      cancel_url: `${appBaseUrl}/pages/detalle-evento.html?pago=failure`,
      metadata: {
        orden_ids: ordenIds
      }
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Error crearSesionStripe:', error);
    return res.status(500).json({ success: false, error: 'Error al crear sesión de Stripe' });
  }
};

// Webhook Stripe
exports.webhookStripe = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Error verificando firma Stripe:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const ordenIds = (session.metadata?.orden_ids || '').split(',').map(id => id.trim()).filter(Boolean);
    const paymentIntent = session.payment_intent;
    const connection = await pool.getConnection();
    try {
      for (const id_orden of ordenIds) {
        await connection.query('CALL sp_confirmar_pago(?, ?, ?, ?)', [id_orden, 'stripe', 'approved', paymentIntent]);
      }
      console.log('Stripe webhook: órdenes confirmadas', ordenIds);
    } catch (err) {
      console.error('Error confirmando pago Stripe:', err);
    } finally {
      await connection.release();
    }
  }
  res.status(200).json({ received: true });
};
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Webhook MercadoPago
exports.webhookMercadoPago = async (req, res) => {
  // MercadoPago puede enviar GET (verificación) o POST (notificación real)
  const method = req.method;
  if (method === 'GET') {
    // Para validación de webhook
    return res.status(200).send('OK');
  }

  // POST: notificación real
  const { type, action, data } = req.body;
  if (type !== 'payment' || !data?.id) {
    return res.status(200).json({ received: true });
  }

  const paymentId = data.id;
  try {
    // Log temporal: inicio del webhook
    console.log('Webhook recibido:', JSON.stringify(req.body));

    // Buscar el pago en MercadoPago
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error('Error consultando pago MP desde webhook:', mpData);
      return res.status(200).json({ error: 'No se pudo consultar pago', received: true });
    }

    // Logs después de obtener mpData
    console.log('MP status raw:', mpData.status);
    console.log('MP status normalizado:', normalizeMercadoPagoStatus(mpData.status));
    console.log('external_reference:', mpData.external_reference);
    const externalReference = String(mpData?.external_reference || '').trim();
    const orderIds = externalReference.split(',').map(x => parseInt(x)).filter(Boolean);
    console.log('orderIds:', orderIds);
    if (!orderIds.length) {
      return res.status(200).json({ error: 'No hay orden asociada', received: true });
    }

    // Normalizar estado
    const mpStatus = normalizeMercadoPagoStatus(mpData.status);

    let connection;
    try {
      connection = await pool.getConnection();
      for (const orderId of orderIds) {
        await connection.query(
          'CALL sp_confirmar_pago(?, ?, ?, ?)',
          [orderId, 'mercadopago', mpStatus, String(paymentId)]
        );
        // Log después del CALL
        console.log('SP ejecutado para orden:', orderId, 'con estado:', mpStatus);
      }
    } catch (err) {
      console.error('Error actualizando orden desde webhook:', err);
    } finally {
      if (connection) connection.release();
    }

    return res.status(200).json({ updated: true, orderIds });
  } catch (err) {
    console.error('Error en webhook MP:', err);
    return res.status(200).json({ error: 'Error general', received: true });
  }
};
const pool = require('../config/database');
const MAX_BOLETOS_POR_EVENTO_Y_USUARIO = 10;

const escapeIdentifier = (identifier) => `\`${String(identifier || '').replace(/`/g, '``')}\``;
const schemaCache = {
  tableExists: new Map(),
  columnExists: new Map()
};

const findExistingTable = async (connection, candidates = []) => {
  for (const tableName of candidates) {
    if (schemaCache.tableExists.has(tableName)) {
      const exists = schemaCache.tableExists.get(tableName);
      if (exists) return tableName;
      continue;
    }

    const [rows] = await connection.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?
        LIMIT 1
      `,
      [tableName]
    );

    const exists = rows.length > 0;
    schemaCache.tableExists.set(tableName, exists);
    if (exists) {
      return tableName;
    }
  }

  return null;
};

const findExistingColumn = async (connection, tableName, candidates = []) => {
  if (!tableName) return null;

  for (const columnName of candidates) {
    const cacheKey = `${tableName}.${columnName}`;
    if (schemaCache.columnExists.has(cacheKey)) {
      const exists = schemaCache.columnExists.get(cacheKey);
      if (exists) return columnName;
      continue;
    }

    const [rows] = await connection.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1
      `,
      [tableName, columnName]
    );

    const exists = rows.length > 0;
    schemaCache.columnExists.set(cacheKey, exists);
    if (exists) {
      return columnName;
    }
  }

  return null;
};

const obtenerEventoIdDesdeTipoBoleto = async (connection, tipoId) => {
  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);
  if (!ticketTypesTable) return null;

  const ticketTypeIdCol = await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']);
  const ticketEventIdCol = await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']);

  if (!ticketTypeIdCol || !ticketEventIdCol) return null;

  const [rows] = await connection.query(
    `
      SELECT ${escapeIdentifier(ticketEventIdCol)} AS id_evento
      FROM ${escapeIdentifier(ticketTypesTable)}
      WHERE ${escapeIdentifier(ticketTypeIdCol)} = ?
      LIMIT 1
    `,
    [tipoId]
  );

  const eventId = Number(rows?.[0]?.id_evento);
  if (Number.isNaN(eventId) || eventId <= 0) return null;
  return eventId;
};

const contarBoletosCompradosPorUsuarioEnEvento = async (connection, userId, eventId) => {
  const ordersTable = await findExistingTable(connection, ['ordenes']);
  const detailsTable = await findExistingTable(connection, ['detalle_orden', 'detalles_orden', 'orden_detalle', 'ordenes_detalle']);
  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);

  if (!ordersTable || !detailsTable || !ticketTypesTable) {
    return null;
  }

  const orderIdCol = await findExistingColumn(connection, ordersTable, ['id', 'id_orden', 'orden_id']);
  const orderUserCol = await findExistingColumn(connection, ordersTable, ['id_usuario', 'usuario_id', 'user_id']);
  const orderStatusCol = await findExistingColumn(connection, ordersTable, ['estado_pago', 'estado', 'status']);

  const detailOrderIdCol = await findExistingColumn(connection, detailsTable, ['id_orden', 'orden_id']);
  const detailTicketTypeCol = await findExistingColumn(connection, detailsTable, ['id_tipo_boleto', 'tipo_boleto_id', 'id_boleto_tipo']);
  const detailQtyCol = await findExistingColumn(connection, detailsTable, ['cantidad', 'cantidad_boletos', 'boletos', 'qty']);

  const ticketTypeIdCol = await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']);
  const ticketEventIdCol = await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']);

  if (!orderIdCol || !orderUserCol || !detailOrderIdCol || !detailTicketTypeCol || !ticketTypeIdCol || !ticketEventIdCol) {
    return null;
  }

  const qtyExpr = detailQtyCol ? `COALESCE(d.${escapeIdentifier(detailQtyCol)}, 0)` : '1';
  const statusFilter = orderStatusCol
    ? `
      AND (
        o.${escapeIdentifier(orderStatusCol)} IS NULL
        OR LOWER(TRIM(o.${escapeIdentifier(orderStatusCol)})) NOT IN ('cancelado', 'cancelada', 'rechazado', 'rechazada', 'reembolsado', 'refund', 'refunded')
      )
    `
    : '';

  const [rows] = await connection.query(
    `
      SELECT COALESCE(SUM(${qtyExpr}), 0) AS total
      FROM ${escapeIdentifier(ordersTable)} o
      INNER JOIN ${escapeIdentifier(detailsTable)} d
        ON d.${escapeIdentifier(detailOrderIdCol)} = o.${escapeIdentifier(orderIdCol)}
      INNER JOIN ${escapeIdentifier(ticketTypesTable)} tb
        ON tb.${escapeIdentifier(ticketTypeIdCol)} = d.${escapeIdentifier(detailTicketTypeCol)}
      WHERE o.${escapeIdentifier(orderUserCol)} = ?
        AND tb.${escapeIdentifier(ticketEventIdCol)} = ?
      ${statusFilter}
    `,
    [userId, eventId]
  );

  const total = Number(rows?.[0]?.total || 0);
  return Number.isNaN(total) ? 0 : total;
};

const parseBooleanLike = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;

  return ['1', 'true', 'si', 'sí', 'yes', 'y', 'usado', 'validado', 'canjeado', 'consumido'].includes(normalized);
};

const normalizarEntradaQR = (rawValue) => {
  const base = String(rawValue || '').trim();
  if (!base) return '';

  try {
    const url = new URL(base);
    const fromParams = [
      url.searchParams.get('qr'),
      url.searchParams.get('codigo_qr'),
      url.searchParams.get('code'),
      url.searchParams.get('ticket'),
      url.searchParams.get('boleto')
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    if (fromParams) {
      return fromParams;
    }
  } catch (_error) {
    // Si no es URL valida, seguimos usando el valor tal cual.
  }

  return base;
};

const obtenerEstadoUsoBoletoPorQR = async (connection, codigoQR) => {
  const boletosTable = await findExistingTable(connection, ['boletos', 'boleto']);
  if (!boletosTable) return null;

  const boletoIdCol = await findExistingColumn(connection, boletosTable, ['id', 'id_boleto', 'boleto_id']);
  const qrCol = await findExistingColumn(connection, boletosTable, ['codigo_qr', 'qr_code', 'codigo']);
  const usadoCol = await findExistingColumn(connection, boletosTable, ['usado', 'is_used', 'utilizado']);
  const estadoCol = await findExistingColumn(connection, boletosTable, ['estado', 'estatus', 'status']);
  const fechaUsoCol = await findExistingColumn(connection, boletosTable, ['fecha_uso', 'usado_en', 'used_at', 'fecha_validacion']);

  if (!boletoIdCol || !qrCol) {
    return null;
  }

  const selectedColumns = [
    `${escapeIdentifier(boletoIdCol)} AS boleto_id`,
    `${escapeIdentifier(qrCol)} AS codigo_qr`,
    usadoCol ? `${escapeIdentifier(usadoCol)} AS usado` : 'NULL AS usado',
    estadoCol ? `${escapeIdentifier(estadoCol)} AS estado` : 'NULL AS estado',
    fechaUsoCol ? `${escapeIdentifier(fechaUsoCol)} AS fecha_uso` : 'NULL AS fecha_uso'
  ];

  const [rows] = await connection.query(
    `
      SELECT ${selectedColumns.join(', ')}
      FROM ${escapeIdentifier(boletosTable)}
      WHERE ${escapeIdentifier(qrCol)} = ?
      LIMIT 1
    `,
    [codigoQR]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0] || {};
  const estado = String(row.estado || '').trim().toLowerCase();
  const yaUsado = parseBooleanLike(row.usado)
    || Boolean(row.fecha_uso)
    || /usad|validad|canjead|consumid/.test(estado);

  return {
    boleto_id: Number(row.boleto_id || 0) || null,
    codigo_qr: row.codigo_qr || codigoQR,
    ya_usado: yaUsado,
    estado,
    fecha_uso: row.fecha_uso || null
  };
};

const obtenerDetalleBoletoParaValidacion = async (connection, { boletoId = null, codigoQR = '' } = {}) => {
  const boletosTable = await findExistingTable(connection, ['boletos', 'boleto']);
  if (!boletosTable) return null;

  const boletoIdCol = await findExistingColumn(connection, boletosTable, ['id', 'id_boleto', 'boleto_id']);
  const qrCol = await findExistingColumn(connection, boletosTable, ['codigo_qr', 'qr_code', 'codigo']);
  const boletoTipoCol = await findExistingColumn(connection, boletosTable, ['id_tipo_boleto', 'tipo_boleto_id', 'id_boleto_tipo']);
  const boletoEventoCol = await findExistingColumn(connection, boletosTable, ['id_evento', 'evento_id']);
  const boletoUsuarioCol = await findExistingColumn(connection, boletosTable, ['id_usuario', 'usuario_id', 'user_id']);
  const boletoEstadoCol = await findExistingColumn(connection, boletosTable, ['estado', 'estatus', 'status']);
  const boletoFechaUsoCol = await findExistingColumn(connection, boletosTable, ['fecha_uso', 'usado_en', 'used_at', 'fecha_validacion']);
  const boletoFechaCompraCol = await findExistingColumn(connection, boletosTable, ['fecha_compra', 'fecha_emision', 'created_at', 'fecha']);

  if (!boletoIdCol || !qrCol) {
    return null;
  }

  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);
  const eventsTable = await findExistingTable(connection, ['eventos', 'evento']);
  const usersTable = await findExistingTable(connection, ['usuarios', 'usuario']);

  const ticketTypeIdCol = ticketTypesTable ? await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']) : null;
  const ticketTypeNameCol = ticketTypesTable ? await findExistingColumn(connection, ticketTypesTable, ['nombre', 'tipo_boleto', 'descripcion', 'titulo']) : null;
  const ticketTypeEventIdCol = ticketTypesTable ? await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']) : null;

  const eventIdCol = eventsTable ? await findExistingColumn(connection, eventsTable, ['id', 'id_evento']) : null;
  const eventTitleCol = eventsTable ? await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']) : null;
  const eventDateCol = eventsTable ? await findExistingColumn(connection, eventsTable, ['fecha_inicio', 'fecha_evento', 'fecha']) : null;
  const eventVenueCol = eventsTable ? await findExistingColumn(connection, eventsTable, ['ubicacion', 'lugar', 'sede']) : null;

  const userIdCol = usersTable ? await findExistingColumn(connection, usersTable, ['id', 'id_usuario', 'usuario_id']) : null;
  const userNameCol = usersTable ? await findExistingColumn(connection, usersTable, ['nombre', 'name', 'usuario']) : null;
  const userEmailCol = usersTable ? await findExistingColumn(connection, usersTable, ['email', 'correo', 'correo_electronico']) : null;

  let ticketJoin = '';
  let eventJoin = '';
  let userJoin = '';

  let eventTitleExpr = "'-'";
  let eventDateExpr = 'NULL';
  let eventVenueExpr = "'-'";
  let ticketTypeExpr = "'-'";
  let userNameExpr = "'-'";
  let userEmailExpr = "'-'";

  if (ticketTypesTable && ticketTypeIdCol && boletoTipoCol) {
    ticketJoin = `\n      LEFT JOIN ${escapeIdentifier(ticketTypesTable)} tb ON tb.${escapeIdentifier(ticketTypeIdCol)} = b.${escapeIdentifier(boletoTipoCol)}`;

    if (ticketTypeNameCol) {
      ticketTypeExpr = `COALESCE(tb.${escapeIdentifier(ticketTypeNameCol)}, '-')`;
    }
  }

  const canJoinEventsFromTicketType = ticketTypesTable && ticketTypeEventIdCol && eventIdCol;
  const canJoinEventsFromBoleto = boletoEventoCol && eventIdCol;

  if (eventsTable && eventIdCol) {
    if (canJoinEventsFromTicketType) {
      eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = tb.${escapeIdentifier(ticketTypeEventIdCol)}`;
    } else if (canJoinEventsFromBoleto) {
      eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = b.${escapeIdentifier(boletoEventoCol)}`;
    }

    if (eventTitleCol) {
      eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
    }

    if (eventDateCol) {
      eventDateExpr = `e.${escapeIdentifier(eventDateCol)}`;
    }

    if (eventVenueCol) {
      eventVenueExpr = `COALESCE(e.${escapeIdentifier(eventVenueCol)}, '-')`;
    }
  }

  if (usersTable && userIdCol && boletoUsuarioCol) {
    userJoin = `\n      LEFT JOIN ${escapeIdentifier(usersTable)} u ON u.${escapeIdentifier(userIdCol)} = b.${escapeIdentifier(boletoUsuarioCol)}`;

    if (userNameCol) {
      userNameExpr = `COALESCE(u.${escapeIdentifier(userNameCol)}, '-')`;
    }

    if (userEmailCol) {
      userEmailExpr = `COALESCE(u.${escapeIdentifier(userEmailCol)}, '-')`;
    }
  }

  const estadoExpr = boletoEstadoCol ? `COALESCE(b.${escapeIdentifier(boletoEstadoCol)}, '-')` : "'-'";
  const fechaUsoExpr = boletoFechaUsoCol ? `b.${escapeIdentifier(boletoFechaUsoCol)}` : 'NULL';
  const fechaCompraExpr = boletoFechaCompraCol ? `b.${escapeIdentifier(boletoFechaCompraCol)}` : 'NULL';

  const whereById = Number.isFinite(Number(boletoId)) && Number(boletoId) > 0;
  const whereClause = whereById
    ? `b.${escapeIdentifier(boletoIdCol)} = ?`
    : `b.${escapeIdentifier(qrCol)} = ?`;
  const whereValue = whereById ? Number(boletoId) : String(codigoQR || '').trim();

  const [rows] = await connection.query(
    `
      SELECT
        b.${escapeIdentifier(boletoIdCol)} AS boleto_id,
        b.${escapeIdentifier(qrCol)} AS codigo_qr,
        ${estadoExpr} AS estado_boleto,
        ${fechaUsoExpr} AS fecha_uso,
        ${fechaCompraExpr} AS fecha_compra,
        ${eventTitleExpr} AS evento,
        ${eventDateExpr} AS fecha_evento,
        ${eventVenueExpr} AS ubicacion,
        ${ticketTypeExpr} AS tipo_boleto,
        ${userNameExpr} AS usuario_nombre,
        ${userEmailExpr} AS usuario_email
      FROM ${escapeIdentifier(boletosTable)} b${ticketJoin}${eventJoin}${userJoin}
      WHERE ${whereClause}
      LIMIT 1
    `,
    [whereValue]
  );

  if (!rows.length) return null;

  return rows[0] || null;
};

const obtenerDisponiblesDesdeResultado = (row = {}) => {
  const candidates = [
    row.disponibles,
    row.cantidad_disponible,
    row.stock_disponible,
    row.boletos_disponibles,
    row.disponibilidad_actual
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }

  return null;
};

const parseOrderIdsFromReference = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  return String(value || '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
};

const normalizeMercadoPagoStatus = (status) => {
  const map = {
    approved: 'approved',
    authorized: 'approved',
    pending: 'pending',
    in_process: 'pending',
    in_mediation: 'pending',
    rejected: 'rejected',
    cancelled: 'cancelled',
    refunded: 'refunded',
    charged_back: 'refunded',
  };
  return map[String(status || '').trim().toLowerCase()] ?? 'pending';
};

const esBoletoConPagoConfirmado = (boleto = {}) => {
  const values = [
    boleto.estado_boleto,
    boleto.estado,
    boleto.estado_pago,
    boleto.pago_estado,
    boleto.payment_status,
    boleto.order_status,
    boleto.orden_estado
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  // Sin informacion de estado: no mostrar el boleto (pago no confirmado)
  if (!values.length) {
    return false;
  }

  const hasRejected = values.some((value) => /cancelad|rechazad|fallid|expired|vencid/.test(value));
  if (hasRejected) return false;


  // Ahora 'reservado' se considera pagado/aprobado
  const hasApproved = values.some((value) => /pagad|aprobad|approved|accredited|usad|validad|canjead|consumid|reservad/.test(value));
  // 'pendiente' = orden pendiente de cobro
  const hasPending = values.some((value) => /pendient|in_process|inprocess|processing|waiting/.test(value));

  if (hasApproved) return true;
  if (hasPending) return false;

  // Estado desconocido: no mostrar para evitar boletos sin pago
  return false;
};

const obtenerOrdenesDelUsuario = async (connection, userId, orderIds = []) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return [];

  const ordenesTable = await findExistingTable(connection, ['ordenes']);
  if (!ordenesTable) return [];

  const orderIdCol = await findExistingColumn(connection, ordenesTable, ['id', 'id_orden', 'orden_id']);
  const orderUserCol = await findExistingColumn(connection, ordenesTable, ['id_usuario', 'usuario_id', 'user_id']);

  if (!orderIdCol || !orderUserCol) return [];

  const normalizedOrderIds = [...new Set(orderIds
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0))];

  if (!normalizedOrderIds.length) return [];

  const placeholders = normalizedOrderIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
      SELECT ${escapeIdentifier(orderIdCol)} AS orden_id
      FROM ${escapeIdentifier(ordenesTable)}
      WHERE ${escapeIdentifier(orderUserCol)} = ?
        AND ${escapeIdentifier(orderIdCol)} IN (${placeholders})
    `,
    [userId, ...normalizedOrderIds]
  );

  return rows
    .map((row) => Number(row.orden_id || 0))
    .filter((item) => Number.isFinite(item) && item > 0);
};

const resolverClientIdMercadoPago = () => {
  const envClientId = process.env.MERCADOPAGO_OAUTH_CLIENT_ID
    || process.env.MERCADOPAGO_APP_ID
    || process.env.MP_APP_ID
    || process.env.NEXT_PUBLIC_MERCADOPAGO_APP_ID
    || process.env.APP_ID
    || process.env.CLIENT_ID;

  if (envClientId) {
    return envClientId;
  }

  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.ACCESS_TOKEN || '').trim();
  const match = token.match(/APP_[A-Z]+-(\d+)-/i);
  return match?.[1] || null;
};

const refrescarTokenMercadoPago = async ({ refreshToken }) => {
  const clientId = resolverClientIdMercadoPago();
  const clientSecret = process.env.MERCADOPAGO_OAUTH_CLIENT_SECRET || process.env.CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return null;
  }

  try {
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
    if (!mpResponse.ok || !mpData?.access_token) {
      return null;
    }

    return mpData;
  } catch (error) {
    return null;
  }
};

const obtenerAccessTokenMercadoPago = async (idUsuario) => {
  const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN || null;

  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `
        SELECT access_token, refresh_token, expires_at
        FROM mercadopago_tokens
        WHERE id_usuario = ?
        LIMIT 1
      `,
      [idUsuario]
    );

    const tokenGuardado = rows[0];
    if (!tokenGuardado?.access_token) {
      return envToken;
    }

    const expiresAtMs = tokenGuardado.expires_at ? new Date(tokenGuardado.expires_at).getTime() : null;
    const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= (Date.now() + 60 * 1000);

    if (!isExpired) {
      return tokenGuardado.access_token;
    }

    // Si el token expiro, intentamos refrescarlo y persistirlo para futuros pagos.
    const refreshed = await refrescarTokenMercadoPago({
      refreshToken: tokenGuardado.refresh_token
    });

    if (refreshed?.access_token) {
      const expiresAt = Number.isFinite(Number(refreshed.expires_in))
        ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
        : null;

      await connection.query(
        `
          UPDATE mercadopago_tokens
          SET access_token = ?,
              refresh_token = ?,
              token_type = ?,
              scope = ?,
              expires_at = ?
          WHERE id_usuario = ?
        `,
        [
          refreshed.access_token,
          refreshed.refresh_token || tokenGuardado.refresh_token || null,
          refreshed.token_type || null,
          refreshed.scope || null,
          expiresAt,
          idUsuario
        ]
      );

      return refreshed.access_token;
    }

    return envToken;
  } catch (error) {
    // Si la tabla no existe o hay un error de consulta, usamos fallback de entorno.
    return envToken;
  } finally {
    await connection.release();
  }
};

// Listar tipos de boleto de un evento
exports.listarTiposBoleto = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_listar_tipos_boleto(?)',
      [parseInt(id_evento)]
    );

    const tipos = (resultado[0] || []).map((tipo) => ({ ...tipo }));

    for (const tipo of tipos) {
      if (!tipo?.id) continue;

      try {
        const [dispResult] = await connection.query(
          'CALL sp_verificar_disponibilidad(?, ?)',
          [parseInt(tipo.id, 10), 1]
        );

        const dispRow = dispResult?.[0]?.[0] || {};
        const disponibles = obtenerDisponiblesDesdeResultado(dispRow);

        if (disponibles !== null) {
          tipo.disponibles = disponibles;
          tipo.cantidad_disponible = disponibles;
        }
      } catch (innerError) {
        // Si el SP de disponibilidad falla para un tipo, mantenemos el valor original.
      }
    }

    await connection.release();

    res.json({
      success: true,
      tipos_boleto: tipos
    });
  } catch (error) {
    console.error('Error en listarTiposBoleto:', error);
    res.status(500).json({ error: 'Error al listar tipos de boleto' });
  }
};

// Verificar disponibilidad
exports.verificarDisponibilidad = async (req, res) => {
  const { id_tipo_boleto, cantidad } = req.body;

  if (!id_tipo_boleto || !cantidad) {
    return res.status(400).json({ error: 'Parámetros requeridos' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_verificar_disponibilidad(?, ?)',
      [parseInt(id_tipo_boleto), parseInt(cantidad)]
    );

    await connection.release();

    res.json({
      success: true,
      disponibilidad: resultado[0][0]
    });
  } catch (error) {
    console.error('Error en verificarDisponibilidad:', error);
    res.status(500).json({ error: 'Error al verificar disponibilidad' });
  }
};

// Comprar boletos
exports.comprarBoletos = async (req, res) => {
  const { id_tipo_boleto, cantidad } = req.body;

  if (!id_tipo_boleto || !cantidad) {
    return res.status(400).json({ error: 'Parámetros requeridos' });
  }

  try {
    const connection = await pool.getConnection();
    const tipoId = parseInt(id_tipo_boleto, 10);
    const qty = parseInt(cantidad, 10);

    if (Number.isNaN(tipoId) || tipoId <= 0 || Number.isNaN(qty) || qty <= 0) {
      await connection.release();
      return res.status(400).json({
        success: false,
        message: 'Parámetros inválidos para la compra'
      });
    }

    const eventId = await obtenerEventoIdDesdeTipoBoleto(connection, tipoId);
    const totalActualEvento = eventId
      ? await contarBoletosCompradosPorUsuarioEnEvento(connection, req.user.id, eventId)
      : null;

    if (typeof totalActualEvento === 'number' && totalActualEvento + qty > MAX_BOLETOS_POR_EVENTO_Y_USUARIO) {
      await connection.release();
      return res.status(400).json({
        success: false,
        message: `Límite alcanzado: máximo ${MAX_BOLETOS_POR_EVENTO_Y_USUARIO} boletos por evento y perfil (sumando todos los tipos de asiento).`
      });
    }

    const [resultado] = await connection.query(
      'CALL sp_comprar_boletos(?, ?, ?)',
      [req.user.id, tipoId, qty]
    );

    const compraRow = resultado?.[0]?.[0] || {};

    if (compraRow.resultado === 'ok') {
      let disponibilidadActual = null;

      try {
        const [dispResult] = await connection.query(
          'CALL sp_verificar_disponibilidad(?, ?)',
          [tipoId, 1]
        );
        const dispRow = dispResult?.[0]?.[0] || {};
        disponibilidadActual = obtenerDisponiblesDesdeResultado(dispRow);
      } catch (errorDisponibilidad) {
        // Si falla esta consulta, mantenemos null y no bloqueamos la compra.
      }

      await connection.release();

      return res.status(201).json({
        success: true,
        message: compraRow.mensaje,
        orden: {
          id_orden: compraRow.id_orden,
          total: compraRow.total,
          boletos_reservados: compraRow.boletos_reservados,
          disponibilidad_actual: disponibilidadActual
        }
      });
    }

    await connection.release();

    res.status(400).json({
      success: false,
      message: compraRow.mensaje
    });
  } catch (error) {
    console.error('Error en comprarBoletos:', error);
    res.status(500).json({ error: 'Error al comprar boletos' });
  }
};

// Confirmar pago
exports.confirmarPago = async (req, res) => {
  const { id_orden, metodo, estado_pago, referencia_externa } = req.body;

  if (!id_orden || !metodo || !estado_pago) {
    return res.status(400).json({ error: 'Parámetros requeridos' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_confirmar_pago(?, ?, ?, ?)',
      [parseInt(id_orden), metodo, estado_pago, referencia_externa || null]
    );

    await connection.release();

    res.json({
      success: resultado[0][0].resultado === 'ok',
      message: resultado[0][0].mensaje,
      id_orden: resultado[0][0].id_orden
    });
  } catch (error) {
    console.error('Error en confirmarPago:', error);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
};

// Verificar pago de una orden buscando en Mercado Pago por external_reference
exports.verificarPagoOrden = async (req, res) => {
  const idOrden = parseInt(req.params.id_orden);
  if (!idOrden) return res.status(400).json({ success: false, error: 'ID de orden inválido' });

  const accessToken = await obtenerAccessTokenMercadoPago(req.user.id);
  if (!accessToken) {
    return res.status(500).json({ success: false, error: 'No hay token de Mercado Pago configurado' });
  }

  let connection;
  try {
    // Buscar en MP por external_reference = idOrden
    const searchRes = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(String(idOrden))}&sort=date_created&criteria=desc&limit=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      return res.status(502).json({ success: false, error: searchData?.message || 'Error al buscar en Mercado Pago', details: searchData });
    }

    const results = Array.isArray(searchData?.results) ? searchData.results : [];
    // Buscar el pago más reciente aprobado, si no hay tomar el más reciente
    const pagosAprobados = results.filter(p => p.status === 'approved');
    const pago = pagosAprobados[0] || results[0] || null;

    if (!pago) {
      return res.json({ success: false, error: 'No se encontró ningún pago para esta orden en Mercado Pago' });
    }

    const mpStatus = normalizeMercadoPagoStatus(pago.status);

    connection = await pool.getConnection();

    // Verificar que la orden pertenece al usuario
    const userOrderIds = await obtenerOrdenesDelUsuario(connection, req.user.id, [idOrden]);
    if (!userOrderIds.length) {
      return res.status(403).json({ success: false, error: 'La orden no pertenece al usuario autenticado' });
    }

    const [resultado] = await connection.query(
      'CALL sp_confirmar_pago(?, ?, ?, ?)',
      [idOrden, 'mercadopago', mpStatus, String(pago.id)]
    );

    const row = resultado?.[0]?.[0] || {};
    return res.json({
      success: row.resultado === 'ok',
      mensaje: row.mensaje || null,
      status_mp: pago.status,
      status_normalizado: mpStatus,
      payment_id: pago.id
    });
  } catch (error) {
    console.error('Error en verificarPagoOrden:', error);
    return res.status(500).json({ success: false, error: 'Error al verificar el pago' });
  } finally {
    if (connection) connection.release();
  }
};

// Crear preferencia de pago en Mercado Pago
exports.crearPreferenciaMercadoPago = async (req, res) => {
  const { ordenes = [], evento_titulo } = req.body;
  const appBaseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  if (!Array.isArray(ordenes) || ordenes.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Debes enviar al menos una orden para pagar'
    });
  }

  const items = ordenes.map((orden, index) => ({
    id: String(orden.id_orden || `orden-${index + 1}`),
    title: evento_titulo
      ? `${evento_titulo} - Orden #${orden.id_orden || index + 1}`
      : `Boletos - Orden #${orden.id_orden || index + 1}`,
    quantity: 1,
    unit_price: Number(orden.total || 0),
    currency_id: 'MXN'
  })).filter((item) => item.unit_price > 0);

  if (items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No se pudieron construir items validos para Mercado Pago'
    });
  }

  try {
    const accessToken = await obtenerAccessTokenMercadoPago(req.user.id);
    const envAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || null;

    if (!accessToken) {
      return res.status(500).json({
        success: false,
        error: 'Falta configurar token de Mercado Pago. Vincula OAuth o define MERCADOPAGO_ACCESS_TOKEN.'
      });
    }

    const backUrls = {
      success: `${appBaseUrl}/pages/mis-boletos.html?pago=success`,
      failure: `${appBaseUrl}/pages/detalle-evento.html?pago=failure`,
      pending: `${appBaseUrl}/pages/mis-boletos.html?pago=pending`
    };

    // En sandbox siempre activar auto_return para que redirija automáticamente al pagar.
    // En producción solo con HTTPS y dominio no-localhost.
    let autoReturnEnabled = false;
    try {
      const successUrl = new URL(backUrls.success);
      const host = String(successUrl.hostname || '').toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      autoReturnEnabled = isTestToken || (successUrl.protocol === 'https:' && !isLocalHost);
    } catch (_error) {
      autoReturnEnabled = false;
    }

    const isTestToken = String(accessToken || '').startsWith('TEST-');

    const preferencePayload = {
      items,
      // En sandbox no se debe enviar el email del vendedor como payer (MP lo bloquea).
      // Solo incluir payer si es producción y el email está disponible.
      ...(!isTestToken && req.user.email ? {
        payer: {
          email: req.user.email,
          name: req.user.nombre || undefined
        }
      } : {}),
      back_urls: backUrls,
      ...(autoReturnEnabled ? { auto_return: 'approved' } : {}),
      external_reference: ordenes.map((orden) => orden.id_orden).filter(Boolean).join(','),
      metadata: {
        usuario_id: req.user.id,
        orden_ids: ordenes.map((orden) => orden.id_orden).filter(Boolean)
      },
      notification_url: `${appBaseUrl}/api/boletos/webhook/mercadopago`
    };

    let response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencePayload)
    });

    let data = await response.json();

    const errorText = [
      data?.message,
      data?.error,
      data?.error_description,
      JSON.stringify(data?.cause || '')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const pareceErrorDeToken = /token|unauthor|forbidden|credential|access[_ ]?token|invalid[_ ]?token/i.test(errorText);

    const puedeReintentarConEnv = (
      envAccessToken
      && accessToken !== envAccessToken
      && (response.status === 400 || response.status === 401 || response.status === 403 || pareceErrorDeToken)
    );

    if (puedeReintentarConEnv) {
      response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${envAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferencePayload)
      });

      data = await response.json();
    }

    if (!response.ok) {
      console.error('Error MP status:', response.status);
      console.error('Error MP data:', JSON.stringify(data));
      console.error('Error Mercado Pago:', data);
      return res.status(502).json({
        success: false,
        error: data?.message || data?.error || 'No se pudo crear preferencia en Mercado Pago',
        details: data
      });
    }

    // Para tokens de prueba (TEST-...) usar sandbox_init_point para que el checkout funcione correctamente
    const checkoutUrl = isTestToken
      ? (data.sandbox_init_point || data.init_point)
      : (data.init_point || data.sandbox_init_point);

    res.json({
      // LOGS TEMPORALES PARA DEPURACIÓN
      console.log('Preferencia creada:', JSON.stringify(data));
      console.log('Checkout URL:', checkoutUrl);
      console.log('notification_url:', preferencePayload.notification_url);
      console.log('back_urls:', JSON.stringify(backUrls));

      res.json({
        success: true,
        preference_id: data.id,
        init_point: checkoutUrl,
        sandbox_init_point: data.sandbox_init_point
      });
  } catch (error) {
    console.error('Error en crearPreferenciaMercadoPago:', error);
    res.status(500).json({
      success: false,
      error: 'Error al conectar con Mercado Pago'
    });
  }
};

// Listar boletos del usuario
exports.misBoletos = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_mis_boletos(?)',
      [req.user.id]
    );

    await connection.release();

    const boletos = (resultado?.[0] || []).filter((boleto) => esBoletoConPagoConfirmado(boleto));

    res.json({
      success: true,
      boletos
    });
  } catch (error) {
    console.error('Error en misBoletos:', error);
    res.status(500).json({ error: 'Error al obtener boletos' });
  }
};

// Validar retorno real de Mercado Pago y sincronizar estado de orden
exports.validarRetornoMercadoPago = async (req, res) => {
  const paymentId = String(req.query?.payment_id || req.query?.collection_id || '').trim();
  const fallbackStatus = String(req.query?.status || req.query?.collection_status || '').trim();
  const fallbackReference = String(req.query?.external_reference || '').trim();

  const envAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || null;
  const oauthAccessToken = await obtenerAccessTokenMercadoPago(req.user.id);
  const accessToken = oauthAccessToken || envAccessToken;

  if (!accessToken) {
    return res.status(500).json({
      success: false,
      error: 'No hay token configurado para validar pagos de Mercado Pago'
    });
  }

  let mpPayment = null;
  if (paymentId) {
    try {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const mpData = await mpResponse.json();
      if (!mpResponse.ok) {
        return res.status(502).json({
          success: false,
          error: mpData?.message || 'No se pudo validar el pago en Mercado Pago',
          details: mpData
        });
      }

      mpPayment = mpData;
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Error al consultar estado de pago en Mercado Pago'
      });
    }
  }

  const mpStatus = normalizeMercadoPagoStatus(mpPayment?.status || fallbackStatus);
  const externalReference = String(mpPayment?.external_reference || fallbackReference || '').trim();
  const metadataOrderIds = Array.isArray(mpPayment?.metadata?.orden_ids) ? mpPayment.metadata.orden_ids : [];
  const orderIdsFromReference = parseOrderIdsFromReference(externalReference);
  const candidateOrderIds = [...new Set([...orderIdsFromReference, ...parseOrderIdsFromReference(metadataOrderIds)])];

  if (!candidateOrderIds.length) {
    return res.status(400).json({
      success: false,
      error: 'No se encontraron ordenes asociadas al pago recibido'
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const userOrderIds = await obtenerOrdenesDelUsuario(connection, req.user.id, candidateOrderIds);

    if (!userOrderIds.length) {
      return res.status(403).json({
        success: false,
        error: 'Las ordenes del pago no pertenecen al usuario autenticado'
      });
    }

    const referenciaExterna = paymentId || externalReference || null;
    const resultados = [];

    for (const orderId of userOrderIds) {
      try {
        const [resultado] = await connection.query(
          'CALL sp_confirmar_pago(?, ?, ?, ?)',
          [orderId, 'mercadopago', mpStatus, referenciaExterna]
        );

        const row = resultado?.[0]?.[0] || {};
        resultados.push({
          id_orden: orderId,
          success: row.resultado === 'ok',
          mensaje: row.mensaje || null
        });
      } catch (errorInterno) {
        resultados.push({
          id_orden: orderId,
          success: false,
          mensaje: 'No se pudo actualizar el estado de la orden'
        });
      }
    }

    return res.json({
      success: true,
      status_final: mpStatus,
      payment_id: paymentId || null,
      external_reference: externalReference || null,
      ordenes: resultados
    });
  } catch (error) {
    console.error('Error en validarRetornoMercadoPago:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al validar retorno de Mercado Pago'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Obtener detalle de un boleto
exports.detalleBoleto = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_detalle_boleto(?, ?)',
      [parseInt(id), req.user.id]
    );

    await connection.release();

    if (resultado[0].length > 0) {
      res.json({
        success: true,
        boleto: resultado[0][0]
      });
    } else {
      res.status(404).json({ error: 'Boleto no encontrado' });
    }
  } catch (error) {
    console.error('Error en detalleBoleto:', error);
    res.status(500).json({ error: 'Error al obtener boleto' });
  }
};

// Obtener detalle de boleto por codigo QR (uso publico para enlaces del QR)
exports.detalleBoletoPorQR = async (req, res) => {
  const qrInput = req.query?.qr || req.query?.codigo_qr || '';
  const qrCode = normalizarEntradaQR(qrInput);

  if (!qrCode) {
    return res.status(400).json({
      success: false,
      error: 'Codigo QR requerido'
    });
  }

  try {
    const connection = await pool.getConnection();
    const detalle = await obtenerDetalleBoletoParaValidacion(connection, {
      codigoQR: qrCode
    });

    await connection.release();

    if (!detalle) {
      return res.status(404).json({
        success: false,
        error: 'Boleto no encontrado para el codigo QR enviado'
      });
    }

    return res.json({
      success: true,
      boleto: detalle
    });
  } catch (error) {
    console.error('Error en detalleBoletoPorQR:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener detalle por QR'
    });
  }
};

// Obtener detalle de boleto por id (uso publico controlado para enlaces QR)
exports.detalleBoletoPublico = async (req, res) => {
  const id = Number.parseInt(req.params?.id, 10);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: 'ID de boleto invalido'
    });
  }

  try {
    const connection = await pool.getConnection();
    const detalle = await obtenerDetalleBoletoParaValidacion(connection, {
      boletoId: id
    });

    await connection.release();

    if (!detalle) {
      return res.status(404).json({
        success: false,
        error: 'Boleto no encontrado'
      });
    }

    return res.json({
      success: true,
      boleto: detalle
    });
  } catch (error) {
    console.error('Error en detalleBoletoPublico:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener detalle publico del boleto'
    });
  }
};

// Usar boleto (escanear QR)
exports.usarBoleto = async (req, res) => {
  const { codigo_qr } = req.body;

  const qrCode = normalizarEntradaQR(codigo_qr);

  if (!qrCode) {
    return res.status(400).json({ error: 'Código QR requerido' });
  }

  try {
    const connection = await pool.getConnection();
    const estadoPrevio = await obtenerEstadoUsoBoletoPorQR(connection, qrCode);

    if (!estadoPrevio) {
      await connection.release();
      return res.status(404).json({
        success: false,
        message: 'El código QR no corresponde a un boleto registrado'
      });
    }

    if (estadoPrevio.ya_usado) {
      const detalleBoletoUsado = await obtenerDetalleBoletoParaValidacion(connection, {
        boletoId: estadoPrevio.boleto_id,
        codigoQR: qrCode
      });

      await connection.release();

      return res.status(400).json({
        success: false,
        message: 'Este boleto ya fue utilizado y es de un solo uso.',
        boleto_id: estadoPrevio.boleto_id,
        boleto: detalleBoletoUsado || {
          boleto_id: estadoPrevio.boleto_id,
          codigo_qr: estadoPrevio.codigo_qr,
          estado_boleto: estadoPrevio.estado || 'usado',
          fecha_uso: estadoPrevio.fecha_uso || null
        }
      });
    }

    const [resultado] = await connection.query(
      'CALL sp_usar_boleto(?)',
      [qrCode]
    );

    const resultadoRow = resultado?.[0]?.[0] || {};
    const success = resultadoRow.resultado === 'ok';
    const boletoId = Number(resultadoRow.boleto_id || estadoPrevio.boleto_id || 0) || null;
    const detalleBoleto = await obtenerDetalleBoletoParaValidacion(connection, {
      boletoId,
      codigoQR: qrCode
    });

    await connection.release();

    if (!success) {
      return res.status(400).json({
        success: false,
        message: resultadoRow.mensaje || 'No se pudo validar el boleto',
        boleto_id: boletoId,
        boleto: detalleBoleto
      });
    }

    res.json({
      success: true,
      message: resultadoRow.mensaje || 'Boleto validado correctamente (uso único)',
      boleto_id: boletoId,
      boleto: detalleBoleto,
      validacion: {
        uso_unico: true
      }
    });
  } catch (error) {
    console.error('Error en usarBoleto:', error);
    res.status(500).json({ error: 'Error al usar boleto' });
  }
};

// Listar órdenes del usuario
exports.misOrdenes = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_mis_ordenes(?)',
      [req.user.id]
    );

    await connection.release();

    // Normalizar estado: si es 'reservado', mostrar como 'pagada'
    const ordenes = (resultado[0] || []).map(orden => {
      if (orden.estado === 'reservado') {
        return { ...orden, estado: 'pagada' };
      }
      return orden;
    });

    res.json({
      success: true,
      ordenes
    });
  } catch (error) {
    console.error('Error en misOrdenes:', error);
    res.status(500).json({ error: 'Error al obtener órdenes' });
  }
};

// Cancelar orden
exports.cancelarOrden = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_cancelar_orden(?, ?)',
      [parseInt(id), req.user.id]
    );

    await connection.release();

    if (resultado[0][0].resultado === 'ok') {
      res.json({
        success: true,
        message: resultado[0][0].mensaje
      });
    } else {
      res.status(400).json({
        success: false,
        message: resultado[0][0].mensaje
      });
    }
  } catch (error) {
    console.error('Error en cancelarOrden:', error);
    res.status(500).json({ error: 'Error al cancelar orden' });
  }
};
