// Módulo de administración
const AdminModule = {
  usuario: null,
  usuarios: [],
  administradores: [],
  solicitudes: [],
  resumenSolicitudes: null,
  filtroSolicitudes: null,
  solicitudesError: '',
  tab_activo: 'dashboard',

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
      this.resumenSolicitudes = response.resumen || null;
      this.filtroSolicitudes = estado || null;
      this.solicitudesError = '';
      this.renderSolicitudesOrganizador();
    } catch (error) {
      console.error('Error al cargar solicitudes de organizador:', error);
      this.solicitudes = [];
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
            <span>⚠️</span>
            <span>${this.solicitudesError}</span>
          </div>
        ` : ''}

        ${this.solicitudes.length === 0 ? `
          <div class="solicitudes-empty">No hay solicitudes para el filtro seleccionado.</div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Organizacion</th>
                <th>Experiencia</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Revision</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${this.solicitudes.map((solicitud) => `
                <tr>
                  <td>
                    <strong>${solicitud.nombre_completo}</strong><br>
                    <small>${solicitud.email}</small>
                  </td>
                  <td>${solicitud.organizacion}</td>
                  <td class="solicitud-experiencia">${solicitud.experiencia}</td>
                  <td>
                    <span class="badge badge-${solicitud.estado === 'aprobada' ? 'success' : solicitud.estado === 'rechazada' ? 'danger' : 'pending'}">${solicitud.estado}</span>
                    ${solicitud.motivo_rechazo ? `<br><small>Motivo: ${solicitud.motivo_rechazo}</small>` : ''}
                  </td>
                  <td>${new Date(solicitud.fecha_solicitud).toLocaleString()}</td>
                  <td>
                    ${solicitud.admin_revision_nombre || '-'}
                    ${solicitud.fecha_revision ? `<br><small>${new Date(solicitud.fecha_revision).toLocaleString()}</small>` : ''}
                  </td>
                  <td class="acciones">
                    ${solicitud.estado === 'pendiente' ? `
                      <button class="btn btn-accion btn-secondary" onclick="AdminModule.aprobarSolicitud(${solicitud.id})">Aprobar</button>
                      <button class="btn btn-accion btn-danger" onclick="AdminModule.rechazarSolicitud(${solicitud.id})">Rechazar</button>
                    ` : '<span style="color: var(--text-light);">Sin acciones</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  },

  async filtrarSolicitudes(estado) {
    await this.cargarSolicitudesOrganizador(estado || null);
    if (this.tab_activo !== 'solicitudes') {
      this.cambiarTab('solicitudes');
    }
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
            <input type="text" id="adminTelefono">
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
    const telefono = document.querySelector('#adminTelefono')?.value?.trim();
    const password = document.querySelector('#adminPassword')?.value;

    if (!nombre || !email || !password) {
      alert('Completa nombre, email y contraseña.');
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
