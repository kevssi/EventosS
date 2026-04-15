// Módulo de administración
const AdminModule = {
  usuario: null,
  usuarios: [],
  filtroNombreUsuarios: '',
  administradores: [],
  eventos: [],
  categoriasEvento: [],
  topEventosVentas: [],
  historialComprasUsuarioActual: null,
  historialCompras: [],
  reporteEventoSeleccionado: null,
  resultadoValidacionQR: null,
  ultimoQRIngresado: '',
  validandoQR: false,
  solicitudes: [],
  resumenSolicitudes: null,
  filtroSolicitudes: null,
  solicitudSeleccionadaId: null,
  solicitudesError: '',
  tab_activo: 'dashboard',
  autoRefreshMs: 25000,
  autoRefreshTimer: null,
  isAutoRefreshing: false,
  loadedTabs: {
    dashboard: false,
    eventos: false,
    usuarios: false,
    ventas: false,
    solicitudes: false,
    crearAdmin: false,
    passwordAdmin: false
  },

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

  getFirstValue(source, keys, fallback = '') {
    if (!source || typeof source !== 'object') return fallback;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return fallback;
  },

  normalizarImagenUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('publi/')) return `/${raw}`;
    if (raw.startsWith('uploads/')) return `/publi/${raw}`;
    return raw;
  },

  parseZonasDesdeDescripcion(descripcion) {
    const text = String(descripcion || '');
    if (!text) return [];

    const lines = text.split('\n').map((line) => line.trim());
    const zonas = [];

    lines.forEach((line) => {
      const match = line.match(/^\*\s*(.+?):\s*cupo\s*(\d+)\s*,\s*precio\s*([\d.]+)/i);
      if (!match) return;

      zonas.push({
        activa: true,
        nombre: match[1].trim(),
        cupo: Number(match[2]) || '',
        precio: Number(match[3]) || ''
      });
    });

    return zonas;
  },

  normalizarEstadoEvento(estado) {
    const value = String(estado || '').toLowerCase().trim();
    return value === 'cancelado' ? 'cancelado' : 'publicado';
  },

  isAdminRole(rol) {
    const value = (rol ?? '').toString().trim().toLowerCase();
    return value === 'administrador' || value === 'admin' || value === '3';
  },

  resolveUserRoleValue(usuario) {
    if (!usuario || typeof usuario !== 'object') return '';
    return usuario.rol ?? usuario.role ?? usuario.rol_id ?? usuario.id_rol ?? usuario.idRol ?? '';
  },

  async init() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    this.verificarPermiso();
    this.renderCrearAdmin();
    this.renderPasswordAdmin();
    await this.ensureTabData('dashboard');
    this.setupEventListeners();
    this.bindForms();
    this.startAutoRefresh();
  },

  verificarPermiso() {
    if (!this.isAdminRole(this.resolveUserRoleValue(this.usuario))) {
      window.location.href = 'inicio.html';
    }
  },

  async ensureTabData(tabNombre, force = false) {
    if (!tabNombre) return;

    if (!force && this.loadedTabs[tabNombre]) {
      return;
    }

    if (tabNombre === 'dashboard') {
      await this.cargarReportesAdmin();
      this.loadedTabs.dashboard = true;
      return;
    }

    if (tabNombre === 'eventos') {
      await Promise.all([this.cargarCategoriasEvento(), this.cargarEventosAdmin()]);
      this.loadedTabs.eventos = true;
      return;
    }

    if (tabNombre === 'usuarios') {
      await this.cargarUsuarios();
      this.loadedTabs.usuarios = true;
      return;
    }

    if (tabNombre === 'ventas') {
      if (!this.loadedTabs.eventos) {
        await this.cargarEventosAdmin();
        this.loadedTabs.eventos = true;
      }
      await this.cargarReportesAdmin();
      this.renderVentas();
      this.loadedTabs.ventas = true;
      this.loadedTabs.dashboard = true;
      return;
    }

    if (tabNombre === 'solicitudes') {
      await this.cargarSolicitudesOrganizador();
      this.loadedTabs.solicitudes = true;
      return;
    }

    if (tabNombre === 'crearAdmin' || tabNombre === 'passwordAdmin') {
      await this.cargarAdministradores();
      this.loadedTabs.crearAdmin = true;
      this.loadedTabs.passwordAdmin = true;
    }
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
      this.usuarios = response.usuarios || [];
      this.renderUsuarios();
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  },

  actualizarFiltroUsuariosNombre(value) {
    this.filtroNombreUsuarios = String(value || '').trim();
    this.renderUsuarios();
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
    const publicados = this.eventos.filter((evento) => this.normalizarEstadoEvento(evento.estado) === 'publicado').length;
    const cancelados = this.eventos.filter((evento) => this.normalizarEstadoEvento(evento.estado) === 'cancelado').length;

    const categoryOptions = this.categoriasEvento.map((categoria) => (
      `<option value="${categoria.id}">${this.escapeHtml(categoria.nombre)}</option>`
    )).join('');

    container.innerHTML = `
      <div class="resumen-cards">
        <div class="resumen-card"><h3>Total Eventos</h3><div class="valor">${total}</div></div>
        <div class="resumen-card success"><h3>Publicados</h3><div class="valor">${publicados}</div></div>
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
            ${this.eventos.length === 0 ? '<tr><td colspan="8" style="text-align:center; color: var(--text-light);">No hay eventos registrados.</td></tr>' : this.eventos.map((evento) => {
              const estadoNormalizado = this.normalizarEstadoEvento(evento.estado);
              const estadoBadge = estadoNormalizado === 'cancelado' ? 'danger' : 'success';
              return `
              <tr>
                <td>${this.escapeHtml(evento.titulo)}</td>
                <td>${this.formatDate(evento.fecha_inicio)}</td>
                <td>${this.escapeHtml(evento.ubicacion || '-')}</td>
                <td>${this.escapeHtml(evento.categoria || '-')}</td>
                <td>${this.formatCurrency(evento.precio_desde)}</td>
                <td>${Number(evento.boletos_disponibles || 0)}</td>
                <td><span class="badge badge-${estadoBadge}">${this.escapeHtml(estadoNormalizado)}</span></td>
                <td>
                  <div class="acciones-evento">
                    <button class="btn btn-accion btn-outline" onclick="AdminModule.mostrarModalEvento(${Number(evento.id)})">Editar</button>
                    <button class="btn btn-accion btn-danger" onclick="AdminModule.cancelarEventoAdmin(${Number(evento.id)})">Eliminar</button>
                  </div>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    window.NavbarModule?.renderLucideIcons?.(container);
  },

  async mostrarModalEvento(eventoId) {
    const eventoResumen = eventoId ? this.eventos.find((item) => Number(item.id) === Number(eventoId)) : null;
    let evento = eventoResumen;
    let tiposBoleto = [];

    if (eventoId) {
      try {
        const detalle = await api.obtenerEvento(eventoId);
        if (detalle?.evento && typeof detalle.evento === 'object') {
          evento = {
            ...(eventoResumen || {}),
            ...detalle.evento
          };
        }
        tiposBoleto = Array.isArray(detalle?.tipos_boleto) ? detalle.tipos_boleto : [];
      } catch (_error) {
        tiposBoleto = [];
      }
    }

    const imagenActual = this.normalizarImagenUrl(evento?.imagen_url || '');

    const zonasDesdeTipos = [0, 1, 2].map((index) => {
      const tipo = tiposBoleto[index] || {};
      return {
        activa: Boolean(tipo?.nombre),
        nombre: String(tipo?.nombre || ''),
        cupo: Number(tipo?.cantidad ?? tipo?.cantidad_total ?? tipo?.cantidad_disponible ?? tipo?.disponibles ?? 0) || '',
        precio: Number(tipo?.precio ?? 0) || ''
      };
    });

    const zonasDesdeDescripcion = this.parseZonasDesdeDescripcion(evento?.descripcion || '');
    const zonasFuente = zonasDesdeTipos.some((z) => z.nombre)
      ? zonasDesdeTipos
      : [0, 1, 2].map((index) => zonasDesdeDescripcion[index] || { activa: false, nombre: '', cupo: '', precio: '' });

    const zonas = zonasFuente;

    if (!zonas[0].nombre) zonas[0].activa = true;
    if (!zonas[1].nombre) zonas[1].activa = true;
    const categoryOptions = this.categoriasEvento.map((c) => (
      `<option value="${c.id}" ${Number(evento?.id_categoria || evento?.categoria_id) === Number(c.id) ? 'selected' : ''}>${this.escapeHtml(c.nombre)}</option>`
    )).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalEventoOverlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h2>${evento ? 'Editar evento' : 'Nuevo evento'}</h2>
        <form id="formGestionEvento">
          <input type="hidden" id="eventoIdEditar" value="${evento ? evento.id : ''}">
          <input type="hidden" id="eventoImagenActual" value="${this.escapeHtml(imagenActual || '')}">
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
            <label>Zonas y precios</label>
            <div class="modal-zonas-grid">
              <div class="modal-zona-item">
                <label class="check-item"><input type="checkbox" id="zona1Activa" ${zonas[0].activa ? 'checked' : ''}> <span>Zona 1</span></label>
                <input type="text" id="zona1Nombre" placeholder="Nombre" value="${this.escapeHtml(zonas[0].nombre)}">
                <input type="number" id="zona1Cupo" min="0" step="1" placeholder="Cupo" value="${zonas[0].cupo}">
                <input type="number" id="zona1Precio" min="0" step="0.01" placeholder="Precio" value="${zonas[0].precio}">
              </div>
              <div class="modal-zona-item">
                <label class="check-item"><input type="checkbox" id="zona2Activa" ${zonas[1].activa ? 'checked' : ''}> <span>Zona 2</span></label>
                <input type="text" id="zona2Nombre" placeholder="Nombre" value="${this.escapeHtml(zonas[1].nombre)}">
                <input type="number" id="zona2Cupo" min="0" step="1" placeholder="Cupo" value="${zonas[1].cupo}">
                <input type="number" id="zona2Precio" min="0" step="0.01" placeholder="Precio" value="${zonas[1].precio}">
              </div>
              <div class="modal-zona-item">
                <label class="check-item"><input type="checkbox" id="zona3Activa" ${zonas[2].activa ? 'checked' : ''}> <span>Zona 3</span></label>
                <input type="text" id="zona3Nombre" placeholder="Nombre" value="${this.escapeHtml(zonas[2].nombre)}">
                <input type="number" id="zona3Cupo" min="0" step="1" placeholder="Cupo" value="${zonas[2].cupo}">
                <input type="number" id="zona3Precio" min="0" step="0.01" placeholder="Precio" value="${zonas[2].precio}">
              </div>
            </div>
          </div>
          <div class="form-group">
            <label for="eventoImagenFile">Imagen del evento (archivo)</label>
            <input type="file" id="eventoImagenFile" accept="image/*">
            <small class="modal-help-text">Si eliges un archivo, reemplazara la URL de imagen actual.</small>
            <img id="eventoImagenPreview" class="admin-imagen-preview" src="${this.escapeHtml(imagenActual || '')}" alt="Vista previa" style="${imagenActual ? '' : 'display:none;'}">
          </div>
          <div class="form-group">
            <label for="eventoEstado">Estado</label>
            <select id="eventoEstado">
              <option value="publicado" ${(evento?.estado || 'publicado') === 'publicado' ? 'selected' : ''}>Publicado</option>
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
    const fileInput = overlay.querySelector('#eventoImagenFile');

    const actualizarEstadoZona = (idx) => {
      const isActive = overlay.querySelector(`#zona${idx}Activa`)?.checked;
      ['Nombre', 'Cupo', 'Precio'].forEach((suffix) => {
        const input = overlay.querySelector(`#zona${idx}${suffix}`);
        if (!input) return;
        input.disabled = !isActive;
      });
    };

    const actualizarPreview = () => {
      const preview = overlay.querySelector('#eventoImagenPreview');
      if (!preview) return;

      if (preview.dataset.objectUrl) {
        URL.revokeObjectURL(preview.dataset.objectUrl);
        delete preview.dataset.objectUrl;
      }

      const selectedFile = fileInput?.files?.[0];
      if (selectedFile) {
        const objectUrl = URL.createObjectURL(selectedFile);
        preview.dataset.objectUrl = objectUrl;
        preview.src = objectUrl;
        preview.style.display = 'block';
        return;
      }

      const normalizedUrl = this.normalizarImagenUrl(overlay.querySelector('#eventoImagenActual')?.value || '');
      if (normalizedUrl) {
        preview.src = normalizedUrl;
        preview.style.display = 'block';
      } else {
        preview.src = '';
        preview.style.display = 'none';
      }
    };

    fileInput?.addEventListener('change', actualizarPreview);
    [1, 2, 3].forEach((idx) => {
      overlay.querySelector(`#zona${idx}Activa`)?.addEventListener('change', () => actualizarEstadoZona(idx));
      actualizarEstadoZona(idx);
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.cerrarModalEvento(); });
    overlay.querySelector('#formGestionEvento').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.guardarEventoDesdeFormulario();
    });
  },

  cerrarModalEvento() {
    const overlay = document.getElementById('modalEventoOverlay');
    const preview = overlay?.querySelector('#eventoImagenPreview');
    if (preview?.dataset?.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
    }
    overlay?.remove();
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
    const imagenFile = document.querySelector('#eventoImagenFile')?.files?.[0] || null;
    let imagenUrl = this.normalizarImagenUrl(document.querySelector('#eventoImagenActual')?.value?.trim() || null);

    if (imagenFile) {
      try {
        const fd = new FormData();
        fd.append('imagen', imagenFile);
        const uploadRes = await api.subirImagen(fd);
        imagenUrl = this.normalizarImagenUrl(uploadRes?.imagen_url || null);
      } catch (error) {
        alert('No se pudo subir la imagen: ' + error.message);
        return;
      }
    }

    const payload = {
      titulo: document.querySelector('#eventoTitulo')?.value?.trim(),
      descripcion: document.querySelector('#eventoDescripcion')?.value?.trim() || null,
      fecha_inicio: document.querySelector('#eventoFechaInicio')?.value,
      fecha_fin: document.querySelector('#eventoFechaFin')?.value || null,
      ubicacion: document.querySelector('#eventoUbicacion')?.value?.trim(),
      capacidad: Number(document.querySelector('#eventoCapacidad')?.value || 0),
      id_categoria: Number(document.querySelector('#eventoCategoria')?.value || 0) || null,
      imagen_url: imagenUrl,
      estado: document.querySelector('#eventoEstado')?.value || 'publicado'
    };

    const parseZona = (idx) => {
      const activa = Boolean(document.querySelector(`#zona${idx}Activa`)?.checked);
      if (!activa) return null;

      const nombre = document.querySelector(`#zona${idx}Nombre`)?.value?.trim() || '';
      const cupo = Number(document.querySelector(`#zona${idx}Cupo`)?.value || 0);
      const precio = Number(document.querySelector(`#zona${idx}Precio`)?.value || 0);

      if (!nombre) return null;
      if (!Number.isFinite(cupo) || cupo <= 0) return null;
      if (!Number.isFinite(precio) || precio < 0) return null;

      return { nombre, cupo, precio, activa: true };
    };

    const zonas = [parseZona(1), parseZona(2), parseZona(3)].filter(Boolean);
    if (zonas.length > 0) {
      payload.zonas = zonas;
    }

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

  renderResultadoValidacionQR() {
    const estado = this.resultadoValidacionQR;
    if (!estado) {
      return '<p class="qr-validacion-empty">Escanea o pega un código QR para validar el acceso y mostrar los datos del boleto.</p>';
    }

    const boleto = estado.boleto || {};
    const evento = this.getFirstValue(boleto, ['evento', 'titulo_evento', 'nombre_evento'], 'Evento no identificado');
    const tipoBoleto = this.getFirstValue(boleto, ['tipo_boleto', 'tipo', 'zona'], 'Tipo no disponible');
    const ubicacion = this.getFirstValue(boleto, ['ubicacion', 'lugar', 'sede'], 'Ubicación no disponible');
    const fechaEventoRaw = this.getFirstValue(boleto, ['fecha_evento', 'fecha_inicio', 'fecha'], null);
    const usuarioNombre = this.getFirstValue(boleto, ['usuario_nombre', 'nombre_usuario', 'usuario'], 'Sin nombre');
    const usuarioEmail = this.getFirstValue(boleto, ['usuario_email', 'email', 'correo'], 'Sin email');
    const codigoQR = this.getFirstValue(boleto, ['codigo_qr'], this.ultimoQRIngresado || 'N/A');
    const boletoId = this.getFirstValue(boleto, ['boleto_id', 'id', 'id_boleto'], estado.boleto_id || 'N/A');
    const estadoBoleto = String(this.getFirstValue(boleto, ['estado_boleto', 'estado', 'status'], estado.success ? 'usado' : 'error')).toLowerCase();
    const fechaUsoRaw = this.getFirstValue(boleto, ['fecha_uso', 'used_at', 'fecha_validacion'], null);

    const isUsedState = /usad|validad|canjead|consumid/.test(estadoBoleto);
    const badgeClass = estado.success
      ? 'badge-success'
      : (isUsedState ? 'badge-warning' : 'badge-danger');
    const badgeLabel = estado.success
      ? 'ACCESO PERMITIDO'
      : (isUsedState ? 'YA UTILIZADO' : 'NO VÁLIDO');

    return `
      <div class="qr-validacion-ticket ${estado.success ? 'ok' : 'error'}">
        <div class="qr-ticket-header">
          <div class="qr-brand">eventos+</div>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <h3>${this.escapeHtml(evento)}</h3>
        <p class="qr-ticket-message">${this.escapeHtml(estado.message || 'Resultado de validación disponible')}</p>
        <div class="qr-ticket-grid">
          <div><strong>ID boleto</strong><span>${this.escapeHtml(String(boletoId))}</span></div>
          <div><strong>Tipo</strong><span>${this.escapeHtml(String(tipoBoleto))}</span></div>
          <div><strong>Fecha evento</strong><span>${this.escapeHtml(this.formatDate(fechaEventoRaw))}</span></div>
          <div><strong>Ubicación</strong><span>${this.escapeHtml(String(ubicacion))}</span></div>
          <div><strong>Asistente</strong><span>${this.escapeHtml(String(usuarioNombre))}</span></div>
          <div><strong>Email</strong><span>${this.escapeHtml(String(usuarioEmail))}</span></div>
        </div>
        <div class="qr-ticket-code">
          <strong>Código QR</strong>
          <code>${this.escapeHtml(String(codigoQR))}</code>
        </div>
        ${fechaUsoRaw ? `<p class="qr-ticket-foot">Usado/validado en: ${this.escapeHtml(this.formatDate(fechaUsoRaw))}</p>` : ''}
      </div>
    `;
  },

  handleQRValidatorKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.validarBoletoQR();
  },

  async validarBoletoQR() {
    if (this.validandoQR) return;

    const input = document.querySelector('#qrValidatorInput');
    const qrCode = String(input?.value || '').trim();

    if (!qrCode) {
      alert('Ingresa o escanea un código QR para validar.');
      return;
    }

    this.validandoQR = true;
    this.ultimoQRIngresado = qrCode;

    try {
      const response = await api.usarBoleto(qrCode);
      this.resultadoValidacionQR = {
        success: true,
        message: response?.message || 'Boleto validado correctamente',
        boleto_id: response?.boleto_id || null,
        boleto: response?.boleto || null
      };
    } catch (error) {
      const payload = error?.payload || {};
      this.resultadoValidacionQR = {
        success: false,
        message: payload?.message || error?.message || 'No se pudo validar el boleto',
        boleto_id: payload?.boleto_id || null,
        boleto: payload?.boleto || null
      };
    } finally {
      this.validandoQR = false;
      this.renderVentas();
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

      <div class="card qr-validacion-card-wrap" style="margin-bottom: 16px;">
        <div class="card-header">
          <h2>Validador QR de acceso</h2>
        </div>
        <p style="margin: 0 0 12px; color: var(--text-light);">Cada boleto es de uso único. Si se intenta escanear de nuevo, se marcará como ya utilizado.</p>
        <div class="qr-validacion-controls">
          <input
            id="qrValidatorInput"
            type="text"
            autocomplete="off"
            placeholder="Escanea o pega aquí el código QR"
            value="${this.escapeHtml(this.ultimoQRIngresado || '')}"
            onkeydown="AdminModule.handleQRValidatorKeydown(event)"
          >
          <button class="btn btn-primary" onclick="AdminModule.validarBoletoQR()" ${this.validandoQR ? 'disabled' : ''}>${this.validandoQR ? 'Validando...' : 'Validar boleto'}</button>
        </div>
        <div class="qr-validacion-result">
          ${this.renderResultadoValidacionQR()}
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

    const filtro = String(this.filtroNombreUsuarios || '').trim().toLowerCase();
    const usuariosFiltrados = !filtro
      ? this.usuarios
      : this.usuarios.filter((usuario) => String(usuario?.nombre || '').toLowerCase().includes(filtro));

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Gestión de Usuarios</h2>
        </div>
        <div class="usuarios-buscador-wrap">
          <label class="usuarios-buscador-label" for="buscarUsuarioNombre">Buscar por nombre</label>
          <div class="usuarios-buscador-input-wrap">
            <i data-lucide="search" aria-hidden="true"></i>
            <input
              id="buscarUsuarioNombre"
              type="text"
              placeholder="Escribe un nombre..."
              value="${this.escapeHtml(this.filtroNombreUsuarios)}"
              oninput="AdminModule.actualizarFiltroUsuariosNombre(this.value)"
            >
          </div>
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
            ${usuariosFiltrados.length === 0
              ? '<tr><td colspan="6" style="text-align:center; color: var(--text-light);">No se encontraron usuarios con ese nombre.</td></tr>'
              : usuariosFiltrados.map(usuario => {
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

    window.NavbarModule?.renderLucideIcons?.(container);
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

  async cambiarTab(tabNombre) {
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

    await this.ensureTabData(tabNombre);
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
