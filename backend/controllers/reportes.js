const pool = require('../config/database');

const escapeIdentifier = (identifier) => `\`${String(identifier || '').replace(/`/g, '``')}\``;

const buildRelationsByParent = (relations = []) => {
  const map = new Map();

  for (const relation of relations) {
    const parentTable = String(relation.parentTable || '');
    const parentColumn = String(relation.parentColumn || '');
    if (!parentTable || !parentColumn) continue;

    const key = `${parentTable}.${parentColumn}`;
    const list = map.get(key) || [];
    list.push(relation);
    map.set(key, list);
  }

  return map;
};

const buildSinglePrimaryKeyMap = (pkRows = []) => {
  const grouped = new Map();

  for (const row of pkRows) {
    const table = String(row.tableName || '');
    const column = String(row.columnName || '');
    if (!table || !column) continue;

    const cols = grouped.get(table) || [];
    cols.push(column);
    grouped.set(table, cols);
  }

  const singlePkMap = new Map();
  for (const [table, cols] of grouped.entries()) {
    if (cols.length === 1) {
      singlePkMap.set(table, cols[0]);
    }
  }

  return singlePkMap;
};

const findExistingTable = async (connection, candidates = []) => {
  for (const tableName of candidates) {
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

    if (rows.length) {
      const firstRow = rows[0] || {};
      return firstRow.table_name || firstRow.TABLE_NAME || tableName;
    }
  }

  return null;
};

const findExistingColumn = async (connection, tableName, candidates = []) => {
  if (!tableName) return null;

  for (const columnName of candidates) {
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

    if (rows.length) {
      const firstRow = rows[0] || {};
      return firstRow.column_name || firstRow.COLUMN_NAME || columnName;
    }
  }

  return null;
};

