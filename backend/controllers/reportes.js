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
        return res.status(403).json({
          success: false,
          message: lastErrorMessage || 'No se pudo obtener el reporte del evento'
        });
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
    const [resultado] = await connection.query(
      'CALL sp_reporte_general_admin(?)',
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
      resumen: resultado[0][0],
      top_eventos: resultado[1]
    });
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
    await connection.release();

    return res.json({
      success: true,
      usuario: usuarioRows[0],
      ordenes: resultado?.[0] || []
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
