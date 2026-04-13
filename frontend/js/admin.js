// Módulo de administración
const AdminModule = {
  usuario: null,
  usuarios: [],
  administradores: [],
  eventos: [],
  categoriasEvento: [],
  topEventosVentas: [],
  historialComprasUsuarioActual: null,
  historialCompras: [],
  reporteEventoSeleccionado: null,
  solicitudes: [],
  resumenSolicitudes: null,
  filtroSolicitudes: null,
  solicitudSeleccionadaId: null,
  solicitudesError: '',
  tab_activo: 'dashboard',
  autoRefreshMs: 12000,
  autoRefreshTimer: null,
  isAutoRefreshing: false,

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatMultiline(value) {
    return this.escapeHtml(value || 'No especificado').replace(/\n/g, '<br>');
  },

  formatCurrency(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : '$0.00';
  },

  formatDate(value) {
    if (!value) return 'No definido';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'No definido' : parsed.toLocaleString();
  },

  isAdminRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    return value === 'administrador' || value === 'admin' || value === '3';
  },

  async init() {
    this.usuario = JSON.parse(localStorage.getItem('usuario'));
    this.verificarPermiso();
    await this.cargarDatos();
    this.setupEventListeners();
    this.bindForms();
    this.startAutoRefresh();
  },

  verificarPermiso() {
    if (!this.isAdminRole(this.usuario?.rol)) {
      window.location.href = 'inicio.html';
    }
  },

  async cargarDatos() {
    await this.cargarReportesAdmin();
    await this.cargarCategoriasEvento();
    await this.cargarEventosAdmin();
    await this.cargarUsuarios();
    await this.cargarSolicitudesOrganizador();
    await this.cargarAdministradores();
    this.renderCrearAdmin();
    this.renderPasswordAdmin();
    this.renderVentas();
  },

  async cargarReportesAdmin() {
    try {
      const response = await api.reporteGeneralAdmin();
      this.topEventosVentas = response.top_eventos || [];
      this.renderDashboard(response);
      if (this.tab_activo === 'ventas') {
        this.renderVentas();
      }
    } catch (error) {
      console.error('Error al cargar reportes:', error);
    }
  },

  renderDashboard(response) {
    const container = document.querySelector('#tabDashboard');
    if (!container) return;

    const resumen = response.resumen || {};
    const topEventos = response.top_eventos || [];
    const totalUsuarios = Number(resumen.total_usuarios || resumen.usuarios_activos || 0);
    const eventosActivos = Number(resumen.eventos_activos || resumen.eventos_publicados || 0);
    const boletosVendidos = Number(resumen.boletos_vendidos || resumen.vendidos || 0);

    container.innerHTML = `
      <div class="resumen-cards">
        <div class="resumen-card success">
          <h3>Usuarios Activos</h3>
          <div class="valor">${totalUsuarios}</div>
        </div>
        <div class="resumen-card">
          <h3>Eventos Publicados</h3>
          <div class="valor">${eventosActivos}</div>
        </div>
        <div class="resumen-card warning">
          <h3>Boletos Vendidos</h3>
          <div class="valor">${boletosVendidos}</div>
        </div>
      </div>

      ${this.resumenSolicitudes ? `
      <div class="resumen-cards" style="margin-bottom: 20px;">
        <div class="resumen-card warning">
          <h3>Solicitudes Pendientes</h3>
          <div class="valor">${this.resumenSolicitudes.pendientes || 0}</div>
        </div>
        <div class="resumen-card success">
          <h3>Solicitudes Aprobadas</h3>
          <div class="valor">${this.resumenSolicitudes.aprobadas || 0}</div>
        </div>
        <div class="resumen-card danger">
          <h3>Solicitudes Rechazadas</h3>
          <div class="valor">${this.resumenSolicitudes.rechazadas || 0}</div>
        </div>
        <div class="resumen-card">
          <h3>Total Solicitudes</h3>
          <div class="valor">${this.resumenSolicitudes.total || 0}</div>
        </div>
      </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <h2>Top 5 Eventos con Mayor Venta</h2>
        </div>
        <table class="tabla-eventos-admin">
          <thead>
            <tr>
              <th>Evento</th>
              <th>Boletos Vendidos</th>
              <th>Ingresos</th>
            </tr>
          </thead>
          <tbody>
            ${topEventos.map(evento => `
              <tr>
                <td>${evento.titulo}</td>
                <td><strong>${evento.boletos_vendidos}</strong></td>
                <td>$${parseFloat(evento.ingresos).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async cargarUsuarios() {
    try {
      const response = await api.listarUsuarios();
      this.usuarios = response.usuarios;
      this.renderUsuarios();
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  },

  async cargarCategoriasEvento() {
    try {
      const response = await api.listarCategorias();
      this.categoriasEvento = response.categorias || [];
    } catch (error) {
      console.error('Error al cargar categorias de evento:', error);
      this.categoriasEvento = [];
    }
  },

  async cargarEventosAdmin() {
    try {
      const response = await api.listarEventos({ realtime: 1 });
      this.eventos = response.eventos || [];
      this.renderEventosAdmin();
      if (this.tab_activo === 'ventas') {
        this.renderVentas();
      }
    } catch (error) {
      console.error('Error al cargar eventos admin:', error);
    }
  },

  renderEventosAdmin() {
    const container = document.querySelector('#tabEventos');
    if (!container) return;

    const total = this.eventos.length;
    const publicados = this.eventos.filter((evento) => String(evento.estado || '').toLowerCase() === 'publicado').length;
    const borrador = this.eventos.filter((evento) => String(evento.estado || '').toLowerCase() === 'borrador').length;
    const cancelados = this.eventos.filter((evento) => String(evento.estado || '').toLowerCase() === 'cancelado').length;

    const categoryOptions = this.categoriasEvento.map((categoria) => (
      `<option value="${categoria.id}">${this.escapeHtml(categoria.nombre)}</option>`
    )).join('');

    container.innerHTML = `
      <div class="resumen-cards">
        <div class="resumen-card"><h3>Total Eventos</h3><div class="valor">${total}</div></div>
        <div class="resumen-card success"><h3>Publicados</h3><div class="valor">${publicados}</div></div>
        <div class="resumen-card warning"><h3>Borrador</h3><div class="valor">${borrador}</div></div>
        <div class="resumen-card danger"><h3>Cancelados</h3><div class="valor">${cancelados}</div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Gestion de eventos</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Fecha</th>
              <th>Sede</th>
              <th>Categoria</th>
              <th>Precio base</th>
              <th>Disponibilidad</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${this.eventos.length === 0 ? '<tr><td colspan="8" style="text-align:center; color: var(--text-light);">No hay eventos registrados.</td></tr>' : this.eventos.map((evento) => `
              <tr>
                <td>${this.escapeHtml(evento.titulo)}</td>
                <td>${this.formatDate(evento.fecha_inicio)}</td>
                <td>${this.escapeHtml(evento.ubicacion || '-')}</td>
                <td>${this.escapeHtml(evento.categoria || '-')}</td>
                <td>${this.formatCurrency(evento.precio_desde)}</td>
                <td>${Number(evento.boletos_disponibles || 0)}</td>
                <td><span class="badge badge-${String(evento.estado || '').toLowerCase() === 'publicado' ? 'success' : String(evento.estado || '').toLowerCase() === 'cancelado' ? 'danger' : 'pending'}">${this.escapeHtml(evento.estado || 'borrador')}</span></td>
                <td>
                  <div class="acciones-evento">
                    <button class="btn btn-accion btn-outline" onclick="AdminModule.mostrarModalEvento(${Number(evento.id)})">Editar</button>
                    <button class="btn btn-accion btn-danger" onclick="AdminModule.cancelarEventoAdmin(${Number(evento.id)})">Eliminar</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.NavbarModule?.renderLucideIcons?.(container);
  },

  mostrarModalEvento(eventoId) {
    const evento = eventoId ? this.eventos.find((item) => Number(item.id) === Number(eventoId)) : null;
    const categoryOptions = this.categoriasEvento.map((c) => (
      `<option value="${c.id}" ${Number(evento?.id_categoria) === Number(c.id) ? 'selected' : ''}>${this.escapeHtml(c.nombre)}</option>`
    )).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalEventoOverlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h2>${evento ? 'Editar evento' : 'Nuevo evento'}</h2>
        <form id="formGestionEvento">
          <input type="hidden" id="eventoIdEditar" value="${evento ? evento.id : ''}">
          <div class="form-group">
            <label for="eventoTitulo">Titulo</label>
            <input type="text" id="eventoTitulo" value="${this.escapeHtml(evento?.titulo || '')}" required>
          </div>
          <div class="form-group">
            <label for="eventoDescripcion">Descripcion</label>
            <textarea id="eventoDescripcion" rows="3">${this.escapeHtml(evento?.descripcion || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="eventoFechaInicio">Fecha y hora de inicio</label>
            <input type="datetime-local" id="eventoFechaInicio" value="${this.toDateInputValue(evento?.fecha_inicio)}" required>
          </div>
          <div class="form-group">
            <label for="eventoFechaFin">Fecha y hora de fin</label>
            <input type="datetime-local" id="eventoFechaFin" value="${this.toDateInputValue(evento?.fecha_fin)}">
          </div>
          <div class="form-group">
            <label for="eventoUbicacion">Sede / ubicacion</label>
            <input type="text" id="eventoUbicacion" value="${this.escapeHtml(evento?.ubicacion || '')}" required>
          </div>
          <div class="form-group">
            <label for="eventoCapacidad">Capacidad</label>
            <input type="number" id="eventoCapacidad" min="1" value="${evento?.capacidad || ''}" required>
          </div>
          <div class="form-group">
            <label for="eventoCategoria">Categoria de evento</label>
            <select id="eventoCategoria">
              <option value="">Sin categoria</option>
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="eventoImagen">Imagen URL</label>
            <input type="url" id="eventoImagen" value="${this.escapeHtml(evento?.imagen_url || '')}">
          </div>
          <div class="form-group">
            <label for="eventoEstado">Estado</label>
            <select id="eventoEstado">
              <option value="borrador" ${(evento?.estado || 'borrador') === 'borrador' ? 'selected' : ''}>Borrador</option>
              <option value="publicado" ${evento?.estado === 'publicado' ? 'selected' : ''}>Publicado</option>
              <option value="cancelado" ${evento?.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="submit" class="btn btn-primary">Guardar evento</button>
            <button type="button" class="btn btn-outline" onclick="AdminModule.cerrarModalEvento()">Cancelar</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.cerrarModalEvento(); });
    overlay.querySelector('#formGestionEvento').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.guardarEventoDesdeFormulario();
    });
  },

  cerrarModalEvento() {
    document.getElementById('modalEventoOverlay')?.remove();
  },

  toDateInputValue(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const offset = parsed.getTimezoneOffset();
    const localDate = new Date(parsed.getTime() - (offset * 60000));
    return localDate.toISOString().slice(0, 16);
  },

  async guardarEventoDesdeFormulario() {
    const id = Number(document.querySelector('#eventoIdEditar')?.value || 0);
    const payload = {
      titulo: document.querySelector('#eventoTitulo')?.value?.trim(),
      descripcion: document.querySelector('#eventoDescripcion')?.value?.trim() || null,
      fecha_inicio: document.querySelector('#eventoFechaInicio')?.value,
      fecha_fin: document.querySelector('#eventoFechaFin')?.value || null,
      ubicacion: document.querySelector('#eventoUbicacion')?.value?.trim(),
      capacidad: Number(document.querySelector('#eventoCapacidad')?.value || 0),
      id_categoria: Number(document.querySelector('#eventoCategoria')?.value || 0) || null,
      imagen_url: document.querySelector('#eventoImagen')?.value?.trim() || null,
      estado: document.querySelector('#eventoEstado')?.value || 'borrador'
    };

    if (!payload.titulo || !payload.fecha_inicio || !payload.ubicacion || !payload.capacidad) {
      alert('Completa titulo, fecha de inicio, ubicacion y capacidad.');
      return;
    }

    try {
      if (id > 0) {
        await api.actualizarEvento(id, payload);
        alert('Evento actualizado correctamente.');
      } else {
        await api.crearEvento(payload);
        alert('Evento creado correctamente.');
      }

      this.cerrarModalEvento();
      await this.cargarEventosAdmin();
      await this.cargarReportesAdmin();
    } catch (error) {
      alert('Error al guardar evento: ' + error.message);
    }
  },

  async cancelarEventoAdmin(eventoId) {
    const motivo = prompt('Escribe motivo de eliminacion/cancelacion:');
    if (!motivo || !motivo.trim()) return;

    try {
      await api.cancelarEvento(eventoId, motivo.trim());
      alert('Evento cancelado correctamente.');
      await this.cargarEventosAdmin();
      await this.cargarReportesAdmin();
    } catch (error) {
      alert('Error al cancelar evento: ' + error.message);
    }
  },

  async verHistorialComprasUsuario(idUsuario) {
    if (!idUsuario) return;

    try {
      const response = await api.historialComprasUsuario(idUsuario);
      this.historialComprasUsuarioActual = response.usuario || null;
      this.historialCompras = response.historial_detallado || response.ordenes || [];
      this.renderUsuarios();
    } catch (error) {
      alert('No se pudo obtener historial de compras: ' + error.message);
    }
  },

  async cargarReporteEventoSeleccionado(idEvento) {
    if (!idEvento) return;

    try {
      const response = await api.reporteVentasEvento(idEvento);
      this.reporteEventoSeleccionado = {
        id_evento: idEvento,
        resumen: response.resumen || null,
        desglose: response.desglose || []
      };
      this.renderVentas();
    } catch (error) {
      alert('No se pudo cargar reporte del evento: ' + error.message);
    }
  },

  renderVentas() {
    const container = document.querySelector('#tabVentas');
    if (!container) return;

    const selectedId = Number(this.reporteEventoSeleccionado?.id_evento || 0);
    const options = this.eventos.map((evento) => (
      `<option value="${evento.id}" ${Number(evento.id) === selectedId ? 'selected' : ''}>${this.escapeHtml(evento.titulo)}</option>`
    )).join('');

    const resumen = this.reporteEventoSeleccionado?.resumen;
    const desglose = this.reporteEventoSeleccionado?.desglose || [];

    const resolveValue = (source, keys, fallback = '') => {
      if (!source || typeof source !== 'object') return fallback;
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return value;
        }
      }
      return fallback;
    };

    const totalIngresos = Number(resolveValue(resumen, ['ingresos_totales', 'ingresos', 'total_ingresos', 'monto_total', 'total'], 0));
    const totalVendidos = Number(resolveValue(resumen, ['boletos_vendidos', 'vendidos', 'cantidad_vendida', 'total_boletos'], 0));
    const totalOrdenes = Number(resolveValue(resumen, ['total_ordenes', 'ordenes', 'ordenes_total', 'cantidad_ordenes'], 0));
    const tituloEvento = resolveValue(resumen, ['titulo', 'evento', 'nombre_evento'], '-');

    const detalleRows = desglose.map((item) => ({
      tipo: resolveValue(item, ['tipo_boleto', 'tipo', 'nombre', 'tipo_nombre', 'categoria', 'descripcion'], '-'),
      vendidos: Number(resolveValue(item, ['vendidos', 'boletos_vendidos', 'cantidad_vendida', 'cantidad', 'total_vendidos'], 0)),
      ingresos: Number(resolveValue(item, ['ingresos', 'total', 'monto', 'importe', 'ingreso_total'], 0))
    }));

    container.innerHTML = `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <h2>Monitoreo de ventas en tiempo real</h2>
        </div>
        <p style="margin: 0 0 12px; color: var(--text-light);">Este modulo se actualiza automaticamente cada ${Math.round(this.autoRefreshMs / 1000)} segundos cuando esta pestaña esta activa.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <select id="ventasEventoSelect" style="min-width: 280px;">
            <option value="">Selecciona un evento para reporte detallado</option>
            ${options}
          </select>
          <button class="btn btn-primary" onclick="AdminModule.cargarReporteEventoDesdeSelect()">Ver reporte evento</button>
          <button class="btn btn-outline" onclick="AdminModule.cargarReportesAdmin()">Actualizar panel</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Reporte detallado por evento</h2>
        </div>
        ${!resumen ? '<p style="color: var(--text-light); margin: 0;">Selecciona un evento para ver desglose de ingresos y boletos vendidos.</p>' : `
          <div class="resumen-cards" style="margin-bottom: 14px;">
            <div class="resumen-card success"><h3>Ingresos</h3><div class="valor">${this.formatCurrency(totalIngresos)}</div></div>
            <div class="resumen-card warning"><h3>Boletos vendidos</h3><div class="valor">${totalVendidos}</div></div>
            <div class="resumen-card"><h3>Ordenes</h3><div class="valor">${totalOrdenes}</div></div>
            <div class="resumen-card"><h3>Evento</h3><div class="valor" style="font-size:1rem;">${this.escapeHtml(tituloEvento)}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tipo boleto</th>
                <th>Vendidos</th>
                <th>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              ${detalleRows.length === 0
                ? '<tr><td colspan="3" style="text-align:center; color: var(--text-light);">Sin detalle disponible para este evento.</td></tr>'
                : detalleRows.map((item) => `
                  <tr>
                    <td>${this.escapeHtml(item.tipo)}</td>
                    <td>${item.vendidos}</td>
                    <td>${this.formatCurrency(item.ingresos)}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        `}
      </div>
    `;
  },

  cargarReporteEventoDesdeSelect() {
    const selectedId = Number(document.querySelector('#ventasEventoSelect')?.value || 0);
    if (!selectedId) {
      alert('Selecciona un evento para generar el reporte.');
      return;
    }

    this.cargarReporteEventoSeleccionado(selectedId);
  },

  async cargarSolicitudesOrganizador(estado = this.filtroSolicitudes) {
    try {
      const response = await api.listarSolicitudesOrganizador(estado || null);
      this.solicitudes = response.solicitudes || [];
      if (this.solicitudes.length > 0) {
        const existeSeleccion = this.solicitudes.some((item) => Number(item.id) === Number(this.solicitudSeleccionadaId));
        if (!existeSeleccion) {
          this.solicitudSeleccionadaId = null;
        }
      } else {
        this.solicitudSeleccionadaId = null;
      }

      this.resumenSolicitudes = response.resumen || null;
      this.filtroSolicitudes = estado || null;
      this.solicitudesError = '';
      this.renderSolicitudesOrganizador();
    } catch (error) {
      console.error('Error al cargar solicitudes de organizador:', error);
      this.solicitudes = [];
      this.solicitudSeleccionadaId = null;
      this.resumenSolicitudes = { pendientes: 0, aprobadas: 0, rechazadas: 0, total: 0 };
      this.filtroSolicitudes = estado || null;
      this.solicitudesError = error?.message || 'No se pudieron cargar las solicitudes';
      this.renderSolicitudesOrganizador();
    }
  },

  renderSolicitudesOrganizador() {
    const container = document.querySelector('#tabSolicitudes');
    if (!container) return;

    const resumen = this.resumenSolicitudes || { pendientes: 0, aprobadas: 0, rechazadas: 0, total: 0 };
    const filtroActual = this.filtroSolicitudes || 'todas';
    const solicitudSeleccionada = this.solicitudes.find((item) => Number(item.id) === Number(this.solicitudSeleccionadaId)) || this.solicitudes[0] || null;

    container.innerHTML = `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <h2>Resumen de Solicitudes</h2>
        </div>
        <div class="resumen-cards" style="margin-bottom: 0;">
          <div class="resumen-card warning">
            <h3>Pendientes</h3>
            <div class="valor">${resumen.pendientes || 0}</div>
          </div>
          <div class="resumen-card success">
            <h3>Aprobadas</h3>
            <div class="valor">${resumen.aprobadas || 0}</div>
          </div>
          <div class="resumen-card danger">
            <h3>Rechazadas</h3>
            <div class="valor">${resumen.rechazadas || 0}</div>
          </div>
          <div class="resumen-card">
            <h3>Total</h3>
            <div class="valor">${resumen.total || 0}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Solicitudes para Organizador</h2>
        </div>

        <div class="solicitudes-filtros">
          <button class="btn ${filtroActual === 'todas' ? 'btn-primary' : 'btn-outline'}" onclick="AdminModule.filtrarSolicitudes(null)">Todas</button>
          <button class="btn ${filtroActual === 'pendiente' ? 'btn-primary' : 'btn-outline'}" onclick="AdminModule.filtrarSolicitudes('pendiente')">Pendientes</button>
          <button class="btn ${filtroActual === 'aprobada' ? 'btn-primary' : 'btn-outline'}" onclick="AdminModule.filtrarSolicitudes('aprobada')">Aprobadas</button>
          <button class="btn ${filtroActual === 'rechazada' ? 'btn-primary' : 'btn-outline'}" onclick="AdminModule.filtrarSolicitudes('rechazada')">Rechazadas</button>
        </div>

        ${this.solicitudesError ? `
          <div class="alert alert-error" style="margin-top: 10px;">
            <span><i data-lucide="triangle-alert"></i></span>
            <span>${this.solicitudesError}</span>
          </div>
        ` : ''}

        ${this.solicitudes.length === 0 ? `
          <div class="solicitudes-empty">No hay solicitudes para el filtro seleccionado.</div>
        ` : `
          <div class="solicitud-lista-wrap">
            <div class="solicitud-lista-title">Solicitudes enlistadas: ${this.solicitudes.length} (haz clic para abrir detalle)</div>
            <div class="solicitudes-lista">
              ${this.solicitudes.map((solicitud) => {
                const isSelected = Number(solicitud.id) === Number(solicitudSeleccionada?.id);
                return `
                  <button
                    type="button"
                    class="solicitud-item ${isSelected ? 'active' : ''}"
                    onclick="AdminModule.seleccionarSolicitud(${solicitud.id})"
                  >
                    <div class="solicitud-item-main">
                      <strong>#${solicitud.id}</strong>
                      <span>${this.escapeHtml(solicitud.nombre_completo)}</span>
                      <small>${this.escapeHtml(solicitud.email)}</small>
                    </div>
                    <div class="solicitud-item-side">
                      <span class="badge badge-${solicitud.estado === 'aprobada' ? 'success' : solicitud.estado === 'rechazada' ? 'danger' : 'pending'}">${this.escapeHtml(solicitud.estado)}</span>
                      <small>${new Date(solicitud.fecha_solicitud).toLocaleDateString()}</small>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          ${solicitudSeleccionada ? `
            <div class="solicitud-detalle">
              <div class="solicitud-detalle-grid">
                <div><strong>ID solicitud:</strong> #${solicitudSeleccionada.id}</div>
                <div><strong>Estado:</strong> <span class="badge badge-${solicitudSeleccionada.estado === 'aprobada' ? 'success' : solicitudSeleccionada.estado === 'rechazada' ? 'danger' : 'pending'}">${this.escapeHtml(solicitudSeleccionada.estado)}</span></div>
                <div><strong>Nombre completo:</strong> ${this.escapeHtml(solicitudSeleccionada.nombre_completo)}</div>
                <div><strong>Email:</strong> ${this.escapeHtml(solicitudSeleccionada.email)}</div>
                <div><strong>Organizacion:</strong> ${this.escapeHtml(solicitudSeleccionada.organizacion)}</div>
                <div><strong>Telefono:</strong> ${this.escapeHtml(solicitudSeleccionada.telefono_contacto || 'No especificado')}</div>
                <div><strong>Fecha de solicitud:</strong> ${new Date(solicitudSeleccionada.fecha_solicitud).toLocaleString()}</div>
                <div><strong>Revisado por:</strong> ${this.escapeHtml(solicitudSeleccionada.admin_revision_nombre || 'Sin revision')}</div>
                <div><strong>Fecha de revision:</strong> ${solicitudSeleccionada.fecha_revision ? new Date(solicitudSeleccionada.fecha_revision).toLocaleString() : 'Sin revision'}</div>
              </div>

              <div class="solicitud-bloque">
                <h3>Experiencia declarada</h3>
                <p>${this.formatMultiline(solicitudSeleccionada.experiencia)}</p>
              </div>

              <div class="solicitud-bloque">
                <h3>Comentarios y metadata enviada</h3>
                <p>${this.formatMultiline(solicitudSeleccionada.comentarios)}</p>
              </div>

              <div class="solicitud-bloque">
                <h3>Motivo de rechazo (si existe)</h3>
                <p>${this.formatMultiline(solicitudSeleccionada.motivo_rechazo)}</p>
              </div>

              <div class="solicitud-acciones-finales">
                ${solicitudSeleccionada.estado === 'pendiente' ? `
                  <button class="btn btn-secondary" onclick="AdminModule.aprobarSolicitud(${solicitudSeleccionada.id})">Aceptar</button>
                  <button class="btn btn-danger" onclick="AdminModule.rechazarSolicitud(${solicitudSeleccionada.id})">Negar</button>
                  <button class="btn btn-outline" onclick="AdminModule.solicitarMasInformacion(${solicitudSeleccionada.id})">Solicitar mas informacion</button>
                ` : '<span style="color: var(--text-light);">Esta solicitud ya fue revisada.</span>'}
              </div>
            </div>
          ` : `
            <div class="solicitud-detalle">
              <p style="margin: 0; color: var(--text-light);">Selecciona una solicitud de la lista para ver toda la informacion.</p>
            </div>
          `}
        `}
      </div>
    `;

    window.NavbarModule?.renderLucideIcons?.(container);
  },

  async filtrarSolicitudes(estado) {
    await this.cargarSolicitudesOrganizador(estado || null);
    if (this.tab_activo !== 'solicitudes') {
      this.cambiarTab('solicitudes');
    }
  },

  seleccionarSolicitud(id) {
    this.solicitudSeleccionadaId = Number(id) || null;
    this.renderSolicitudesOrganizador();
  },

  async aprobarSolicitud(id) {
    if (!confirm('¿Deseas aprobar esta solicitud y convertir al usuario en organizador?')) {
      return;
    }

    try {
      const response = await api.aprobarSolicitudOrganizador(id);
      alert(response.message || 'Solicitud aprobada');
      await this.cargarSolicitudesOrganizador(this.filtroSolicitudes);
      await this.cargarUsuarios();
      await this.cargarReportesAdmin();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },

  async rechazarSolicitud(id) {
    const motivo = prompt('Escribe el motivo de rechazo:');
    if (!motivo || !motivo.trim()) {
      return;
    }

    try {
      const response = await api.rechazarSolicitudOrganizador(id, motivo.trim());
      alert(response.message || 'Solicitud rechazada');
      await this.cargarSolicitudesOrganizador(this.filtroSolicitudes);
      await this.cargarReportesAdmin();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },

  solicitarMasInformacion(id) {
    const solicitud = this.solicitudes.find((item) => Number(item.id) === Number(id));
    if (!solicitud) {
      alert('No se encontro la solicitud.');
      return;
    }

    const mensaje = prompt('Escribe que informacion adicional necesitas del solicitante:');
    if (!mensaje || !mensaje.trim()) {
      return;
    }

    const subject = encodeURIComponent(`Solicitud de informacion adicional - Solicitud #${solicitud.id}`);
    const body = encodeURIComponent(
      `Hola ${solicitud.nombre_completo},\n\n` +
      `Para continuar con la revision de tu solicitud de organizador (#${solicitud.id}), necesitamos la siguiente informacion adicional:\n\n` +
      `${mensaje.trim()}\n\n` +
      'Por favor responde este correo con los datos solicitados.\n\n' +
      'Equipo de Administracion Eventos+'
    );

    window.location.href = `mailto:${solicitud.email}?subject=${subject}&body=${body}`;
  },

  async cargarAdministradores() {
    try {
      const response = await api.listarAdministradores();
      this.administradores = response.administradores || [];
      this.renderPasswordAdmin();
    } catch (error) {
      console.error('Error al cargar administradores:', error);
    }
  },

  renderCrearAdmin() {
    const container = document.querySelector('#tabCrearAdmin');
    if (!container) return;

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Agregar Nuevo Administrador</h2>
        </div>
        <form id="formCrearAdmin" class="form-container" style="max-width: 700px; margin: 0;">
          <div class="form-group">
            <label for="adminNombre">Nombre</label>
            <input type="text" id="adminNombre" required>
          </div>
          <div class="form-group">
            <label for="adminEmail">Email</label>
            <input type="email" id="adminEmail" required>
          </div>
          <div class="form-group">
            <label for="adminTelefono">Teléfono (opcional)</label>
            <input type="text" id="adminTelefono" placeholder="10 numeros" inputmode="numeric" maxlength="10" pattern="^\\d{10}$" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)">
          </div>
          <div class="form-group">
            <label for="adminPassword">Contraseña temporal</label>
            <input type="password" id="adminPassword" minlength="4" required>
          </div>
          <button type="submit" class="btn btn-primary">Crear Administrador</button>
        </form>
      </div>
    `;
  },

  renderPasswordAdmin() {
    const container = document.querySelector('#tabPasswordAdmin');
    if (!container) return;

    const options = this.administradores.map((admin) => (
      `<option value="${admin.id}">${admin.nombre} (${admin.email})</option>`
    )).join('');

    container.innerHTML = `
      <div class="card" style="margin-bottom: 18px;">
        <div class="card-header">
          <h2>Administradores Actuales</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${this.administradores.length === 0
              ? '<tr><td colspan="4" style="text-align:center; color: var(--text-light);">No hay administradores registrados.</td></tr>'
              : this.administradores.map((admin) => `
                <tr>
                  <td>${admin.nombre}</td>
                  <td>${admin.email}</td>
                  <td>${admin.telefono || '-'}</td>
                  <td><span class="badge ${admin.activo ? 'badge-success' : 'badge-danger'}">${admin.activo ? 'Activo' : 'Inactivo'}</span></td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Cambiar Contraseña de Administrador</h2>
        </div>
        <form id="formPasswordAdmin" class="form-container" style="max-width: 700px; margin: 0;">
          <div class="form-group">
            <label for="passwordAdminSelect">Selecciona administrador</label>
            <select id="passwordAdminSelect" required>
              <option value="">Selecciona...</option>
              ${options}
            </select>
          </div>
          <div class="form-group">
            <label for="passwordAdminNueva">Nueva contraseña</label>
            <input type="password" id="passwordAdminNueva" minlength="4" required>
          </div>
          <button type="submit" class="btn btn-primary">Cambiar Contraseña</button>
        </form>
      </div>
    `;
  },

  bindForms() {
    const formCrearAdmin = document.querySelector('#formCrearAdmin');
    if (formCrearAdmin && formCrearAdmin !== this._boundFormCrearAdmin) {
      this._boundFormCrearAdmin = formCrearAdmin;
      formCrearAdmin.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.crearAdminDesdeFormulario();
      });
    }

    const formPasswordAdmin = document.querySelector('#formPasswordAdmin');
    if (formPasswordAdmin && formPasswordAdmin !== this._boundFormPasswordAdmin) {
      this._boundFormPasswordAdmin = formPasswordAdmin;
      formPasswordAdmin.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.cambiarPasswordAdminDesdeFormulario();
      });
    }
  },

  async crearAdminDesdeFormulario() {
    const nombre = document.querySelector('#adminNombre')?.value?.trim();
    const email = document.querySelector('#adminEmail')?.value?.trim();
    const telefonoRaw = document.querySelector('#adminTelefono')?.value?.trim() || '';
    const telefono = telefonoRaw.replace(/\D/g, '');
    const password = document.querySelector('#adminPassword')?.value;

    if (!nombre || !email || !password) {
      alert('Completa nombre, email y contraseña.');
      return;
    }

    if (telefonoRaw && !/^\d{10}$/.test(telefonoRaw)) {
      alert('El telefono debe tener exactamente 10 numeros, sin letras ni espacios.');
      return;
    }

    try {
      const response = await api.crearAdministrador({
        nombre,
        email,
        telefono: telefono || null,
        password
      });

      alert(response.message || 'Administrador creado correctamente');
      document.querySelector('#formCrearAdmin')?.reset();
      await this.cargarAdministradores();
      this.bindForms();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },

  async cambiarPasswordAdminDesdeFormulario() {
    const adminId = Number(document.querySelector('#passwordAdminSelect')?.value || 0);
    const password = document.querySelector('#passwordAdminNueva')?.value;

    if (!adminId || !password) {
      alert('Selecciona administrador y escribe nueva contraseña.');
      return;
    }

    try {
      const response = await api.cambiarPasswordAdministrador(adminId, password);
      alert(response.message || 'Contraseña actualizada');
      document.querySelector('#formPasswordAdmin')?.reset();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },

  renderUsuarios() {
    const container = document.querySelector('#tabUsuarios');
    if (!container) return;

    const toActivo = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'activo';
    };

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Gestión de Usuarios</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Compras</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${this.usuarios.map(usuario => {
              const isActivo = toActivo(usuario.activo);
              const userId = Number(usuario.id || usuario.id_usuario || 0);

              return `
              <tr>
                <td>${usuario.nombre}</td>
                <td>${usuario.email}</td>
                <td>${usuario.rol}</td>
                <td>${usuario.compras_realizadas}</td>
                <td>
                  <span class="badge ${isActivo ? 'badge-success' : 'badge-danger'}">
                    ${isActivo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td class="acciones">
                  <button class="btn btn-accion btn-${isActivo ? 'danger' : 'success'}" 
                          onclick="AdminModule.cambiarEstadoUsuario(${userId}, ${isActivo ? 0 : 1})"
                          ${userId ? '' : 'disabled'}>
                    ${isActivo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button class="btn btn-accion btn-outline" onclick="AdminModule.verHistorialComprasUsuario(${userId})" ${userId ? '' : 'disabled'}>
                    Historial
                  </button>
                  <button class="btn btn-accion btn-outline" onclick="AdminModule.eliminarUsuario(${userId})" ${userId ? '' : 'disabled'}>
                    Eliminar
                  </button>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${this.historialComprasUsuarioActual ? `
        <div class="card" style="margin-top: 16px;">
          <div class="card-header">
            <h2>Historial de compras: ${this.escapeHtml(this.historialComprasUsuarioActual.nombre)} (${this.escapeHtml(this.historialComprasUsuarioActual.email)})</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Fecha</th>
                <th>Evento</th>
                <th>Tipo de boleto</th>
                <th>Cantidad</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${this.historialCompras.length === 0
                ? '<tr><td colspan="7" style="text-align:center; color: var(--text-light);">Este usuario aun no tiene compras registradas.</td></tr>'
                : this.historialCompras.map((orden) => `
                  <tr>
                    <td>#${this.escapeHtml(orden.id_orden || orden.id || '-')}</td>
                    <td>${this.formatDate(orden.fecha_orden || orden.fecha_compra || orden.fecha_pago)}</td>
                    <td>${this.escapeHtml(orden.evento || orden.titulo_evento || '-')}</td>
                    <td>${this.escapeHtml(orden.tipo_boleto || orden.tipo || orden.nombre_tipo || '-')}</td>
                    <td>${Number(orden.cantidad || orden.boletos || 0)}</td>
                    <td>${this.escapeHtml(orden.estado_pago || orden.estado || '-')}</td>
                    <td>${this.formatCurrency(orden.subtotal || orden.total || orden.monto_total || 0)}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  },

  setupEventListeners() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const tabName = btn.dataset.tab;
      if (!tabName) return;
      this.cambiarTab(tabName);
    });
  },

  cambiarTab(tabNombre) {
    if (!tabNombre) return;
    this.tab_activo = tabNombre;

    // Actualizar tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.remove('active');
    });
    const tabButton = document.querySelector(`[data-tab="${tabNombre}"]`);
    if (tabButton) {
      tabButton.classList.add('active');
    }

    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    const tabContent = document.querySelector(`#tab${tabNombre.charAt(0).toUpperCase() + tabNombre.slice(1)}`);
    if (tabContent) {
      tabContent.classList.add('active');
    }
  },

  async cambiarEstadoUsuario(id, activo) {
    try {
      const response = await api.desactivarUsuario(id, activo);
      if (response.success) {
        alert(response.message);
        await this.cargarUsuarios();
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },

  startAutoRefresh() {
    this.stopAutoRefresh();

    this.autoRefreshTimer = setInterval(() => {
      this.refreshTabData();
    }, this.autoRefreshMs);

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.stopAutoRefresh.bind(this));
  },

  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  },

  handleVisibilityChange() {
    if (document.hidden) {
      return;
    }

    AdminModule.refreshTabData();
  },

  async refreshTabData() {
    if (document.hidden || this.isAutoRefreshing) {
      return;
    }

    this.isAutoRefreshing = true;

    try {
      if (this.tab_activo === 'dashboard') {
        await this.cargarReportesAdmin();
        return;
      }

      if (this.tab_activo === 'usuarios') {
        await this.cargarUsuarios();
        return;
      }

      if (this.tab_activo === 'eventos') {
        await this.cargarEventosAdmin();
        await this.cargarReportesAdmin();
        return;
      }

      if (this.tab_activo === 'ventas') {
        await this.cargarReportesAdmin();
        if (this.reporteEventoSeleccionado?.id_evento) {
          await this.cargarReporteEventoSeleccionado(this.reporteEventoSeleccionado.id_evento);
        }
        return;
      }

      if (this.tab_activo === 'solicitudes') {
        await this.cargarSolicitudesOrganizador(this.filtroSolicitudes);
        await this.cargarReportesAdmin();
        return;
      }

      if (this.tab_activo === 'passwordAdmin' || this.tab_activo === 'crearAdmin') {
        await this.cargarAdministradores();
      }
    } catch (error) {
      console.error('Error en auto refresh admin:', error);
    } finally {
      this.isAutoRefreshing = false;
    }
  },

  async eliminarUsuario(id) {
    const confirmar = confirm('Esta accion eliminara el usuario de forma permanente. Deseas continuar?');
    if (!confirmar) return;

    try {
      const response = await api.eliminarUsuario(id);
      if (response.success) {
        alert(response.message || 'Usuario eliminado correctamente');
        await this.cargarUsuarios();
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }
};

// Inicializar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AdminModule.init());
} else {
  AdminModule.init();
}