const obtenerHistorialComprasDetallado = async (connection, userId) => {
  const ordersTable = await findExistingTable(connection, ['ordenes']);
  const detailsTable = await findExistingTable(connection, ['detalle_orden', 'detalles_orden', 'orden_detalle', 'ordenes_detalle']);
  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);
  const eventsTable = await findExistingTable(connection, ['eventos', 'evento']);

  if (!ordersTable || !detailsTable) {
    return null;
  }

  const orderIdCol = await findExistingColumn(connection, ordersTable, ['id', 'id_orden', 'orden_id']);
  const orderUserCol = await findExistingColumn(connection, ordersTable, ['id_usuario', 'usuario_id', 'user_id']);
  const orderDateCol = await findExistingColumn(connection, ordersTable, ['fecha_orden', 'fecha_compra', 'created_at', 'fecha']);
  const orderStatusCol = await findExistingColumn(connection, ordersTable, ['estado_pago', 'estado', 'status']);
  const orderTotalCol = await findExistingColumn(connection, ordersTable, ['total', 'monto_total', 'total_pago', 'importe_total']);

  const detailOrderIdCol = await findExistingColumn(connection, detailsTable, ['id_orden', 'orden_id']);
  const detailTicketTypeCol = await findExistingColumn(connection, detailsTable, ['id_tipo_boleto', 'tipo_boleto_id', 'id_boleto_tipo']);
  const detailQtyCol = await findExistingColumn(connection, detailsTable, ['cantidad', 'cantidad_boletos', 'boletos', 'qty']);
  const detailPriceCol = await findExistingColumn(connection, detailsTable, ['precio_unitario', 'precio', 'costo_unitario']);
  const detailSubtotalCol = await findExistingColumn(connection, detailsTable, ['subtotal', 'total', 'importe', 'monto_total']);

  if (!orderIdCol || !orderUserCol || !detailOrderIdCol) {
    return null;
  }

  let ticketJoin = '';
  let eventJoin = '';
  let eventTitleExpr = `'-'`;
  let ticketTypeExpr = `'-'`;

  if (ticketTypesTable && detailTicketTypeCol) {
    const ticketTypeIdCol = await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']);
    const ticketTypeNameCol = await findExistingColumn(connection, ticketTypesTable, ['nombre', 'tipo_boleto', 'descripcion', 'titulo']);
    const ticketEventIdCol = await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']);

    if (ticketTypeIdCol) {
      ticketJoin = `\n      LEFT JOIN ${escapeIdentifier(ticketTypesTable)} tb ON tb.${escapeIdentifier(ticketTypeIdCol)} = d.${escapeIdentifier(detailTicketTypeCol)}`;
      if (ticketTypeNameCol) {
        ticketTypeExpr = `COALESCE(tb.${escapeIdentifier(ticketTypeNameCol)}, '-')`;
      }

      if (eventsTable && ticketEventIdCol) {
        const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
        const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

        if (eventIdCol) {
          eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = tb.${escapeIdentifier(ticketEventIdCol)}`;
          if (eventTitleCol) {
            eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
          }
        }
      }
    }
  }

  const qtyExpr = detailQtyCol
    ? `COALESCE(d.${escapeIdentifier(detailQtyCol)}, 0)`
    : '0';
  const subtotalExpr = detailSubtotalCol
    ? `COALESCE(d.${escapeIdentifier(detailSubtotalCol)}, 0)`
    : detailPriceCol
      ? `COALESCE(d.${escapeIdentifier(detailPriceCol)}, 0) * ${qtyExpr}`
      : '0';

  const query = `
    SELECT
      o.${escapeIdentifier(orderIdCol)} AS id_orden,
      ${orderDateCol ? `o.${escapeIdentifier(orderDateCol)}` : 'NULL'} AS fecha_orden,
      ${orderStatusCol ? `o.${escapeIdentifier(orderStatusCol)}` : "'-'"} AS estado_pago,
      ${orderTotalCol ? `COALESCE(o.${escapeIdentifier(orderTotalCol)}, 0)` : '0'} AS total,
      ${eventTitleExpr} AS evento,
      ${ticketTypeExpr} AS tipo_boleto,
      ${qtyExpr} AS cantidad,
      ${subtotalExpr} AS subtotal
    FROM ${escapeIdentifier(ordersTable)} o
    LEFT JOIN ${escapeIdentifier(detailsTable)} d ON d.${escapeIdentifier(detailOrderIdCol)} = o.${escapeIdentifier(orderIdCol)}${ticketJoin}${eventJoin}
    WHERE o.${escapeIdentifier(orderUserCol)} = ?
    ORDER BY fecha_orden DESC, id_orden DESC
  `;

  const [rows] = await connection.query(query, [userId]);
  return rows || [];
};

const PAID_SALE_STATUSES = [
  'pagado',
  'paid',
  'approved',
  'accredited',
  'authorized',
  'completed',
  'success'
];

const EXCLUDED_SALE_STATUSES = [
  'cancelado',
  'cancelled',
  'canceled',
  'rechazado',
  'rejected',
  'failed',
  'anulado',
  'void',
  'refunded',
  'chargeback'
];

const buildOrderStatusFilter = ({ paidOnly, expr }) => {
  const values = paidOnly ? PAID_SALE_STATUSES : EXCLUDED_SALE_STATUSES;
  const op = paidOnly ? 'IN' : 'NOT IN';
  return {
    clause: `${expr} ${op} (${values.map(() => '?').join(', ')})`,
    params: values
  };
};

const obtenerVentasDesdeBoletos = async (connection, eventId = null, options = {}) => {
  const paidOnly = options.paidOnly !== false;
  const boletosTable = await findExistingTable(connection, ['boletos', 'boleto']);
  const ordersTable = await findExistingTable(connection, ['ordenes']);
  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);
  const eventsTable = await findExistingTable(connection, ['eventos', 'evento']);

  if (!boletosTable) {
    return [];
  }

  const boletoEventCol = await findExistingColumn(connection, boletosTable, ['id_evento', 'evento_id']);
  const boletoTipoCol = await findExistingColumn(connection, boletosTable, ['id_tipo_boleto', 'tipo_boleto_id', 'id_boleto_tipo']);
  const boletoOrderCol = await findExistingColumn(connection, boletosTable, ['id_orden', 'orden_id']);
  const boletoEstadoCol = await findExistingColumn(connection, boletosTable, ['estado', 'status']);
  const boletoQtyCol = await findExistingColumn(connection, boletosTable, ['cantidad', 'qty']);
  const boletoPriceCol = await findExistingColumn(connection, boletosTable, ['precio_pagado', 'precio', 'monto', 'total']);

  if (!boletoEventCol && !boletoTipoCol) {
    return [];
  }

  let eventIdExpr = boletoEventCol ? `b.${escapeIdentifier(boletoEventCol)}` : 'NULL';
  let eventTitleExpr = "'-'";
  let ticketTypeExpr = "'-'";
  let orderStatusExpr = null;
  let joins = '';

  if (ordersTable && boletoOrderCol) {
    const orderIdCol = await findExistingColumn(connection, ordersTable, ['id', 'id_orden', 'orden_id']);
    const orderStatusCol = await findExistingColumn(connection, ordersTable, ['estado_pago', 'estado', 'status']);
    if (orderIdCol) {
      joins += `\n      LEFT JOIN ${escapeIdentifier(ordersTable)} o ON o.${escapeIdentifier(orderIdCol)} = b.${escapeIdentifier(boletoOrderCol)}`;
      if (orderStatusCol) {
        orderStatusExpr = `LOWER(COALESCE(o.${escapeIdentifier(orderStatusCol)}, ''))`;
      }
    }
  }

  if (ticketTypesTable && boletoTipoCol) {
    const ticketTypeIdCol = await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']);
    const ticketTypeNameCol = await findExistingColumn(connection, ticketTypesTable, ['nombre', 'tipo_boleto', 'descripcion', 'titulo']);
    const ticketEventIdCol = await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']);

    if (ticketTypeIdCol) {
      joins += `\n      LEFT JOIN ${escapeIdentifier(ticketTypesTable)} tb ON tb.${escapeIdentifier(ticketTypeIdCol)} = b.${escapeIdentifier(boletoTipoCol)}`;
      if (ticketTypeNameCol) {
        ticketTypeExpr = `COALESCE(tb.${escapeIdentifier(ticketTypeNameCol)}, '-')`;
      }
      if (!boletoEventCol && ticketEventIdCol) {
        eventIdExpr = `tb.${escapeIdentifier(ticketEventIdCol)}`;
      }
    }
  }

  if (eventsTable) {
    const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
    const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

    if (eventIdCol) {
      joins += `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = ${eventIdExpr}`;
      if (eventTitleCol) {
        eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
      }
    }
  }

  if (eventId !== null && eventIdExpr === 'NULL') {
    return [];
  }

  const qtyExpr = boletoQtyCol ? `COALESCE(b.${escapeIdentifier(boletoQtyCol)}, 1)` : '1';
  const subtotalExpr = boletoPriceCol ? `COALESCE(b.${escapeIdentifier(boletoPriceCol)}, 0) * ${qtyExpr}` : '0';

  const where = [];
  const params = [];

  if (orderStatusExpr) {
    const statusFilter = buildOrderStatusFilter({ paidOnly, expr: orderStatusExpr });
    where.push(statusFilter.clause);
    params.push(...statusFilter.params);
  } else if (boletoEstadoCol) {
    const statusFilter = buildOrderStatusFilter({
      paidOnly,
      expr: `LOWER(COALESCE(b.${escapeIdentifier(boletoEstadoCol)}, ''))`
    });
    where.push(statusFilter.clause);
    params.push(...statusFilter.params);
  }

  if (eventId !== null) {
    where.push(`${eventIdExpr} = ?`);
    params.push(eventId);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const query = `
    SELECT
      ${eventIdExpr} AS id_evento,
      ${eventTitleExpr} AS evento,
      ${ticketTypeExpr} AS tipo_boleto,
      ${qtyExpr} AS cantidad,
      ${subtotalExpr} AS subtotal
    FROM ${escapeIdentifier(boletosTable)} b${joins}
    ${whereClause}
  `;

  const [rows] = await connection.query(query, params);
  return rows || [];
};

const obtenerVentasDesdeOrdenes = async (connection, eventId = null, options = {}) => {
  const paidOnly = options.paidOnly !== false;
  const ordersTable = await findExistingTable(connection, ['ordenes']);
  const eventsTable = await findExistingTable(connection, ['eventos', 'evento']);

  if (!ordersTable) {
    return [];
  }

  const orderEventCol = await findExistingColumn(connection, ordersTable, ['id_evento', 'evento_id']);
  const orderTotalCol = await findExistingColumn(connection, ordersTable, ['total', 'monto_total', 'total_pago', 'importe_total']);
  const orderQtyCol = await findExistingColumn(connection, ordersTable, ['boletos_reservados', 'cantidad', 'total_boletos', 'cantidad_boletos']);
  const orderStatusCol = await findExistingColumn(connection, ordersTable, ['estado_pago', 'estado', 'status']);

  if (!orderEventCol && !orderTotalCol && !orderQtyCol) {
    return [];
  }

  let eventTitleExpr = "'-'";
  let joins = '';

  if (eventsTable && orderEventCol) {
    const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
    const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

    if (eventIdCol) {
      joins = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = o.${escapeIdentifier(orderEventCol)}`;
      if (eventTitleCol) {
        eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
      }
    }
  }

  const where = [];
  const params = [];

  if (orderStatusCol) {
    const statusFilter = buildOrderStatusFilter({
      paidOnly,
      expr: `LOWER(COALESCE(o.${escapeIdentifier(orderStatusCol)}, ''))`
    });
    where.push(statusFilter.clause);
    params.push(...statusFilter.params);
  }

  if (eventId !== null && orderEventCol) {
    where.push(`o.${escapeIdentifier(orderEventCol)} = ?`);
    params.push(eventId);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const query = `
    SELECT
      ${orderEventCol ? `o.${escapeIdentifier(orderEventCol)}` : 'NULL'} AS id_evento,
      ${eventTitleExpr} AS evento,
      '-' AS tipo_boleto,
      ${orderQtyCol ? `COALESCE(o.${escapeIdentifier(orderQtyCol)}, 0)` : '0'} AS cantidad,
      ${orderTotalCol ? `COALESCE(o.${escapeIdentifier(orderTotalCol)}, 0)` : '0'} AS subtotal
    FROM ${escapeIdentifier(ordersTable)} o${joins}
    ${whereClause}
  `;

  const [rows] = await connection.query(query, params);
  return rows || [];
};

const obtenerVentasDetalladas = async (connection, eventId = null, options = {}) => {
  const paidOnly = options.paidOnly !== false;
  const ordersTable = await findExistingTable(connection, ['ordenes']);
  const detailsTable = await findExistingTable(connection, ['detalle_orden', 'detalles_orden', 'orden_detalle', 'ordenes_detalle']);
  const ticketTypesTable = await findExistingTable(connection, ['tipos_boleto', 'tipo_boleto']);
  const eventsTable = await findExistingTable(connection, ['eventos', 'evento']);

  if (!ordersTable) {
    return obtenerVentasDesdeBoletos(connection, eventId, { paidOnly });
  }

  if (!detailsTable) {
    const boletoRows = await obtenerVentasDesdeBoletos(connection, eventId, { paidOnly });
    if (boletoRows.length) return boletoRows;

    const orderRows = await obtenerVentasDesdeOrdenes(connection, eventId, { paidOnly });
    if (orderRows.length) return orderRows;

    return [];
  }

  const orderIdCol = await findExistingColumn(connection, ordersTable, ['id', 'id_orden', 'orden_id']);
  const orderStatusCol = await findExistingColumn(connection, ordersTable, ['estado_pago', 'estado', 'status']);
  const orderEventCol = await findExistingColumn(connection, ordersTable, ['id_evento', 'evento_id']);

  const detailOrderIdCol = await findExistingColumn(connection, detailsTable, ['id_orden', 'orden_id']);
  const detailTicketTypeCol = await findExistingColumn(connection, detailsTable, ['id_tipo_boleto', 'tipo_boleto_id', 'id_boleto_tipo']);
  const detailEventCol = await findExistingColumn(connection, detailsTable, ['id_evento', 'evento_id']);
  const detailQtyCol = await findExistingColumn(connection, detailsTable, ['cantidad', 'cantidad_boletos', 'boletos', 'qty']);
  const detailPriceCol = await findExistingColumn(connection, detailsTable, ['precio_unitario', 'precio', 'costo_unitario']);
  const detailSubtotalCol = await findExistingColumn(connection, detailsTable, ['subtotal', 'total', 'importe', 'monto_total']);

  if (!orderIdCol || !detailOrderIdCol) {
    const boletoRows = await obtenerVentasDesdeBoletos(connection, eventId, { paidOnly });
    if (boletoRows.length) return boletoRows;

    const orderRows = await obtenerVentasDesdeOrdenes(connection, eventId, { paidOnly });
    if (orderRows.length) return orderRows;

    return [];
  }

  let ticketJoin = '';
  let eventJoin = '';
  let eventIdExpr = 'NULL';
  let eventTitleExpr = "'-'";
  let ticketTypeExpr = "'-'";

  if (ticketTypesTable && detailTicketTypeCol) {
    const ticketTypeIdCol = await findExistingColumn(connection, ticketTypesTable, ['id', 'id_tipo_boleto']);
    const ticketTypeNameCol = await findExistingColumn(connection, ticketTypesTable, ['nombre', 'tipo_boleto', 'descripcion', 'titulo']);
    const ticketEventIdCol = await findExistingColumn(connection, ticketTypesTable, ['id_evento', 'evento_id']);

    if (ticketTypeIdCol) {
      ticketJoin = `\n      LEFT JOIN ${escapeIdentifier(ticketTypesTable)} tb ON tb.${escapeIdentifier(ticketTypeIdCol)} = d.${escapeIdentifier(detailTicketTypeCol)}`;
      if (ticketTypeNameCol) {
        ticketTypeExpr = `COALESCE(tb.${escapeIdentifier(ticketTypeNameCol)}, '-')`;
      }

      if (eventsTable && ticketEventIdCol) {
        const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
        const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

        if (eventIdCol) {
          eventIdExpr = `e.${escapeIdentifier(eventIdCol)}`;
          eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = tb.${escapeIdentifier(ticketEventIdCol)}`;
          if (eventTitleCol) {
            eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
          }
        }
      }
    }
  }

  if (eventIdExpr === 'NULL' && detailEventCol) {
    eventIdExpr = `d.${escapeIdentifier(detailEventCol)}`;

    if (eventsTable) {
      const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
      const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

      if (eventIdCol) {
        eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = d.${escapeIdentifier(detailEventCol)}`;
        if (eventTitleCol) {
          eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
        }
      }
    }
  }

  if (eventIdExpr === 'NULL' && orderEventCol) {
    eventIdExpr = `o.${escapeIdentifier(orderEventCol)}`;

    if (eventsTable) {
      const eventIdCol = await findExistingColumn(connection, eventsTable, ['id', 'id_evento']);
      const eventTitleCol = await findExistingColumn(connection, eventsTable, ['titulo', 'nombre', 'evento']);

      if (eventIdCol) {
        eventJoin = `\n      LEFT JOIN ${escapeIdentifier(eventsTable)} e ON e.${escapeIdentifier(eventIdCol)} = o.${escapeIdentifier(orderEventCol)}`;
        if (eventTitleCol) {
          eventTitleExpr = `COALESCE(e.${escapeIdentifier(eventTitleCol)}, '-')`;
        }
      }
    }
  }

  if (eventId !== null && eventIdExpr === 'NULL') {
    const orderRows = await obtenerVentasDesdeOrdenes(connection, eventId, { paidOnly });
    if (orderRows.length) return orderRows;
    return obtenerVentasDesdeBoletos(connection, eventId, { paidOnly });
  }

  const qtyExpr = detailQtyCol
    ? `COALESCE(d.${escapeIdentifier(detailQtyCol)}, 0)`
    : '0';
  const subtotalExpr = detailSubtotalCol
    ? `COALESCE(d.${escapeIdentifier(detailSubtotalCol)}, 0)`
    : detailPriceCol
      ? `COALESCE(d.${escapeIdentifier(detailPriceCol)}, 0) * ${qtyExpr}`
      : '0';

  const where = [];
  const params = [];

  if (orderStatusCol) {
    const statusFilter = buildOrderStatusFilter({
      paidOnly,
      expr: `LOWER(COALESCE(o.${escapeIdentifier(orderStatusCol)}, ''))`
    });
    where.push(statusFilter.clause);
    params.push(...statusFilter.params);
  }

  if (eventId !== null) {
    where.push(`${eventIdExpr} = ?`);
    params.push(eventId);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const query = `
    SELECT
      ${eventIdExpr} AS id_evento,
      ${eventTitleExpr} AS evento,
      ${ticketTypeExpr} AS tipo_boleto,
      ${qtyExpr} AS cantidad,
      ${subtotalExpr} AS subtotal
    FROM ${escapeIdentifier(ordersTable)} o
    LEFT JOIN ${escapeIdentifier(detailsTable)} d ON d.${escapeIdentifier(detailOrderIdCol)} = o.${escapeIdentifier(orderIdCol)}${ticketJoin}${eventJoin}
    ${whereClause}
  `;

  const [rows] = await connection.query(query, params);
  const normalizedRows = rows || [];

  const totalIngresos = normalizedRows.reduce((acc, row) => acc + Number(row?.subtotal || 0), 0);
  const totalCantidad = normalizedRows.reduce((acc, row) => acc + Number(row?.cantidad || 0), 0);

  if (totalIngresos <= 0 && totalCantidad <= 0) {
    const orderRows = await obtenerVentasDesdeOrdenes(connection, eventId, { paidOnly });
    if (orderRows.length) {
      return orderRows;
    }
    const boletoRows = await obtenerVentasDesdeBoletos(connection, eventId, { paidOnly });
    if (boletoRows.length) {
      return boletoRows;
    }
  }

  return normalizedRows;
};

const construirReporteEventoManual = (soldRows = [], paidRows = [], eventId) => {
  const filteredSold = soldRows.filter((row) => Number(row?.id_evento || 0) === Number(eventId));
  const filteredPaid = paidRows.filter((row) => Number(row?.id_evento || 0) === Number(eventId));
  const totalVendidos = filteredSold.reduce((acc, row) => acc + Number(row?.cantidad || 0), 0);
  const totalIngresos = filteredPaid.reduce((acc, row) => acc + Number(row?.subtotal || 0), 0);

  const byTipo = new Map();
  for (const row of filteredSold) {
    const tipo = String(row?.tipo_boleto || '-');
    const prev = byTipo.get(tipo) || { tipo_boleto: tipo, vendidos: 0, ingresos: 0 };
    prev.vendidos += Number(row?.cantidad || 0);
    byTipo.set(tipo, prev);
  }

  for (const row of filteredPaid) {
    const tipo = String(row?.tipo_boleto || '-');
    const prev = byTipo.get(tipo) || { tipo_boleto: tipo, vendidos: 0, ingresos: 0 };
    prev.ingresos += Number(row?.subtotal || 0);
    byTipo.set(tipo, prev);
  }

  return {
    resumen: {
      boletos_vendidos: totalVendidos,
      ingresos_totales: totalIngresos,
      total_ordenes: 0,
      titulo: filteredSold[0]?.evento || filteredPaid[0]?.evento || '-'
    },
    desglose: Array.from(byTipo.values())
  };
};

const construirReporteGeneralManual = async (connection) => {
  const usuariosTable = await findExistingTable(connection, ['usuarios']);
  const eventosTable = await findExistingTable(connection, ['eventos', 'evento']);
  const ventasRowsSold = await obtenerVentasDetalladas(connection, null, { paidOnly: false });
  const ventasRowsPaid = await obtenerVentasDetalladas(connection, null, { paidOnly: true });

  let totalUsuarios = 0;
  if (usuariosTable) {
    const activoCol = await findExistingColumn(connection, usuariosTable, ['activo']);
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS total FROM ${escapeIdentifier(usuariosTable)} ${activoCol ? `WHERE COALESCE(${escapeIdentifier(activoCol)}, 0) IN (1, true)` : ''}`
    );
    totalUsuarios = Number(rows?.[0]?.total || 0);
  }

  let eventosActivos = 0;
  if (eventosTable) {
    const estadoCol = await findExistingColumn(connection, eventosTable, ['estado']);
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS total FROM ${escapeIdentifier(eventosTable)} ${estadoCol ? `WHERE LOWER(COALESCE(${escapeIdentifier(estadoCol)}, '')) IN ('publicado', 'activo')` : ''}`
    );
    eventosActivos = Number(rows?.[0]?.total || 0);
  }

  const boletosVendidos = ventasRowsSold.reduce((acc, row) => acc + Number(row?.cantidad || 0), 0);
  const ingresosTotales = ventasRowsPaid.reduce((acc, row) => acc + Number(row?.subtotal || 0), 0);

  const topMap = new Map();
  for (const row of ventasRowsSold) {
    const key = String(row?.evento || '-');
    const prev = topMap.get(key) || { titulo: key, boletos_vendidos: 0, ingresos: 0 };
    prev.boletos_vendidos += Number(row?.cantidad || 0);
    topMap.set(key, prev);
  }

  for (const row of ventasRowsPaid) {
    const key = String(row?.evento || '-');
    const prev = topMap.get(key) || { titulo: key, boletos_vendidos: 0, ingresos: 0 };
    prev.ingresos += Number(row?.subtotal || 0);
    topMap.set(key, prev);
  }

  const topEventos = Array.from(topMap.values())
    .sort((a, b) => Number(b.ingresos) - Number(a.ingresos))
    .slice(0, 5);

  return {
    resumen: {
      total_usuarios: totalUsuarios,
      eventos_activos: eventosActivos,
      boletos_vendidos: boletosVendidos,
      ingresos_totales: ingresosTotales
    },
    top_eventos: topEventos
  };
};

const cascadeDeleteFromParent = async ({
  connection,
  tableName,
  keyColumn,
  keyValue,
  relationsByParent,
  primaryKeyByTable,
  visited
}) => {
  const visitKey = `${tableName}.${keyColumn}.${keyValue}`;
  if (visited.has(visitKey)) {
    return;
  }
  visited.add(visitKey);

  const childRelations = relationsByParent.get(`${tableName}.${keyColumn}`) || [];

  for (const relation of childRelations) {
    const childTable = String(relation.childTable || '');
    const childColumn = String(relation.childColumn || '');
    if (!childTable || !childColumn) continue;

    const childPkColumn = primaryKeyByTable.get(childTable);

    if (childPkColumn) {
      const [childRows] = await connection.query(
        `SELECT ${escapeIdentifier(childPkColumn)} AS pk
         FROM ${escapeIdentifier(childTable)}
         WHERE ${escapeIdentifier(childColumn)} = ?`,
        [keyValue]
      );

      for (const childRow of childRows) {
        await cascadeDeleteFromParent({
          connection,
          tableName: childTable,
          keyColumn: childPkColumn,
          keyValue: childRow.pk,
          relationsByParent,
          primaryKeyByTable,
          visited
        });
      }
    }

    await connection.query(
      `DELETE FROM ${escapeIdentifier(childTable)}
       WHERE ${escapeIdentifier(childColumn)} = ?`,
      [keyValue]
    );
  }

  await connection.query(
    `DELETE FROM ${escapeIdentifier(tableName)}
     WHERE ${escapeIdentifier(keyColumn)} = ?
     LIMIT 1`,
    [keyValue]
  );
};

// Reporte de ventas de un evento
exports.reporteVentasEvento = async (req, res) => {
  const { id_evento } = req.params;
  const eventId = Number.parseInt(id_evento, 10);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return res.status(400).json({ success: false, message: 'id_evento invalido' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      const rawRole = String(req.user?.rol ?? req.user?.id_rol ?? req.user?.rol_id ?? '').trim().toLowerCase();
      const isAdmin = rawRole === '3' || rawRole === 'admin' || rawRole === 'administrador';
      const candidateUserIds = isAdmin ? [req.user.id, 0, null] : [req.user.id];

      let bestResult = null;
      let lastErrorMessage = null;

      for (const candidateUserId of candidateUserIds) {
        const [resultado] = await connection.query('CALL sp_reporte_ventas_evento(?, ?)', [eventId, candidateUserId]);
        const resumen = resultado?.[0]?.[0] || null;
        const desglose = Array.isArray(resultado?.[1]) ? resultado[1] : [];

        if (!resumen) {
          continue;
        }

        if (String(resumen.resultado || '').toLowerCase() === 'error') {
          lastErrorMessage = resumen.mensaje || lastErrorMessage;
          continue;
        }

        const totalVendidos = Number(resumen.boletos_vendidos || resumen.vendidos || 0);
        const totalIngresos = Number(resumen.ingresos_totales || resumen.ingresos || resumen.total || 0);
        const hasDetailSignal = desglose.some((row) => {
          const vendidos = Number(row?.vendidos || row?.boletos_vendidos || row?.cantidad || row?.cantidad_vendida || 0);
          const ingresos = Number(row?.ingresos || row?.total || row?.monto || row?.importe || 0);
          const tipo = row?.tipo_boleto || row?.nombre || row?.tipo || row?.tipo_nombre;
          return vendidos > 0 || ingresos > 0 || Boolean(tipo);
        });

        const hasData = totalVendidos > 0 || totalIngresos > 0 || hasDetailSignal;
        if (!bestResult || hasData) {
          bestResult = { resumen, desglose };
        }
        if (hasData) {
          break;
        }
      }

      if (!bestResult) {
        bestResult = { resumen: { boletos_vendidos: 0, ingresos_totales: 0, total_ordenes: 0, titulo: '-' }, desglose: [] };
      }

      const manualRowsSold = await obtenerVentasDetalladas(connection, eventId, { paidOnly: false });
      const manualRowsPaid = await obtenerVentasDetalladas(connection, eventId, { paidOnly: true });
      const manualReport = construirReporteEventoManual(manualRowsSold, manualRowsPaid, eventId);

      const spVendidos = Number(bestResult?.resumen?.boletos_vendidos || bestResult?.resumen?.vendidos || 0);
      const spIngresos = Number(bestResult?.resumen?.ingresos_totales || bestResult?.resumen?.ingresos || 0);
      const manualVendidos = Number(manualReport?.resumen?.boletos_vendidos || 0);
      const manualIngresos = Number(manualReport?.resumen?.ingresos_totales || 0);

      if ((spVendidos <= 0 && spIngresos <= 0) && (manualVendidos > 0 || manualIngresos > 0)) {
        bestResult = manualReport;
      }

      return res.json({
        success: true,
        resumen: bestResult.resumen,
        desglose: bestResult.desglose
      });
    } finally {
      await connection.release();
    }
  } catch (error) {
    console.error('Error en reporteVentasEvento:', error);
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
};

// Reporte general para administrador
exports.reporteGeneralAdmin = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      let resumen = null;
      let topEventos = [];

      try {
        const [resultado] = await connection.query('CALL sp_reporte_general_admin(?)', [req.user.id]);
        const row = resultado?.[0]?.[0] || null;

        if (row && String(row.resultado || '').toLowerCase() !== 'error') {
          resumen = row;
          topEventos = resultado?.[1] || [];
        }
      } catch (spError) {
        resumen = null;
        topEventos = [];
      }

      const manual = await construirReporteGeneralManual(connection);

      if (!resumen) {
        resumen = manual.resumen;
      } else {
        const merged = { ...resumen };
        const keys = ['total_usuarios', 'eventos_activos', 'boletos_vendidos', 'ingresos_totales'];
        for (const key of keys) {
          const current = Number(merged[key] || 0);
          const fallback = Number(manual.resumen?.[key] || 0);
          if ((Number.isNaN(current) || current <= 0) && fallback > 0) {
            merged[key] = fallback;
          }
        }
        resumen = merged;
      }

      if (!Array.isArray(topEventos) || topEventos.length === 0) {
        topEventos = manual.top_eventos || [];
      }

      return res.json({
        success: true,
        resumen,
        top_eventos: topEventos
      });
    } finally {
      await connection.release();
    }
  } catch (error) {
    console.error('Error en reporteGeneralAdmin:', error);
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
};

// Listar usuarios (solo admin)
exports.listarUsuarios = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_listar_usuarios_admin(?)',
      [req.user.id]
    );

    await connection.release();

    if (resultado[0][0].resultado === 'error') {
      return res.status(403).json({
        success: false,
        message: resultado[0][0].mensaje
      });
    }

    res.json({
      success: true,
      usuarios: resultado[0]
    });
  } catch (error) {
    console.error('Error en listarUsuarios:', error);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

// Historial de compras por usuario (solo admin)
exports.historialComprasUsuario = async (req, res) => {
  const userId = Number(req.params.id_usuario);

  if (Number.isNaN(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: 'id_usuario invalido' });
  }

  try {
    const connection = await pool.getConnection();

    const [usuarioRows] = await connection.query(
      'SELECT id, nombre, email FROM usuarios WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!usuarioRows.length) {
      await connection.release();
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const [resultado] = await connection.query('CALL sp_mis_ordenes(?)', [userId]);
    let historialDetallado = [];

    try {
      historialDetallado = await obtenerHistorialComprasDetallado(connection, userId);
    } catch (innerError) {
      historialDetallado = [];
    }

    const ordenes = resultado?.[0] || [];

    if (!Array.isArray(historialDetallado) || !historialDetallado.length) {
      historialDetallado = ordenes.map((orden) => ({
        id_orden: orden.id_orden || orden.id || null,
        fecha_orden: orden.fecha_orden || orden.fecha_compra || orden.fecha_pago || null,
        estado_pago: orden.estado_pago || orden.estado || '-',
        total: orden.total || orden.monto_total || 0,
        evento: orden.evento || orden.titulo_evento || '-',
        tipo_boleto: orden.tipo_boleto || orden.tipo || orden.nombre_tipo || '-',
        cantidad: Number(orden.cantidad || orden.boletos || 0),
        subtotal: Number(orden.subtotal || orden.total || orden.monto_total || 0)
      }));
    }

    await connection.release();

    return res.json({
      success: true,
      usuario: usuarioRows[0],
      ordenes,
      historial_detallado: historialDetallado
    });
  } catch (error) {
    console.error('Error en historialComprasUsuario:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener historial de compras' });
  }
};

