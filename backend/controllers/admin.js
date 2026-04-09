const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const ADMIN_ROLE_ID = 3;
const ORGANIZADOR_ROLE_ID = 2;

const isAdminRoleValue = (value) => ['3', 'administrador', 'admin'].includes((value ?? '').toString().trim().toLowerCase());
const isOrganizerOrAdminRoleValue = (value) => ['2', '3', 'organizador', 'administrador', 'admin'].includes((value ?? '').toString().trim().toLowerCase());

const resolveRoleColumnName = async (connection) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME IN ('rol', 'id_rol', 'rol_id')
     ORDER BY FIELD(COLUMN_NAME, 'rol', 'id_rol', 'rol_id')
     LIMIT 1`
  );

  return rows[0]?.COLUMN_NAME || null;
};

const resolveRoleValueForColumn = async (connection, columnName, roleId, roleText) => {
  if (!columnName) {
    return roleId;
  }

  const [rows] = await connection.query(
    `SELECT DATA_TYPE, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = ?
     LIMIT 1`
    ,
    [columnName]
  );

  const col = rows[0];
  if (!col) {
    return roleId;
  }

  const dataType = (col.DATA_TYPE || '').toString().toLowerCase();
  const columnType = (col.COLUMN_TYPE || '').toString().toLowerCase();

  if (['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'numeric'].includes(dataType)) {
    return roleId;
  }

  if (columnType.includes(`'${roleId}'`)) {
    return String(roleId);
  }

  if (columnType.includes(roleText.toLowerCase())) {
    return roleText;
  }

  return String(roleId);
};

const buildAdminRoleExpr = (columnName) => `(CAST(${columnName} AS CHAR) = '3' OR LOWER(CAST(${columnName} AS CHAR)) IN ('administrador', 'admin'))`;

const ESTADOS_PERMITIDOS = new Set(['pendiente', 'aprobada', 'rechazada']);

const validarEstado = (estado) => {
  if (!estado) return null;
  const normalized = estado.toString().trim().toLowerCase();
  return ESTADOS_PERMITIDOS.has(normalized) ? normalized : null;
};

exports.crearSolicitudOrganizador = async (req, res) => {
  const {
    organizacion,
    experiencia,
    telefono_contacto,
    comentarios
  } = req.body;

  if (!organizacion || !experiencia) {
    return res.status(400).json({
      success: false,
      error: 'organizacion y experiencia son requeridos'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    const roleColumn = await resolveRoleColumnName(connection);

    const [usuarioRows] = await connection.query(
      roleColumn
        ? `SELECT id, nombre, email, ${roleColumn} AS role_value, activo FROM usuarios WHERE id = ? LIMIT 1`
        : 'SELECT id, nombre, email, activo FROM usuarios WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    const usuario = usuarioRows[0];

    if (!usuario || Number(usuario.activo) !== 1) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado o inactivo'
      });
    }

    if (isOrganizerOrAdminRoleValue(usuario.role_value)) {
      return res.status(400).json({
        success: false,
        error: 'Tu cuenta ya tiene permisos para organizar eventos'
      });
    }

    const [pendienteRows] = await connection.query(
      `SELECT id
       FROM solicitudes_organizador
       WHERE id_usuario = ? AND estado = 'pendiente'
       ORDER BY id DESC
       LIMIT 1`,
      [usuario.id]
    );

    if (pendienteRows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Ya tienes una solicitud pendiente de revision'
      });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO solicitudes_organizador (
        id_usuario,
        nombre_completo,
        email,
        organizacion,
        experiencia,
        telefono_contacto,
        comentarios,
        estado,
        fecha_solicitud
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())`,
      [
        usuario.id,
        usuario.nombre,
        usuario.email,
        organizacion,
        experiencia,
        telefono_contacto || null,
        comentarios || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Solicitud enviada correctamente',
      solicitud_id: insertResult.insertId
    });
  } catch (error) {
    console.error('Error en crearSolicitudOrganizador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al crear solicitud de organizador'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.obtenerMiSolicitudOrganizador = async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      `SELECT
        id,
        id_usuario,
        nombre_completo,
        email,
        organizacion,
        experiencia,
        telefono_contacto,
        comentarios,
        estado,
        motivo_rechazo,
        id_admin_revision,
        fecha_solicitud,
        fecha_revision
      FROM solicitudes_organizador
      WHERE id_usuario = ?
      ORDER BY id DESC
      LIMIT 1`,
      [req.user.id]
    );

    return res.json({
      success: true,
      solicitud: rows[0] || null
    });
  } catch (error) {
    console.error('Error en obtenerMiSolicitudOrganizador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al consultar tu solicitud'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.listarSolicitudesOrganizador = async (req, res) => {
  const estado = validarEstado(req.query.estado);

  if (req.query.estado && !estado) {
    return res.status(400).json({
      success: false,
      error: 'estado invalido. Usa pendiente, aprobada o rechazada'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      `SELECT
        s.id,
        s.id_usuario,
        s.nombre_completo,
        s.email,
        s.organizacion,
        s.experiencia,
        s.telefono_contacto,
        s.comentarios,
        s.estado,
        s.motivo_rechazo,
        s.id_admin_revision,
        s.fecha_solicitud,
        s.fecha_revision,
        u.nombre AS admin_revision_nombre
      FROM solicitudes_organizador s
      LEFT JOIN usuarios u ON u.id = s.id_admin_revision
      WHERE (? IS NULL OR s.estado = ?)
      ORDER BY
        CASE s.estado WHEN 'pendiente' THEN 0 WHEN 'aprobada' THEN 1 ELSE 2 END,
        s.fecha_solicitud DESC`,
      [estado || null, estado || null]
    );

    const [resumenRows] = await connection.query(
      `SELECT
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN estado = 'aprobada' THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN estado = 'rechazada' THEN 1 ELSE 0 END) AS rechazadas,
        COUNT(*) AS total
      FROM solicitudes_organizador`
    );

    return res.json({
      success: true,
      solicitudes: rows,
      resumen: resumenRows[0] || { pendientes: 0, aprobadas: 0, rechazadas: 0, total: 0 }
    });
  } catch (error) {
    console.error('Error en listarSolicitudesOrganizador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al listar solicitudes'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.aprobarSolicitudOrganizador = async (req, res) => {
  const solicitudId = Number(req.params.id);

  if (Number.isNaN(solicitudId) || solicitudId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'ID de solicitud invalido'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    const roleColumn = await resolveRoleColumnName(connection);

    if (!roleColumn) {
      return res.status(500).json({
        success: false,
        error: 'No se encontro columna de rol en usuarios (rol, id_rol o rol_id)'
      });
    }

    const organizadorRoleValue = await resolveRoleValueForColumn(connection, roleColumn, ORGANIZADOR_ROLE_ID, 'organizador');
    await connection.beginTransaction();

    const [solicitudRows] = await connection.query(
      `SELECT id, id_usuario, estado
       FROM solicitudes_organizador
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [solicitudId]
    );

    const solicitud = solicitudRows[0];

    if (!solicitud) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    }

    if (solicitud.estado !== 'pendiente') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden aprobar solicitudes pendientes'
      });
    }

    await connection.query(
      `UPDATE solicitudes_organizador
       SET estado = 'aprobada',
           motivo_rechazo = NULL,
           id_admin_revision = ?,
           fecha_revision = NOW()
       WHERE id = ?`,
      [req.user.id, solicitudId]
    );

    await connection.query(
      `UPDATE usuarios
       SET ${roleColumn} = ?
       WHERE id = ?`,
      [organizadorRoleValue, solicitud.id_usuario]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: 'Solicitud aprobada y usuario actualizado a organizador'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error en aprobarSolicitudOrganizador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al aprobar solicitud'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.rechazarSolicitudOrganizador = async (req, res) => {
  const solicitudId = Number(req.params.id);
  const { motivo_rechazo } = req.body;

  if (Number.isNaN(solicitudId) || solicitudId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'ID de solicitud invalido'
    });
  }

  if (!motivo_rechazo || !motivo_rechazo.toString().trim()) {
    return res.status(400).json({
      success: false,
      error: 'motivo_rechazo es requerido para rechazar'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [solicitudRows] = await connection.query(
      'SELECT id, estado FROM solicitudes_organizador WHERE id = ? LIMIT 1',
      [solicitudId]
    );

    const solicitud = solicitudRows[0];

    if (!solicitud) {
      return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    }

    if (solicitud.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden rechazar solicitudes pendientes'
      });
    }

    await connection.query(
      `UPDATE solicitudes_organizador
       SET estado = 'rechazada',
           motivo_rechazo = ?,
           id_admin_revision = ?,
           fecha_revision = NOW()
       WHERE id = ?`,
      [motivo_rechazo.toString().trim(), req.user.id, solicitudId]
    );

    return res.json({
      success: true,
      message: 'Solicitud rechazada correctamente'
    });
  } catch (error) {
    console.error('Error en rechazarSolicitudOrganizador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al rechazar solicitud'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.listarAdministradores = async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();
    const roleColumn = await resolveRoleColumnName(connection);

    if (!roleColumn) {
      return res.status(500).json({
        success: false,
        error: 'No se encontro columna de rol en usuarios (rol, id_rol o rol_id)'
      });
    }

    const isAdminRoleExpr = buildAdminRoleExpr(roleColumn);

    const [rows] = await connection.query(
      `SELECT id, nombre, email, telefono, activo
       FROM usuarios
       WHERE ${isAdminRoleExpr}
       ORDER BY activo DESC, nombre ASC`
    );

    return res.json({
      success: true,
      administradores: rows
    });
  } catch (error) {
    console.error('Error en listarAdministradores:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al listar administradores'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.crearAdministrador = async (req, res) => {
  const { nombre, email, password, telefono } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'nombre, email y password son requeridos'
    });
  }

  let connection;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await pool.getConnection();
    const roleColumn = await resolveRoleColumnName(connection);

    if (!roleColumn) {
      return res.status(500).json({
        success: false,
        error: 'No se encontro columna de rol en usuarios (rol, id_rol o rol_id)'
      });
    }

    const roleValue = await resolveRoleValueForColumn(connection, roleColumn, ADMIN_ROLE_ID, 'administrador');
    await connection.beginTransaction();

    const [resultado] = await connection.query(
      'CALL sp_registrar_usuario(?, ?, ?, ?)',
      [nombre, email, hashedPassword, telefono || null]
    );

    const registro = resultado?.[0]?.[0];

    if (!registro || registro.resultado !== 'ok') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: registro?.mensaje || 'No se pudo registrar el administrador'
      });
    }

    const idUsuario = Number(registro.id_usuario);

    await connection.query(
      `UPDATE usuarios
       SET ${roleColumn} = ?
       WHERE id = ?`,
      [roleValue, idUsuario]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Administrador creado correctamente',
      administrador: {
        id: idUsuario,
        nombre,
        email,
        telefono: telefono || null,
        rol: 'administrador',
        rol_id: ADMIN_ROLE_ID,
        rol_guardado: roleValue
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error en crearAdministrador:', error);
    return res.status(500).json({
      success: false,
      error: error?.sqlMessage || error?.message || 'Error al crear administrador'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.cambiarPasswordAdministrador = async (req, res) => {
  const adminId = Number(req.params.id);
  const { password } = req.body;

  if (Number.isNaN(adminId) || adminId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'ID de administrador invalido'
    });
  }

  if (!password || password.toString().trim().length < 4) {
    return res.status(400).json({
      success: false,
      error: 'La nueva contraseña debe tener al menos 4 caracteres'
    });
  }

  let connection;

  try {
    const hashedPassword = await bcrypt.hash(password.toString().trim(), 10);
    connection = await pool.getConnection();
    const roleColumn = await resolveRoleColumnName(connection);

    if (!roleColumn) {
      return res.status(500).json({
        success: false,
        error: 'No se encontro columna de rol en usuarios (rol, id_rol o rol_id)'
      });
    }

    const isAdminRoleExpr = buildAdminRoleExpr(roleColumn);

    const [targetRows] = await connection.query(
      `SELECT id
       FROM usuarios
       WHERE id = ? AND ${isAdminRoleExpr}
       LIMIT 1`,
      [adminId]
    );

    if (!targetRows[0]) {
      return res.status(404).json({
        success: false,
        error: 'Administrador no encontrado'
      });
    }

    await connection.query(
      `UPDATE usuarios
       SET password = ?
       WHERE id = ?`,
      [hashedPassword, adminId]
    );

    return res.json({
      success: true,
      message: 'Contraseña de administrador actualizada'
    });
  } catch (error) {
    console.error('Error en cambiarPasswordAdministrador:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al cambiar contraseña de administrador'
    });
  } finally {
    if (connection) connection.release();
  }
};
