CREATE PROCEDURE sp_confirmar_pago(
    IN p_id_orden INT,
    IN p_metodo_pago VARCHAR(50),
    IN p_estado_pago VARCHAR(50),
    IN p_id_pago_externo VARCHAR(100)
)
BEGIN
    -- Actualizar método y referencia externa siempre
    UPDATE ordenes
    SET 
        metodo_pago = p_metodo_pago,
        id_pago_externo = p_id_pago_externo,
        updated_at = NOW()
    WHERE id = p_id_orden;

    IF p_estado_pago = 'approved' THEN
        UPDATE ordenes
        SET estado = 'pagada'
        WHERE id = p_id_orden AND estado IN ('pendiente', 'reservado');

        UPDATE boletos
        SET estado = 'pagado'
        WHERE id_orden = p_id_orden AND estado IN ('reservado', 'pendiente');

    ELSEIF p_estado_pago = 'pending' THEN
        UPDATE ordenes
        SET estado = 'pendiente'
        WHERE id = p_id_orden AND estado = 'pendiente';

        UPDATE boletos
        SET estado = 'reservado'
        WHERE id_orden = p_id_orden AND estado = 'pendiente';

    ELSEIF p_estado_pago = 'rejected' OR p_estado_pago = 'cancelled' THEN
        UPDATE ordenes
        SET estado = 'cancelada'
        WHERE id = p_id_orden AND estado IN ('pendiente', 'reservado');

        UPDATE boletos
        SET estado = 'cancelado'
        WHERE id_orden = p_id_orden AND estado IN ('pendiente', 'reservado');
    END IF;
END;
