-- =========================================================
-- Tabla: solicitudes_organizador
-- Ejecuta este script en tu base de datos MySQL
-- =========================================================

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

  CONSTRAINT fk_solicitud_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id),

  CONSTRAINT fk_solicitud_admin_revision
    FOREIGN KEY (id_admin_revision) REFERENCES usuarios(id),

  INDEX idx_solicitudes_usuario_estado (id_usuario, estado),
  INDEX idx_solicitudes_estado_fecha (estado, fecha_solicitud)
);
