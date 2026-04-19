  // STRIPE
  crearSesionStripe(payload) {
    return this.request('/boletos/pago/stripe/sesion', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
// Configuración de API
const API_URL = window.ENV_API_URL || 'https://eventoss-production.up.railway.app/api';

class APIClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        const requestError = new Error(data.error || 'Error en la solicitud');
        requestError.status = response.status;
        requestError.payload = data;
        throw requestError;
      }

      return data;
    } catch (error) {
      console.error('Error en API:', error);
      throw error;
    }
  }

  // AUTENTICACIÓN
  registrar(nombre, email, password, telefono) {
    return this.request('/auth/registrar', {
      method: 'POST',
      body: JSON.stringify({ nombre, email, password, telefono })
    });
  }

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  obtenerPerfil() {
    return this.request('/auth/perfil');
  }

  // EVENTOS
  listarEventos(options = {}) {
    const normalized = typeof options === 'object' && options !== null
      ? options
      : { id_categoria: options };

    const searchParams = new URLSearchParams();

    if (normalized.id_categoria) {
      searchParams.set('id_categoria', normalized.id_categoria);
    }

    if (normalized.q) {
      searchParams.set('q', normalized.q);
    }

    if (normalized.tipo) {
      searchParams.set('tipo', normalized.tipo);
    }

    if (normalized.limit) {
      searchParams.set('limit', normalized.limit);
    }

    if (normalized.realtime) {
      searchParams.set('realtime', normalized.realtime);
    }

    const params = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/eventos${params}`);
  }

  obtenerEvento(id) {
    return this.request(`/eventos/${id}`);
  }

  crearEvento(evento) {
    return this.request('/eventos', {
      method: 'POST',
      body: JSON.stringify(evento)
    });
  }

  actualizarEvento(id, evento) {
    return this.request(`/eventos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(evento)
    });
  }

  cancelarEvento(id, motivo) {
    return this.request(`/eventos/${id}/cancelar`, {
      method: 'DELETE',
      body: JSON.stringify({ motivo })
    });
  }

  listarCategorias() {
    return this.request('/eventos/categorias/listar');
  }

  listarMisEventos() {
    return this.request('/eventos/mis-eventos/listar');
  }

  listarEventosPendientes() {
    return this.request('/eventos/admin/pendientes');
  }

  cambiarEstadoEvento(id, estado, motivo) {
    return this.request(`/eventos/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, motivo })
    });
  }

  obtenerImagenArtista(artista) {
    const query = new URLSearchParams({ artista: artista || '' }).toString();
    return this.request(`/eventos/imagen-artista?${query}`);
  }

  // BOLETOS
  listarTiposBoleto(id_evento) {
    return this.request(`/boletos/tipos/${id_evento}`);
  }

  verificarDisponibilidad(id_tipo_boleto, cantidad) {
    return this.request('/boletos/verificar-disponibilidad', {
      method: 'POST',
      body: JSON.stringify({ id_tipo_boleto, cantidad })
    });
  }

  comprarBoletos(id_tipo_boleto, cantidad) {
    return this.request('/boletos/comprar', {
      method: 'POST',
      body: JSON.stringify({ id_tipo_boleto, cantidad })
    });
  }

  confirmarPago(id_orden, metodo, estado_pago, referencia_externa) {
    return this.request('/boletos/pago/confirmar', {
      method: 'POST',
      body: JSON.stringify({ id_orden, metodo, estado_pago, referencia_externa })
    });
  }

  crearPreferenciaMercadoPago(payload) {
    return this.request('/boletos/pago/mercadopago/preferencia', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  validarRetornoMercadoPago(params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        searchParams.set(key, String(value));
      }
    });

    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/boletos/pago/mercadopago/retorno${suffix}`);
  }

  vincularOAuthMercadoPago(code, redirect_uri, code_verifier) {
    return this.request('/auth/mercadopago/oauth/vincular', {
      method: 'POST',
      body: JSON.stringify({ code, redirect_uri, code_verifier })
    });
  }

  misBoletos() {
    return this.request('/boletos/mis-boletos');
  }

  detalleBoleto(id) {
    return this.request(`/boletos/detalle/${id}`);
  }

  detalleBoletoPorQR(qr) {
    const query = encodeURIComponent(String(qr || ''));
    return this.request(`/boletos/detalle-qr?qr=${query}`);
  }

  detalleBoletoPublico(id) {
    return this.request(`/boletos/detalle-publico/${id}`);
  }

  usarBoleto(codigo_qr) {
    return this.request('/boletos/usar', {
      method: 'POST',
      body: JSON.stringify({ codigo_qr })
    });
  }

  misOrdenes() {
    return this.request('/boletos/ordenes/listar');
  }

  cancelarOrden(id) {
    return this.request(`/boletos/ordenes/${id}/cancelar`, {
      method: 'DELETE'
    });
  }

  verificarPagoOrden(id) {
    return this.request(`/boletos/ordenes/${id}/verificar-pago`);
  }

  // REPORTES
  reporteVentasEvento(id_evento) {
    return this.request(`/reportes/evento/${id_evento}`);
  }

  subirImagen(formData) {
    return fetch(`${API_URL}/upload/imagen`, {
      method: 'POST',
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : ''
      },
      body: formData
    }).then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al subir imagen');
      }
      // Cloudinary responde con { success: true, url: ... }
      return response.json();
    });
  }

  reporteGeneralAdmin() {
    return this.request('/reportes/admin/general');
  }

  listarUsuarios() {
    return this.request('/reportes/admin/usuarios');
  }

  historialComprasUsuario(id_usuario) {
    return this.request(`/reportes/admin/usuarios/${id_usuario}/compras`);
  }

  desactivarUsuario(id_usuario, activo) {
    return this.request('/reportes/admin/desactivar-usuario', {
      method: 'POST',
      body: JSON.stringify({ id_usuario, activo })
    });
  }

  eliminarUsuario(id_usuario) {
    return this.request(`/reportes/admin/usuarios/${id_usuario}`, {
      method: 'DELETE'
    });
  }

  // ADMIN - SOLICITUDES DE ORGANIZADOR
  enviarSolicitudOrganizador(payload) {
    return this.request('/admin/solicitudes-organizador', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  miSolicitudOrganizador() {
    return this.request('/admin/solicitudes-organizador/mia');
  }

  listarSolicitudesOrganizador(estado = null) {
    const params = estado ? `?estado=${encodeURIComponent(estado)}` : '';
    return this.request(`/admin/solicitudes-organizador${params}`);
  }

  aprobarSolicitudOrganizador(id) {
    return this.request(`/admin/solicitudes-organizador/${id}/aprobar`, {
      method: 'POST'
    });
  }

  rechazarSolicitudOrganizador(id, motivo_rechazo) {
    return this.request(`/admin/solicitudes-organizador/${id}/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivo_rechazo })
    });
  }

  listarAdministradores() {
    return this.request('/admin/administradores');
  }

  crearAdministrador(payload) {
    return this.request('/admin/administradores', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  cambiarPasswordAdministrador(id, password) {
    return this.request(`/admin/administradores/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  limpiarToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  obtenerToken() {
    return this.token;
  }
}

// Instancia global
const api = new APIClient();
