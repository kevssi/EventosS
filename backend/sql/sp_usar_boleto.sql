-- =========================================================
-- Procedimiento: sp_usar_boleto
-- Marca un boleto como usado de forma atomica y evita reuso.
-- Compatible con esquemas que usen alguna de estas variantes:
--   Tabla: boletos | boleto
--   ID: id | id_boleto | boleto_id
--   QR: codigo_qr | qr_code | codigo
--   Usado: usado | is_used | utilizado
--   Estado: estado | estatus | status
--   Fecha uso: fecha_uso | usado_en | used_at | fecha_validacion
--
-- Ejecuta este script en tu base MySQL.
-- =========================================================

DROP PROCEDURE IF EXISTS sp_usar_boleto;
DELIMITER $$

CREATE PROCEDURE sp_usar_boleto(
  IN p_codigo_qr VARCHAR(255)
)
BEGIN
  DECLARE v_table_name VARCHAR(64);
  DECLARE v_id_col VARCHAR(64);
  DECLARE v_qr_col VARCHAR(64);
  DECLARE v_used_col VARCHAR(64);
  DECLARE v_status_col VARCHAR(64);
  DECLARE v_used_at_col VARCHAR(64);
  DECLARE v_sql LONGTEXT;
  DECLARE v_set_clause LONGTEXT DEFAULT '';
  DECLARE v_rows_affected INT DEFAULT 0;
  DECLARE v_estado_normalizado VARCHAR(64) DEFAULT '';

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SELECT 'error' AS resultado, 'Error SQL al validar el boleto' AS mensaje, NULL AS boleto_id;
  END;

  SET @p_qr = TRIM(COALESCE(p_codigo_qr, ''));

  IF @p_qr = '' THEN
    SELECT 'error' AS resultado, 'Codigo QR requerido' AS mensaje, NULL AS boleto_id;
  ELSE
    SELECT t.table_name
      INTO v_table_name
    FROM information_schema.tables t
    WHERE t.table_schema = DATABASE()
      AND t.table_name IN ('boletos', 'boleto')
    ORDER BY FIELD(t.table_name, 'boletos', 'boleto')
    LIMIT 1;

    SELECT c.column_name
      INTO v_id_col
    FROM information_schema.columns c
    WHERE c.table_schema = DATABASE()
      AND c.table_name = v_table_name
      AND c.column_name IN ('id', 'id_boleto', 'boleto_id')
    ORDER BY FIELD(c.column_name, 'id', 'id_boleto', 'boleto_id')
    LIMIT 1;

    SELECT c.column_name
      INTO v_qr_col
    FROM information_schema.columns c
    WHERE c.table_schema = DATABASE()
      AND c.table_name = v_table_name
      AND c.column_name IN ('codigo_qr', 'qr_code', 'codigo')
    ORDER BY FIELD(c.column_name, 'codigo_qr', 'qr_code', 'codigo')
    LIMIT 1;

    SELECT c.column_name
      INTO v_used_col
    FROM information_schema.columns c
    WHERE c.table_schema = DATABASE()
      AND c.table_name = v_table_name
      AND c.column_name IN ('usado', 'is_used', 'utilizado')
    ORDER BY FIELD(c.column_name, 'usado', 'is_used', 'utilizado')
    LIMIT 1;

    SELECT c.column_name
      INTO v_status_col
    FROM information_schema.columns c
    WHERE c.table_schema = DATABASE()
      AND c.table_name = v_table_name
      AND c.column_name IN ('estado', 'estatus', 'status')
    ORDER BY FIELD(c.column_name, 'estado', 'estatus', 'status')
    LIMIT 1;

    SELECT c.column_name
      INTO v_used_at_col
    FROM information_schema.columns c
    WHERE c.table_schema = DATABASE()
      AND c.table_name = v_table_name
      AND c.column_name IN ('fecha_uso', 'usado_en', 'used_at', 'fecha_validacion')
    ORDER BY FIELD(c.column_name, 'fecha_uso', 'usado_en', 'used_at', 'fecha_validacion')
    LIMIT 1;

    IF v_table_name IS NULL OR v_id_col IS NULL OR v_qr_col IS NULL THEN
      SELECT 'error' AS resultado, 'No se pudo localizar la tabla o columnas minimas del boleto' AS mensaje, NULL AS boleto_id;
    ELSEIF v_used_col IS NULL AND v_status_col IS NULL AND v_used_at_col IS NULL THEN
      SELECT 'error' AS resultado, 'El esquema no tiene una columna para marcar el boleto como usado' AS mensaje, NULL AS boleto_id;
    ELSE
      SET @v_boleto_id = NULL;
      SET @v_usado = NULL;
      SET @v_estado = NULL;
      SET @v_fecha_uso = NULL;

      START TRANSACTION;

      SET v_sql = CONCAT(
        'SELECT ',
          '`', REPLACE(v_id_col, '`', '``'), '` AS boleto_id, ',
          IF(v_used_col IS NOT NULL, CONCAT('`', REPLACE(v_used_col, '`', '``'), '`'), 'NULL'), ' AS usado, ',
          IF(v_status_col IS NOT NULL, CONCAT('`', REPLACE(v_status_col, '`', '``'), '`'), 'NULL'), ' AS estado, ',
          IF(v_used_at_col IS NOT NULL, CONCAT('`', REPLACE(v_used_at_col, '`', '``'), '`'), 'NULL'), ' AS fecha_uso ',
        'INTO @v_boleto_id, @v_usado, @v_estado, @v_fecha_uso ',
        'FROM `', REPLACE(v_table_name, '`', '``'), '` ',
        'WHERE `', REPLACE(v_qr_col, '`', '``'), '` = ? ',
        'LIMIT 1 FOR UPDATE'
      );

      PREPARE stmt_select_boleto FROM v_sql;
      EXECUTE stmt_select_boleto USING @p_qr;
      DEALLOCATE PREPARE stmt_select_boleto;

      IF @v_boleto_id IS NULL THEN
        ROLLBACK;
        SELECT 'error' AS resultado, 'El codigo QR no corresponde a un boleto registrado' AS mensaje, NULL AS boleto_id;
      ELSE
        SET v_estado_normalizado = LOWER(TRIM(COALESCE(@v_estado, '')));

        IF COALESCE(@v_usado, 0) = 1
          OR @v_fecha_uso IS NOT NULL
          OR v_estado_normalizado REGEXP 'usad|validad|canjead|consumid'
        THEN
          ROLLBACK;
          SELECT 'error' AS resultado, 'Este boleto ya fue utilizado y es de un solo uso.' AS mensaje, @v_boleto_id AS boleto_id;
        ELSE
          IF v_used_col IS NOT NULL THEN
            SET v_set_clause = CONCAT(v_set_clause, IF(v_set_clause = '', '', ', '), '`', REPLACE(v_used_col, '`', '``'), '` = 1');
          END IF;

          IF v_status_col IS NOT NULL THEN
            SET v_set_clause = CONCAT(v_set_clause, IF(v_set_clause = '', '', ', '), '`', REPLACE(v_status_col, '`', '``'), '` = ''usado''');
          END IF;

          IF v_used_at_col IS NOT NULL THEN
            SET v_set_clause = CONCAT(v_set_clause, IF(v_set_clause = '', '', ', '), '`', REPLACE(v_used_at_col, '`', '``'), '` = NOW()');
          END IF;

          SET v_sql = CONCAT(
            'UPDATE `', REPLACE(v_table_name, '`', '``'), '` ',
            'SET ', v_set_clause, ' ',
            'WHERE `', REPLACE(v_id_col, '`', '``'), '` = ?'
          );

          SET @p_boleto_id = @v_boleto_id;
          PREPARE stmt_update_boleto FROM v_sql;
          EXECUTE stmt_update_boleto USING @p_boleto_id;
          SET v_rows_affected = ROW_COUNT();
          DEALLOCATE PREPARE stmt_update_boleto;

          IF v_rows_affected <> 1 THEN
            ROLLBACK;
            SELECT 'error' AS resultado, 'No se pudo marcar el boleto como usado' AS mensaje, @v_boleto_id AS boleto_id;
          ELSE
            COMMIT;
            SELECT 'ok' AS resultado, 'Boleto validado correctamente (uso unico)' AS mensaje, @v_boleto_id AS boleto_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
END$$

DELIMITER ;