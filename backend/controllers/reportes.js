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

  try {
    const connection = await pool.getConnection();
    const [resultado] = await connection.query(
      'CALL sp_desactivar_usuario(?, ?, ?)',
      [req.user.id, parseInt(id_usuario), activo ? 1 : 0]
    );

    await connection.release();

    res.json({
      success: true,
      message: resultado[0][0].mensaje
    });
  } catch (error) {
    console.error('Error en desactivarUsuario:', error);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
};
