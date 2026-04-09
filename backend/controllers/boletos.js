const pool = require('../config/database');

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

const obtenerAccessTokenMercadoPago = async (idUsuario) => {
  const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `
        SELECT access_token
        FROM mercadopago_tokens
        WHERE id_usuario = ?
        LIMIT 1
      `,
      [idUsuario]
    );

    return rows[0]?.access_token || null;
  } catch (error) {
    // Si la tabla no existe o hay un error de consulta, solo retornamos null para fallback controlado.
    return null;
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

    if (!accessToken) {
      return res.status(500).json({
        success: false,
        error: 'Falta configurar token de Mercado Pago. Vincula OAuth o define MERCADOPAGO_ACCESS_TOKEN.'
      });
    }

    const backUrls = {
      success: `${appBaseUrl}/pages/mis-boletos.html?pago=success`,
      failure: `${appBaseUrl}/pages/detalle-evento.html?pago=failure`,
      pending: `${appBaseUrl}/pages/mis-ordenes.html?pago=pending`
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items,
        payer: {
          email: req.user.email || undefined,
          name: req.user.nombre || undefined
        },
        back_urls: backUrls,
        external_reference: ordenes.map((orden) => orden.id_orden).filter(Boolean).join(','),
        metadata: {
          usuario_id: req.user.id,
          orden_ids: ordenes.map((orden) => orden.id_orden).filter(Boolean)
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error Mercado Pago:', data);
      return res.status(502).json({
        success: false,
        error: data?.message || 'No se pudo crear preferencia en Mercado Pago'
      });
    }

    res.json({
      success: true,
      preference_id: data.id,
      init_point: data.init_point,
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

    res.json({
      success: true,
      boletos: resultado[0]
    });
  } catch (error) {
    console.error('Error en misBoletos:', error);
    res.status(500).json({ error: 'Error al obtener boletos' });
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

// Usar boleto (escanear QR)
exports.usarBoleto = async (req, res) => {
  const { codigo_qr } = req.body;

  if (!codigo_qr) {
    return res.status(400).json({ error: 'Código QR requerido' });
  }

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_usar_boleto(?)',
      [codigo_qr]
    );

    await connection.release();

    res.json({
      success: resultado[0][0].resultado === 'ok',
      message: resultado[0][0].mensaje,
      boleto_id: resultado[0][0].boleto_id
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

    res.json({
      success: true,
      ordenes: resultado[0]
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
