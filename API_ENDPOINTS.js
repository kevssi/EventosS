/** 
 * DOCUMENTACIÓN COMPLETA DE ENDPOINTS API
 * Sistema de Venta de Boletos para Eventos
 * Base URL: http://localhost:5000/api
 */

// ============================================
// 1. AUTENTICACIÓN
// ============================================

// REGISTRAR NUEVO USUARIO
{
  "url": "/auth/registrar",
  "method": "POST",
  "body": {
    "nombre": "Carlos García",
    "email": "carlos@ejemplo.com",
    "password": "123456",
    "telefono": "5512345678"
  },
  "response": {
    "success": true,
    "message": "Usuario registrado correctamente",
    "id_usuario": 1
  }
}

// INICIAR SESIÓN
{
  "url": "/auth/login",
  "method": "POST",
  "body": {
    "email": "carlos@ejemplo.com",
    "password": "123456"
  },
  "response": {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "usuario": {
      "id": 1,
      "nombre": "Carlos García",
      "email": "carlos@ejemplo.com",
      "rol": "usuario",
      "telefono": "5512345678"
    }
  }
}

// OBTENER PERFIL
{
  "url": "/auth/perfil",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "perfil": {
      "id": 1,
      "nombre": "Carlos García",
      "email": "carlos@ejemplo.com",
      "rol": "usuario",
      "telefono": "5512345678",
      "fecha_registro": "2025-03-22T10:30:00",
      "boletos_activos": 3
    }
  }
}

// ACTUALIZAR PERFIL
{
  "url": "/auth/perfil",
  "method": "PUT",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "nombre": "Carlos García López",
    "telefono": "5598765432"
  },
  "response": {
    "success": true,
    "message": "Perfil actualizado correctamente"
  }
}

// CERRAR SESIÓN
{
  "url": "/auth/logout",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "message": "Sesión cerrada correctamente"
  }
}

// ============================================
// 2. EVENTOS
// ============================================

// LISTAR EVENTOS (con filtro opcional)
{
  "url": "/eventos?id_categoria=3",
  "method": "GET",
  "response": {
    "success": true,
    "eventos": [
      {
        "id": 1,
        "titulo": "Comic Fest 2025",
        "descripcion": "El festival de cómics más grande...",
        "fecha_inicio": "2025-09-15T10:00:00",
        "fecha_fin": "2025-09-15T22:00:00",
        "ubicacion": "Centro de Convenciones, CDMX",
        "capacidad": 500,
        "imagen_url": "...",
        "estado": "publicado",
        "categoria": "Cómics y Cultura Pop",
        "organizador": "Ana Organizadora",
        "total_boletos": 350,
        "boletos_disponibles": 150,
        "precio_desde": 150
      }
    ]
  }
}

// OBTENER EVENTO COMPLETO
{
  "url": "/eventos/1",
  "method": "GET",
  "response": {
    "success": true,
    "evento": {
      "id": 1,
      "titulo": "Comic Fest 2025",
      "descripcion": "...",
      "fecha_inicio": "2025-09-15T10:00:00",
      "ubicacion": "Centro de Convenciones, CDMX",
      "capacidad": 500,
      "organizador": "Ana Organizadora",
      "email_organizador": "ana@eventos.com"
    },
    "tipos_boleto": [
      {
        "id": 1,
        "nombre": "General",
        "precio": 250,
        "descripcion": "Acceso a todas las áreas generales",
        "cantidad_total": 350,
        "cantidad_disponible": 150
      },
      {
        "id": 2,
        "nombre": "VIP",
        "precio": 750,
        "descripcion": "Acceso VIP, meet & greet",
        "cantidad_total": 100,
        "cantidad_disponible": 75
      }
    ]
  }
}

// CREAR EVENTO (Solo Organizadores/Admins)
{
  "url": "/eventos",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "titulo": "Concierto de Rock",
    "descripcion": "Descripción del evento...",
    "fecha_inicio": "2025-10-15T20:00:00",
    "fecha_fin": "2025-10-15T23:00:00",
    "ubicacion": "Auditorio Nacional",
    "capacidad": 3000,
    "id_categoria": 1,
    "imagen_url": "https://..."
  },
  "response": {
    "success": true,
    "message": "Evento creado en borrador",
    "id_evento": 2
  }
}

// ACTUALIZAR EVENTO
{
  "url": "/eventos/1",
  "method": "PUT",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "titulo": "Comic Fest 2025 ACTUALIZADO",
    "descripcion": "...",
    "fecha_inicio": "2025-09-15T10:00:00",
    "ubicacion": "Centro de Convenciones",
    "capacidad": 600,
    "estado": "publicado"
  },
  "response": {
    "success": true,
    "message": "Evento actualizado correctamente"
  }
}

// CANCELAR EVENTO
{
  "url": "/eventos/1/cancelar",
  "method": "DELETE",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "motivo": "Fuerza mayor - problemas de logística"
  },
  "response": {
    "success": true,
    "message": "Evento cancelado y boletos actualizados"
  }
}

// LISTAR CATEGORÍAS
{
  "url": "/eventos/categorias/listar",
  "method": "GET",
  "response": {
    "success": true,
    "categorias": [
      {
        "id": 1,
        "nombre": "Música",
        "eventos_disponibles": 5
      },
      {
        "id": 2,
        "nombre": "Tecnología",
        "eventos_disponibles": 3
      }
    ]
  }
}

// ============================================
// 3. BOLETOS
// ============================================

// LISTAR TIPOS DE BOLETO
{
  "url": "/boletos/tipos/1",
  "method": "GET",
  "response": {
    "success": true,
    "tipos_boleto": [
      {
        "id": 1,
        "nombre": "General",
        "precio": 250,
        "descripcion": "Acceso general",
        "disponibles": 150
      }
    ]
  }
}

