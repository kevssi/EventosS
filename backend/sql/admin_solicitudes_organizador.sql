-- =========================================================
-- ADMINISTRACION DE SOLICITUDES DE ORGANIZADOR
-- Ejecuta este script en tu BD MySQL.
-- =========================================================

-- 1) Tabla principal
CREATE TABLE IF NOT EXISTS solicitudes_organizador (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  organizacion VARCHAR(180) NOT NULL,
  experiencia TEXT NOT NULL,
  telefono_contacto VARCHAR(50) NULL,
  comentarios TEXT NULL,
  estado ENUM('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
  motivo_rechazo TEXT NULL,
  id_admin_revision INT NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_revision DATETIME NULL,
  CONSTRAINT fk_solicitud_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
  CONSTRAINT fk_solicitud_admin_revision FOREIGN KEY (id_admin_revision) REFERENCES usuarios(id),
  INDEX idx_solicitudes_usuario_estado (id_usuario, estado),
  INDEX idx_solicitudes_estado_fecha (estado, fecha_solicitud)
);

-- 2) Asegurar rol de organizador en tabla usuarios (si no existe como enum)
-- Si tu columna rol ya es VARCHAR o ya contiene 'organizador', omite este ALTER.
-- ALTER TABLE usuarios MODIFY rol ENUM('usuario', 'organizador', 'administrador') NOT NULL DEFAULT 'usuario';

-- 3) Procedimiento: crear solicitud
DROP PROCEDURE IF EXISTS sp_crear_solicitud_organizador;
DELIMITER $$
CREATE PROCEDURE sp_crear_solicitud_organizador(
  IN p_id_usuario INT,
  IN p_organizacion VARCHAR(180),
  IN p_experiencia TEXT,
  IN p_telefono_contacto VARCHAR(50),
  IN p_comentarios TEXT
)
BEGIN
  DECLARE v_nombre VARCHAR(150);
  DECLARE v_email VARCHAR(150);
  DECLARE v_rol VARCHAR(50);
  DECLARE v_activo TINYINT;

  SELECT nombre, email, rol, activo
  INTO v_nombre, v_email, v_rol, v_activo
  FROM usuarios
  WHERE id = p_id_usuario
  LIMIT 1;

  IF v_nombre IS NULL OR v_activo <> 1 THEN
    SELECT 'error' AS resultado, 'Usuario no encontrado o inactivo' AS mensaje;
  ELSEIF LOWER(v_rol) IN ('organizador', 'administrador') THEN
    SELECT 'error' AS resultado, 'La cuenta ya tiene permisos de organizador' AS mensaje;
  ELSEIF EXISTS (
    SELECT 1
    FROM solicitudes_organizador
    WHERE id_usuario = p_id_usuario
      AND estado = 'pendiente'
    LIMIT 1
  ) THEN
    SELECT 'error' AS resultado, 'Ya existe una solicitud pendiente' AS mensaje;
  ELSE
    INSERT INTO solicitudes_organizador (
      id_usuario,
      nombre_completo,
      email,
      organizacion,
      experiencia,
      telefono_contacto,
      comentarios,
      estado,
      fecha_solicitud
    ) VALUES (
      p_id_usuario,
      v_nombre,
      v_email,
      p_organizacion,
      p_experiencia,
      p_telefono_contacto,
      p_comentarios,
      'pendiente',
      NOW()
    );

    SELECT 'ok' AS resultado, 'Solicitud enviada correctamente' AS mensaje, LAST_INSERT_ID() AS id_solicitud;
  END IF;
END$$
DELIMITER ;

-- 4) Procedimiento: listar solicitudes
DROP PROCEDURE IF EXISTS sp_listar_solicitudes_organizador;
DELIMITER $$
CREATE PROCEDURE sp_listar_solicitudes_organizador(
  IN p_estado VARCHAR(20)
)
BEGIN
  SELECT
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
  WHERE (p_estado IS NULL OR p_estado = '' OR s.estado = p_estado)
  ORDER BY
    CASE s.estado WHEN 'pendiente' THEN 0 WHEN 'aprobada' THEN 1 ELSE 2 END,
    s.fecha_solicitud DESC;

  SELECT
    SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
    SUM(CASE WHEN estado = 'aprobada' THEN 1 ELSE 0 END) AS aprobadas,
    SUM(CASE WHEN estado = 'rechazada' THEN 1 ELSE 0 END) AS rechazadas,
    COUNT(*) AS total
  FROM solicitudes_organizador;
END$$
DELIMITER ;

-- 5) Procedimiento: aprobar solicitud
DROP PROCEDURE IF EXISTS sp_aprobar_solicitud_organizador;
DELIMITER $$
CREATE PROCEDURE sp_aprobar_solicitud_organizador(
  IN p_id_solicitud INT,
  IN p_id_admin INT
)
BEGIN
  DECLARE v_id_usuario INT;
  DECLARE v_estado VARCHAR(20);

  START TRANSACTION;

  SELECT id_usuario, estado
  INTO v_id_usuario, v_estado
  FROM solicitudes_organizador
  WHERE id = p_id_solicitud
  FOR UPDATE;

  IF v_id_usuario IS NULL THEN
    ROLLBACK;
    SELECT 'error' AS resultado, 'Solicitud no encontrada' AS mensaje;
  ELSEIF v_estado <> 'pendiente' THEN
    ROLLBACK;
    SELECT 'error' AS resultado, 'Solo se pueden aprobar solicitudes pendientes' AS mensaje;
  ELSE
    UPDATE solicitudes_organizador
    SET estado = 'aprobada',
        motivo_rechazo = NULL,
        id_admin_revision = p_id_admin,
        fecha_revision = NOW()
    WHERE id = p_id_solicitud;

    UPDATE usuarios
    SET rol = 'organizador'
    WHERE id = v_id_usuario;

    COMMIT;
    SELECT 'ok' AS resultado, 'Solicitud aprobada correctamente' AS mensaje;
  END IF;
END$$
DELIMITER ;

-- 6) Procedimiento: rechazar solicitud
DROP PROCEDURE IF EXISTS sp_rechazar_solicitud_organizador;
DELIMITER $$
CREATE PROCEDURE sp_rechazar_solicitud_organizador(
  IN p_id_solicitud INT,
  IN p_id_admin INT,
  IN p_motivo_rechazo TEXT
)
BEGIN
  DECLARE v_estado VARCHAR(20);

  SELECT estado
  INTO v_estado
  FROM solicitudes_organizador
  WHERE id = p_id_solicitud
  LIMIT 1;

  IF v_estado IS NULL THEN
    SELECT 'error' AS resultado, 'Solicitud no encontrada' AS mensaje;
  ELSEIF v_estado <> 'pendiente' THEN
    SELECT 'error' AS resultado, 'Solo se pueden rechazar solicitudes pendientes' AS mensaje;
  ELSE
    UPDATE solicitudes_organizador
    SET estado = 'rechazada',
        motivo_rechazo = p_motivo_rechazo,
        id_admin_revision = p_id_admin,
        fecha_revision = NOW()
    WHERE id = p_id_solicitud;

    SELECT 'ok' AS resultado, 'Solicitud rechazada correctamente' AS mensaje;
  END IF;
END$$
DELIMITER ;
