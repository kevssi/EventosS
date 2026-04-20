-- Procedimiento almacenado: sp_mis_boletos
-- Ajusta los nombres de tabla/campos si es necesario

DELIMITER //
CREATE PROCEDURE sp_mis_boletos(IN p_usuario_id INT)
BEGIN
    SELECT 
        b.id,
        b.codigo_qr,
        b.precio_pagado,
        b.estado,
        b.fecha_compra,
        tb.nombre AS tipo_boleto,
        tb.ubicacion,
        e.titulo AS evento,
        e.fecha_evento
    FROM boletos b
    JOIN tipos_boleto tb ON b.id_tipo_boleto = tb.id
    JOIN eventos e ON tb.id_evento = e.id
        WHERE b.id_usuario = p_usuario_id
            AND (b.estado = 'pagado' OR b.estado = 'reservado');
END //
DELIMITER ;