// VERIFICAR DISPONIBILIDAD
{
  "url": "/boletos/verificar-disponibilidad",
  "method": "POST",
  "body": {
    "id_tipo_boleto": 1,
    "cantidad": 3
  },
  "response": {
    "success": true,
    "disponibilidad": {
      "resultado": "disponible",
      "boletos_disponibles": 150,
      "boletos_solicitados": 3,
      "mensaje": "Hay cupo suficiente"
    }
  }
}

// COMPRAR BOLETOS
{
  "url": "/boletos/comprar",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "id_tipo_boleto": 1,
    "cantidad": 3
  },
  "response": {
    "success": true,
    "message": "Orden creada, procede al pago",
    "orden": {
      "id_orden": 5,
      "total": 750,
      "boletos_reservados": 3
    }
  }
}

// CONFIRMAR PAGO
{
  "url": "/boletos/pago/confirmar",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "id_orden": 5,
    "metodo": "tarjeta_credito",
    "estado_pago": "aprobado",
    "referencia_externa": "PAY-ABC123XYZ"
  },
  "response": {
    "success": true,
    "message": "Pago aprobado. Boletos generados.",
    "id_orden": 5
  }
}

// MIS BOLETOS
{
  "url": "/boletos/mis-boletos",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "boletos": [
      {
        "boleto_id": 1,
        "codigo_qr": "A3X9B2C1D4E5",
        "estado": "pagado",
        "precio_pagado": 250,
        "fecha_compra": "2025-03-22T14:30:00",
        "evento": "Comic Fest 2025",
        "fecha_evento": "2025-09-15T10:00:00",
        "ubicacion": "Centro de Convenciones",
        "tipo_boleto": "General",
        "orden_id": 5
      }
    ]
  }
}

// DETALLE BOLETO
{
  "url": "/boletos/detalle/1",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "boleto": {
      "id": 1,
      "codigo_qr": "A3X9B2C1D4E5",
      "estado": "pagado",
      "precio_pagado": 250,
      "comprador": "Carlos García",
      "email_comprador": "carlos@ejemplo.com",
      "evento": "Comic Fest 2025",
      "fecha_evento": "2025-09-15T10:00:00",
      "tipo_boleto": "General"
    }
  }
}

// USAR BOLETO (Validar QR)
{
  "url": "/boletos/usar",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "codigo_qr": "A3X9B2C1D4E5"
  },
  "response": {
    "success": true,
    "message": "✅ Acceso permitido",
    "boleto_id": 1
  }
}

// MIS ÓRDENES
{
  "url": "/boletos/ordenes/listar",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "ordenes": [
      {
        "orden_id": 5,
        "total": 750,
        "estado": "pagada",
        "fecha_orden": "2025-03-22T14:30:00",
        "cantidad_boletos": 3,
        "evento": "Comic Fest 2025",
        "estado_pago": "aprobado",
        "metodo_pago": "tarjeta_credito"
      }
    ]
  }
}

// CANCELAR ORDEN
{
  "url": "/boletos/ordenes/5/cancelar",
  "method": "DELETE",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "message": "Orden cancelada correctamente"
  }
}

// ============================================
// 4. REPORTES
// ============================================

// REPORTE VENTAS EVENTO (Organizador)
{
  "url": "/reportes/evento/1",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "resumen": {
      "titulo": "Comic Fest 2025",
      "capacidad": 500,
      "total_vendidos": 150,
      "ingresos_totales": 37500,
      "lugares_disponibles": 350,
      "porcentaje_ocupacion": 30
    },
    "desglose": [
      {
        "tipo": "General",
        "precio": 250,
        "cantidad_total": 350,
        "vendidos": 100,
        "disponibles": 250,
        "ingresos_por_tipo": 25000
      }
    ]
  }
}

// REPORTE GENERAL (Admin)
{
  "url": "/reportes/admin/general",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "resumen": {
      "total_usuarios": 45,
      "eventos_activos": 8,
      "boletos_vendidos": 1250,
      "ingresos_totales": 312500,
      "ordenes_pendientes": 3
    },
    "top_eventos": [
      {
        "titulo": "Comic Fest 2025",
        "boletos_vendidos": 350,
        "ingresos": 87500
      }
    ]
  }
}

// LISTAR USUARIOS (Admin)
{
  "url": "/reportes/admin/usuarios",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "response": {
    "success": true,
    "usuarios": [
      {
        "id": 1,
        "nombre": "Carlos García",
        "email": "carlos@ejemplo.com",
        "rol": "usuario",
        "activo": 1,
        "fecha_registro": "2025-03-20T10:00:00",
        "compras_realizadas": 5,
        "boletos_activos": 3
      }
    ]
  }
}

// DESACTIVAR USUARIO (Admin)
{
  "url": "/reportes/admin/desactivar-usuario",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer TOKEN_JWT"
  },
  "body": {
    "id_usuario": 10,
    "activo": 0
  },
  "response": {
    "success": true,
    "message": "Usuario desactivado"
  }
}

// ============================================
// CÓDIGOS DE RESPUESTA HTTP
// ============================================

/*
200 OK              - Solicitud exitosa
201 Created         - Recurso creado exitosamente
400 Bad Request     - Error en los parámetros
401 Unauthorized    - Token inválido/expirado
403 Forbidden       - Permisos insuficientes
404 Not Found       - Recurso no encontrado
500 Server Error    - Error del servidor
*/

// ============================================
// ESTRUCTURA DE TOKEN JWT
// ============================================

/*
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "id": 1,
  "email": "carlos@ejemplo.com",
  "nombre": "Carlos García",
  "rol": "usuario",
  "iat": 1679999999,
  "exp": 1680086399
}

Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
*/