// Desactivar usuario (solo admin)
exports.desactivarUsuario = async (req, res) => {
  const { id_usuario, activo } = req.body;

  if (id_usuario === undefined || activo === undefined) {
    return res.status(400).json({ error: 'Parámetros requeridos' });
  }

  const userId = Number(id_usuario);
  if (Number.isNaN(userId) || userId <= 0) {
    return res.status(400).json({ error: 'id_usuario invalido' });
  }

  const normalizedActivo = ['1', 'true', 'activo', 'si', 'yes']
    .includes(String(activo).trim().toLowerCase())
      ? 1
      : 0;

  try {
    const connection = await pool.getConnection();
    const [updateResult] = await connection.query(
      'UPDATE usuarios SET activo = ? WHERE id = ? LIMIT 1',
      [normalizedActivo, userId]
    );

    if (!updateResult?.affectedRows) {
      await connection.release();
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const [rows] = await connection.query('SELECT activo FROM usuarios WHERE id = ? LIMIT 1', [userId]);
    await connection.release();

    const estadoActual = Number(rows?.[0]?.activo) === 1;

    res.json({
      success: true,
      message: estadoActual ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente',
      activo: estadoActual
    });
  } catch (error) {
    console.error('Error en desactivarUsuario:', error);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
};

// Eliminar usuario (solo admin)
exports.eliminarUsuario = async (req, res) => {
  const userId = Number(req.params.id_usuario);

  if (Number.isNaN(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: 'id_usuario invalido' });
  }

  if (Number(req.user.id) === userId) {
    return res.status(400).json({ success: false, error: 'No puedes eliminar tu propio usuario administrador' });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userRows] = await connection.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    if (!userRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const [fkRows] = await connection.query(
      `SELECT
         TABLE_NAME AS childTable,
         COLUMN_NAME AS childColumn,
         REFERENCED_TABLE_NAME AS parentTable,
         REFERENCED_COLUMN_NAME AS parentColumn
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY TABLE_NAME, COLUMN_NAME`
    );

    const [pkRows] = await connection.query(
      `SELECT
         TABLE_NAME AS tableName,
         COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY TABLE_NAME, ORDINAL_POSITION`
    );

    const relationsByParent = buildRelationsByParent(fkRows || []);
    const primaryKeyByTable = buildSinglePrimaryKeyMap(pkRows || []);

    await cascadeDeleteFromParent({
      connection,
      tableName: 'usuarios',
      keyColumn: 'id',
      keyValue: userId,
      relationsByParent,
      primaryKeyByTable,
      visited: new Set()
    });

    const [existsAfterDelete] = await connection.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [userId]);
    if (existsAfterDelete.length > 0) {
      await connection.rollback();
      return res.status(500).json({ success: false, error: 'No se pudo eliminar completamente el usuario' });
    }

    await connection.commit();

    return res.json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error en eliminarUsuario:', error);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error haciendo rollback al eliminar usuario:', rollbackError);
      }
    }

    return res.status(500).json({ success: false, error: 'Error al eliminar usuario' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
