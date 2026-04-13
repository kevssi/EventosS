// Módulo de administración
const AdminModule = {
  usuario: null,
  usuarios: [],
  administradores: [],
  solicitudes: [],
  resumenSolicitudes: null,
  filtroSolicitudes: null,
  solicitudSeleccionadaId: null,
  solicitudesError: '',
  tab_activo: 'dashboard',

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
  },

  verificarPermiso() {
    if (!this.isAdminRole(this.usuario?.rol)) {
      window.location.href = 'inicio.html';
    }
  },

  async cargarDatos() {
    await this.cargarReportesAdmin();
    await this.cargarUsuarios();
    await this.cargarSolicitudesOrganizador();
    await this.cargarAdministradores();
    this.renderCrearAdmin();
    this.renderPasswordAdmin();
  },

  async cargarReportesAdmin() {
    try {
      const response = await api.reporteGeneralAdmin();
      this.renderDashboard(response);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
    }
  },

  renderDashboard(response) {
    const container = document.querySelector('#tabDashboard');
    if (!container) return;

    const resumen = response.resumen;
    const topEventos = response.top_eventos;

    container.innerHTML = `
      <div class="resumen-cards">
        <div class="resumen-card success">
          <h3>Usuarios Activos</h3>
          <div class="valor">${resumen.total_usuarios}</div>
        </div>
        <div class="resumen-card">
          <h3>Eventos Publicados</h3>
          <div class="valor">${resumen.eventos_activos}</div>
        </div>
        <div class="resumen-card warning">
          <h3>Boletos Vendidos</h3>
          <div class="valor">${resumen.boletos_vendidos}</div>
        </div>
        <div class="resumen-card danger">
          <h3>Ingresos Totales</h3>
          <div class="valor">$${parseFloat(resumen.ingresos_totales).toFixed(2)}</div>
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
        <table>
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

  async cargarSolicitudesOrganizador(estado = this.filtroSolicitudes) {
    try {
      const response = await api.listarSolicitudesOrganizador(estado || null);
      this.solicitudes = response.solicitudes || [];
      if (!this.solicitudSeleccionadaId && this.solicitudes.length > 0) {
        this.solicitudSeleccionadaId = Number(this.solicitudes[0].id);
      }

      if (this.solicitudes.length > 0) {
        const existeSeleccion = this.solicitudes.some((item) => Number(item.id) === Number(this.solicitudSeleccionadaId));
        if (!existeSeleccion) {
          this.solicitudSeleccionadaId = Number(this.solicitudes[0].id);
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
    const opcionesSolicitudes = this.solicitudes.map((solicitud) => {
      const selected = Number(solicitud.id) === Number(solicitudSeleccionada?.id) ? 'selected' : '';
      return `<option value="${solicitud.id}" ${selected}>#${solicitud.id} - ${this.escapeHtml(solicitud.nombre_completo)} (${this.escapeHtml(solicitud.estado)})</option>`;
    }).join('');

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
          <div class="solicitud-selector-wrap">
            <label for="selectorSolicitud" class="solicitud-selector-label">Selecciona la solicitud que deseas revisar</label>
            <select id="selectorSolicitud" class="solicitud-selector" onchange="AdminModule.seleccionarSolicitud(this.value)">
              ${opcionesSolicitudes}
            </select>
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
          ` : ''}
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
    if (formCrearAdmin) {
      formCrearAdmin.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.crearAdminDesdeFormulario();
      });
    }

    const formPasswordAdmin = document.querySelector('#formPasswordAdmin');
    if (formPasswordAdmin) {
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
            ${this.usuarios.map(usuario => `
              <tr>
                <td>${usuario.nombre}</td>
                <td>${usuario.email}</td>
                <td>${usuario.rol}</td>
                <td>${usuario.compras_realizadas}</td>
                <td>
                  <span class="badge ${usuario.activo ? 'badge-success' : 'badge-danger'}">
                    ${usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td class="acciones">
                  <button class="btn btn-accion btn-${usuario.activo ? 'danger' : 'success'}" 
                          onclick="AdminModule.cambiarEstadoUsuario(${usuario.id}, ${!usuario.activo})">
                    ${usuario.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  setupEventListeners() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.cambiarTab(e.target.dataset.tab);
      });
    });
  },

  cambiarTab(tabNombre) {
    this.tab_activo = tabNombre;

    // Actualizar tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabNombre}"]`).classList.add('active');

    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.querySelector(`#tab${tabNombre.charAt(0).toUpperCase() + tabNombre.slice(1)}`).classList.add('active');
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
  }
};

// Inicializar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AdminModule.init());
} else {
  AdminModule.init();
}
