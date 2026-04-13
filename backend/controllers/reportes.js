const pool = require('../config/database');

// Reporte de ventas de un evento
exports.reporteVentasEvento = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_reporte_ventas_evento(?, ?)',
      [parseInt(id_evento), req.user.id]
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
      desglose: resultado[1]
    });
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

  try {
    const connection = await pool.getConnection();
    const [deleteResult] = await connection.query('DELETE FROM usuarios WHERE id = ? LIMIT 1', [userId]);
    await connection.release();

    if (!deleteResult?.affectedRows) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    return res.json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error en eliminarUsuario:', error);

    if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar: el usuario tiene registros relacionados. Puedes desactivarlo en su lugar.'
      });
    }

    return res.status(500).json({ success: false, error: 'Error al eliminar usuario' });
  }
};
